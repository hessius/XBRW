/**
 * Props for a view that hides its subtree from the screen reader on and off.
 *
 * Under Fabric, `accessibilityElementsHidden`, `importantForAccessibility`
 * other than "auto", `accessibilityViewIsModal`, `pointerEvents` "none" and an
 * opacity below 1 each make a view its own stacking context. A view that is not
 * one has its children flattened up into its parent: they become native
 * siblings of it, even when the view itself is real because it has a
 * background or a test ID. So a wrapper that hides the screen behind a sheet
 * moves the whole screen into itself when the sheet opens, and back out into
 * its parent when the sheet closes.
 *
 * On Android that move is what took the app down from the editor's
 * Duplicate. A crash report's view tree showed the editor deck being inserted
 * into the screen's host at index 1 while it was still inside `editor-content`:
 *
 *     addViewAt: cannot insert view [16156] into parent [16196]:
 *     View already has a parent: [16194]
 *
 * 16194 is `editor-content`, 16196 the screen's host and 16156 `editor-deck`,
 * the deck being lifted out of the wrapper on the commit that closed the more
 * menu. The deck was losing its own stacking context in the same commit, and
 * the differ's nested reparent did not detach it first.
 *
 * `collapsable: false` makes the view a stacking context whatever its
 * accessibility props say, so its children stay where they are and opening or
 * closing a sheet changes props rather than the native hierarchy. Spread it
 * into every view whose hiding props change at runtime, for the reason
 * `UNCLIPPED_LIST` is spread into every list.
 */
export const STABLE_HOST = {collapsable: false} as const;
