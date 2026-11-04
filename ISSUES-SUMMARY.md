# XBRW++ - Prepared Issues Summary

This document summarizes the four issues prepared for implementation based on testing observations.

---

## 1. Style "Copy diagnostic log" as a button and gate behind Labs

**File:** `ISSUE-copy-diagnostic-log-button.md`

**Problem:** When a brew fails, "Copy diagnostic log" appears as plain branded text (via `LinkText`). Should be a visible button and only for Labs users.

**Location:** `app/brew.tsx` line 788-790

**Changes needed:**
- Add `labsUnlocked` setting via `useSetting("labsUnlocked")`
- Conditionally render button-styled "Copy diagnostic log" (using `Action` component style)
- Only show when `labsUnlocked === true`

---

## 2. Brew Stage Ladder compresses incorrectly at 3+ stages

**File:** `ISSUE-ladder-compression.md`

**Problem:** With 3+ stages, the ladder starts with good proportions but compresses mid-brew. Available space appears smaller than at brew start.

**Locations:**
- `app/brew.tsx` - `flexHeight` measurement and `PhaseHeadline` reserve
- `components/BrewStageLadder.tsx` - ladder rendering with `fill={true}`
- `library/brew/bands.ts` - `allocateBands()` priority allocation

**Root causes hypothesized:**
1. `flexHeight` measured once but layout changes during brew (phase headline, UI elements)
2. `PhaseHeadline` reserves `LONGEST_ACTIVE_HEADLINE` space even for shorter headlines
3. `allocateBands` gives trace first priority, leaving minimal space for 3-stage ladders
4. No re-measurement when available space changes

---

## 3. "Machine connection changed" error persists without auto-dismiss

**File:** `ISSUE-machine-connection-changed.md`

**Problem:** Rare "The machine connection changed" error appears and stays until app restart. No timeout, no auto-clear on reconnect.

**Location:** 
- `app/brew.tsx` lines 795-797 (display)
- `hooks/useBrew.ts` (error state management)
- `library/machine/Machine.ts` (11+ throw sites for generation mismatch)

**Changes needed:**
- Auto-dismiss after ~5-10 seconds for "connection changed" errors
- Auto-clear when machine reconnects and is ready
- Better messaging with context
- Consider toast instead of persistent inline error

---

## 4. Auto-retry on "Machine busy" instead of manual "Try again"

**File:** `ISSUE-machine-busy-auto-retry.md`

**Problem:** Brew fails with "machine busy" when machine is briefly in LOADING state (0x1D) after handshake, but recovers to IDLE (0x41) within ~1 second. User must manually press "Try again".

**Log evidence:** Machine goes LOADING → INFO → IDLE in <1.5s, but pre-flight check catches the transient LOADING state.

**Location:**
- `library/machine/Machine.ts` `brewBlock()` lines 1532-1540
- `hooks/useBrew.ts` `brew()` method

**Changes needed:**
- Detect transient non-startable states (LOADING, SAVING_SLOTS)
- Auto-retry 2-3 times with brief delay (~500-1000ms)
- Only for transient states, NOT for genuinely busy (GRINDING, POURING)
- Preserve manual "Try again" button

---

## Implementation Priority

| Priority | Issue | Reason |
|----------|-------|--------|
| High | #4 Machine busy auto-retry | Directly improves UX for common failure case |
| High | #3 Connection changed auto-dismiss | Removes confusing persistent error |
| Medium | #1 Copy log button + Labs gate | Polish + feature gating |
| Medium | #2 Ladder compression | Visual polish, affects 3+ stage brews |

---

## Related Files Reference

| Component | Path |
|-----------|------|
| Brew screen | `app/brew.tsx` |
| Live brew hook | `hooks/useLiveBrew.tsx` |
| Brew logic hook | `hooks/useBrew.ts` |
| Brew run hook | `hooks/useBrewRun.ts` |
| Machine class | `library/machine/Machine.ts` |
| Stage ladder | `components/BrewStageLadder.tsx` |
| Band allocation | `library/brew/bands.ts` |
| Brew copy constants | `constants/brewCopy.ts` |
| Machine constants | `constants/machine.ts` |
| Settings (labs) | `app/settings.tsx`, `app/about.tsx` |

---

*Prepared on 2026-11-03 for XBRW++ v2.2.0 development cycle*