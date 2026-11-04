# Issue: Auto-retry on "Machine busy" instead of requiring manual "Try again"

## Summary
Brews occasionally fail to start with a "machine busy" message, but can be started successfully by manually pressing "Try again". This should happen automatically since it's an easy fix.

## Current Behavior
1. **Pre-flight check fails**: In `Machine.ts` `brewBlock()` method (lines 1532-1540):
```typescript
const state = this.freshState();
if (state !== null) {
    const fault = FAULT_BLOCKS[state];
    if (fault !== undefined) return fault;
    if (!STARTABLE.has(state)) {
        return {kind: "busy", message: "The machine is busy. Wait for it to finish."};
    }
}
```
2. **Error shown in UI**: In `brew.tsx`, the blocked phase shows:
   - Headline: "THE MACHINE IS BUSY" (from `BLOCKED_HEADLINE.busy`)
   - Detail: "The machine is busy. Wait for it to finish."
   - "Try again" button (Action component) appears

3. **User must manually press "Try again"**: Which calls `start(recipe, quickEditRecord)` to retry

## Log Analysis (from user report)
```
05:56:47.480  →  58 01 01 A4 1F 14 00 00 00 01 B9 00 00 00 01 00 00 00 BD D1
05:56:47.545  ←ffe2  58 02 07 A4 1F 0C 00 00 00 C1 90 B8  event 8100
05:56:48.173  ←ffe2  58 02 07 4B 1F 0C 00 00 00 C1 FC 83  event 8011
05:56:48.654  ←ffe2  58 02 07 57 1F 10 00 00 00 C1 1D 00 00 00 B8 67  state 0x1d loading
05:56:48.743  ←ffe2  58 02 07 49 9E 4B 00 00 00 C1 4A 31 35 41 30 31 42 35 41 46 32 33 31 FF FF FF FF FF FF 56 31 32 2E 30 44 2E 35 30 30 80 42 C5 47 01 00 01 00 53 0F DC 01 01 1D A3 01 00 00 40 1E 6C 43 91 32 78 56 00 00 00 00 00 00 00 00 50 5E  V12.0D.500 PRO
05:56:49.585  ←ffe2  58 02 07 57 1F 10 00 00 00 C1 41 00 00 00 9A 25  state 0x41 complete (Easy idle)
```

**Timeline:**
- 05:56:47.480: App sends handshake (8100)
- 05:56:47.545: Machine acknowledges handshake (8100 response)
- 05:56:48.173: Machine sends event 8011 (info request?)
- 05:56:48.654: Machine reports state 0x1D (LOADING)
- 05:56:48.743: Machine sends info frame (40521) - V12.0D.500 PRO
- 05:56:49.585: Machine reports state 0x41 (COMPLETE/IDLE)

**Issue**: At 05:56:48.654, machine is in state 0x1D (LOADING), which is NOT in `STARTABLE` (IDLE=0x41, COMPLETE=0x41, READY=0x1F). The pre-flight check at `brewBlock()` sees this transient LOADING state and returns "busy".

But by 05:56:49.585 (less than 1 second later), the machine is already at 0x41 (IDLE/COMPLETE) - a startable state.

## Root Cause
The `brewBlock()` check runs **before** the machine has fully transitioned from LOADING to IDLE after the handshake/info exchange. The machine briefly reports LOADING (0x1D) while processing the handshake and sending its info frame.

## Desired Behavior
1. **Auto-retry for transient "busy"**: If `brewBlock` returns "busy" due to a transient state (LOADING, etc.), automatically retry after a short delay
2. **Max retry attempts**: Limit to 2-3 attempts with brief delays
3. **Only for specific states**: Only auto-retry when the machine is in a transient non-startable state (LOADING, SAVING_SLOTS), not for genuinely busy states (GRINDING, POURING, etc.)
4. **Preserve manual "Try again"**: Keep the button for cases where auto-retry fails or user wants to intervene

## Implementation Approach
Options:

### Option A: Retry in `useBrew.ts` `brew()` method
- Catch "busy" error, wait briefly, retry once
- Check if the busy state is transient (LOADING, SAVING_SLOTS) vs persistent (GRINDING, POURING)

### Option B: Retry in `Machine.ts` `brewBlock()` or `brewAttempt()`
- `brewBlock()` could detect transient states and return a special "retry" signal
- `brewAttempt()` could handle the retry internally

### Option C: State machine improvement
- Wait for machine to reach STARTABLE state before checking `brewBlock()`
- Already partially done in `brewAttempt()` with `askHowItIsDoing()` for stale vitals

## Key Consideration: `STARTABLE` states
From `Machine.ts` line 248-250:
```typescript
const STARTABLE = new Set<number>([
    MACHINE_STATE.IDLE, MACHINE_STATE.COMPLETE, MACHINE_STATE.READY
]);
```

States that are NOT startable but are transient:
- `MACHINE_STATE.LOADING` (0x1D) - machine booting/processing handshake
- `MACHINE_STATE.SAVING_SLOTS` (0x1E) - writing Easy Mode slots

States that are genuinely busy (should NOT auto-retry):
- `MACHINE_STATE.GRINDING` (0x1F) - actively grinding
- `MACHINE_STATE.POURING` (0x57) - actively pouring
- `MACHINE_STATE.BREWING` - other active brew states

## Files to Modify
- `hooks/useBrew.ts` - Add auto-retry logic in `brew()` method
- OR `library/machine/Machine.ts` - Improve `brewBlock()` / `brewAttempt()` to handle transient states
- `constants/machine.ts` - Verify state constants

## Testing
- Simulate machine in LOADING state during brew start
- Verify auto-retry happens within ~1-2 seconds
- Verify max 2-3 retry attempts
- Verify manual "Try again" still works
- Verify genuine busy states (grinding, pouring) don't auto-retry
- Test with the exact log sequence from user report