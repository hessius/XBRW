# Issue: Brew Stage Ladder compresses incorrectly at 3+ stages

## Summary
The stage ladder in the live brew view incorrectly compresses at the third or later stage. It starts off using the available space but compresses later in the brewing phase. The available space for the ladder also seems smaller than at the start of the brew.

## Current Behavior
- `BrewStageLadder` component (`components/BrewStageLadder.tsx`) receives `barHeight`, `rungGap`, and `scrolls` from `allocateBands()` in `library/brew/bands.ts`
- `flexHeight` is measured once via `onLayout` on the `brew-band-region` YStack (line 670-671 in `brew.tsx`)
- `PhaseHeadline` reserves space for `LONGEST_ACTIVE_HEADLINE` while `running` is true (line 748-749)
- The comment in `BrewStageLadder` (lines 228-230) notes: "`allocateBands` fills the screen exactly from four stages up, but at two or three the ceilings bite and there is height left over"

## Observed Issues
1. **Ladder compresses during brew**: At 3+ stages, the ladder starts with good proportions but rung heights/gaps shrink as brew progresses
2. **Available space shrinks**: The measured `flexHeight` appears to be smaller during brewing than at brew start
3. **Space below stage description**: There's visually available space below the stage description throughout the brew that isn't being used

## Root Cause Analysis (Hypothesis)
1. **`flexHeight` measured once but layout changes**: The `onLayout` fires once, but the actual available height changes as:
   - Phase headline text changes (e.g., "Grinding…" → "Pouring 2 of 3" → "Drawdown…")
   - Other UI elements show/hide (overflow status, first brew reminder, etc.)
   - The `PhaseHeadline` reserve uses `LONGEST_ACTIVE_HEADLINE` but actual headline varies

2. **Phase headline reserve affects ladder budget**: The `PhaseHeadline` component (lines 933-958) uses absolute positioning for the actual text but reserves space in the flex layout with an invisible copy of `LONGEST_ACTIVE_HEADLINE`. When the actual headline is shorter, the reserved space still takes from the ladder.

3. **`allocateBands` priority order**: In `bands.ts`, the trace gets first pass at slack (up to `TRACE_CAP=200`), then bars (up to `BAR_CAP=28`), then gaps (up to `GAP_CAP=20`). With 3 stages, the math may leave the ladder with minimal space after trace takes its share.

4. **No re-measurement**: The `flexHeight` state is set once and never updated, even though the keyboard, phase changes, or other elements can change the actual available space.

## Desired Behavior
- Ladder should maintain consistent proportions throughout the brew
- Should use all visually available space below the stage description
- At 3 stages, should not "compress" mid-brew
- Rung heights and gaps should be stable once calculated

## Implementation Approach
Options to investigate:
1. **Re-measure `flexHeight` on phase change**: Update the measured height when phase headline changes
2. **Adjust `allocateBands` for 3-stage case**: Special handling when `stages === 3` to ensure adequate ladder space
3. **Use `flex: 1` with proper constraints**: Ensure the ladder container truly takes remaining space
4. **Remove or adjust `PhaseHeadline` reserve**: The reserve may be taking too much space for shorter headlines

## Files to Investigate/Modify
- `app/brew.tsx` - How `flexHeight` is measured and used
- `components/BrewStageLadder.tsx` - How ladder uses `barHeight`, `rungGap`, `scrolls`, `fill`
- `library/brew/bands.ts` - `allocateBands` logic for 3-stage recipes
- `constants/brewCopy.ts` - `LONGEST_ACTIVE_HEADLINE` derivation

## Testing
- Test with 3, 4, 5+ stage recipes
- Verify ladder proportions at brew start, during pouring, during drawdown
- Check that ladder doesn't compress mid-brew
- Verify no visual overlap with trace above or figures below
- Test on different screen sizes (phone, tablet)