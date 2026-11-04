# Issue: Style "Copy diagnostic log" as a button and gate behind Labs

## Summary
When a brew fails to start, the "Copy diagnostic log" link appears as plain text (via `LinkText` component). It should be styled as a button (like the `Action` component in `brew.tsx`) to make it clear it's tappable. Additionally, this should only be shown for users who have Labs enabled (`labsUnlocked` setting).

## Current Behavior
- Located in `app/brew.tsx` line 788-790:
```tsx
{(blocked || failed) && (
    <LinkText label="Copy diagnostic log" onPress={copyDiagnosticLog}
              fontSize={13} />
)}
```
- Uses `LinkText` component which renders as branded magenta text with press feedback
- Always visible on any brew failure (blocked or failed)

## Desired Behavior
1. **Button styling**: Use the same visual style as the `Action` component (bordered, dot-matrix text, uppercase, with press state)
2. **Labs gate**: Only show when `labsUnlocked` setting is `true`
3. **Keep existing functionality**: Copy diagnostic log to clipboard, show success toast

## Implementation Notes
- The `labsUnlocked` setting is available via `useSetting("labsUnlocked")` (see `app/settings.tsx` and `app/about.tsx`)
- The `Action` component in `brew.tsx` (lines 199-210) provides the reference button style:
  - `Pressable` with `accessibilityRole="button"`
  - `YStack` with `borderRadius="$4"`, `borderWidth={1}`, `borderColor={color}`
  - `DotMatrixText` with `fontSize={12}`, `weight="bold"`, `letterSpacing={2}`, uppercase
  - Press feedback via `opacity: pressed ? 0.6 : 1`
- Should use a distinct color (e.g., `palette.dim` or `palette.brand`) to differentiate from primary actions like "Try again"

## Files to Modify
- `app/brew.tsx` - Add `labsUnlocked` setting, conditionally render button-styled "Copy diagnostic log"

## Testing
- Verify button appears only when `labsUnlocked` is true
- Verify button styling matches `Action` component
- Verify clipboard copy still works
- Verify toast notification appears on success
- Verify button doesn't appear for regular users (Labs disabled)