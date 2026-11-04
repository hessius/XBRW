# Issue: "Machine connection changed" error persists and doesn't auto-dismiss

## Summary
A rare "The machine connection changed" status message appears and doesn't dismiss without restarting the app. It should auto-dismiss after a timeout or when the machine connection stabilizes.

## Current Behavior
- Error message "The machine connection changed" appears in the brew screen
- Displayed in `app/brew.tsx` lines 795-797:
```tsx
{error !== null && phase.name !== "failed" && (
    <Text color={palette.danger} fontSize={13}>{error}</Text>
)}
```
- The `error` state comes from `useBrew.ts` which sets it via `setError((e as Error).message)` in various catch blocks
- Once set, the error persists until the next brew operation calls `setError(null)` (at the start of `brew()`, `startBrew()`, `pauseBrew()`, `resumeBrew()`, `switchToProAndRetry()`)

## Where the Error Originates
In `library/machine/Machine.ts`, "The machine connection changed" is thrown in many places:
- Line 1031: `connectAttempt` - generation mismatch after connect
- Line 1149: `shakeHands` - generation mismatch during handshake
- Line 1312: `writeFrame` - generation mismatch during write
- Line 1611: `brewAttempt` - generation mismatch during brew
- Line 1618: `brewAttempt` - generation mismatch after verifyTarget
- Line 1626: `brewAttempt` - generation mismatch after clearForBrew
- Line 1704: `brewOnce` - generation mismatch after sendPaced (wrapped in `BrewUploadError`)
- Line 1768: `startBrew` - generation mismatch during brew start
- Line 1922: `cancelOnce` - generation mismatch during cancellation
- Line 1963: `clearForBrew` - generation mismatch during brew preparation
- Line 1990: `cancelBrew` - generation mismatch during cancellation

The error is thrown when `generation !== this.generation`, meaning a new connection attempt started while an operation was in progress.

## Problem
1. **No auto-dismissal**: The error stays on screen indefinitely until user starts a new brew action
2. **Unclear trigger**: User doesn't know what caused it (reconnect? background/foreground? machine switched?)
3. **No recovery guidance**: Just says "connection changed" without actionable next steps
4. **Blocks UI**: Shows in red as an error, but isn't necessarily actionable

## Desired Behavior
1. **Auto-dismiss after timeout**: Error should fade/clear after ~5-10 seconds
2. **Auto-clear on connection stabilization**: If the machine reconnects and is ready, clear the error
3. **Better messaging**: More context about what happened (e.g., "Connection was interrupted. Reconnecting…")
4. **Non-blocking display**: Consider showing as a transient toast/banner rather than persistent error text

## Implementation Approach
Options:
1. **Timeout-based dismissal in `useBrew.ts`**: Add a `setTimeout` to clear error after N seconds for "connection changed" errors
2. **Connection state listener**: Listen to machine connection state and clear error when `isConnected()` and `info !== null`
3. **Error categorization**: Distinguish "connection changed" from other errors, handle differently
4. **Toast instead of inline error**: Use `notify()` for transient connection messages

## Files to Modify
- `hooks/useBrew.ts` - Add auto-dismiss logic for connection changed errors
- Potentially `library/machine/Machine.ts` - Provide better error categorization
- `app/brew.tsx` - Consider changing error display to transient toast

## Testing
- Trigger "connection changed" by switching machines mid-brew
- Verify error auto-dismisses after timeout
- Verify error clears when machine reconnects successfully
- Test that legitimate errors (water, beans, etc.) still persist until addressed
- Test background/foreground transitions