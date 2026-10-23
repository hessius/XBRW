# Dose shortcuts and proportional bypass

## Decision and scope

Adapt #239 (`3fc47d4300a378c43a3e4dacac077dd7b317a19e`) as a small
convenience, not a new save workflow. The existing Quick Edit stepper already
changes dose for one brew; the normal editor already saves changed recipes.

Keep compact 15, 18 and 20 g shortcuts plus the recipe's own dose, deduplicated
and sorted. The chips and stepper are the same control. Returning to the saved
dose removes the quick-edit dose adjustment. Tea gets no dose chips.

Do not add SAVE AS THIS DOSE, direct library writes from Quick Edit, import
deduplication, automatic merging of dose variants, new settings or dependencies.
Quick Edit remains one-brew only; permanent changes use the editor's existing
SAVE/autosave behavior.

## Shared dose behavior

When coffee dose changes, an enabled bypass scales proportionally too. Apply
this in both Quick Edit entry points (chips and stepper) and the normal recipe
editor, through shared pure arithmetic rather than separate implementations.
For example, 18 g with 30 ml bypass becomes 20 g with 33 ml bypass.
This preserves bypass water per gram, not a promise of identical taste.

Keep the ratio and the existing stage-volume adjustment/validation behavior.
Do not change temperatures, pauses, patterns, grinder settings or bypass
temperature. A ratio-only edit leaves bypass volume alone. Tea and a disabled
bypass do not participate. Imports, hydration, backups and machine reads retain
their declared values; they are not interactive dose edits.

Round bypass to whole millilitres and clamp to the existing 1-500 ml range.
Clearly disclose a limited result; do not imply that it stayed proportional.
Do not notify on every stepper tap. Quick Edit can extend its existing water
explainer; the normal editor needs a quiet notice when a limit is reached.
If the starting dose is non-finite/non-positive or the active bypass amount is
invalid, retain the supplied bypass amount and show a correction problem rather
than inventing a proportional value. An explicit valid bypass edit at the new
dose establishes a usable baseline again. Existing brew validation still applies.

Calculate Quick Edit from its underlying recipe, not from the last preview.
In the normal editor, retain a transient dose/bypass anchor while dose is being
adjusted. Manual bypass edits, switching bypass on, or replacing the edited
recipe establish a new anchor. Automatic saving must not rebase each step.
This prevents repeated rounding and limit clipping from making stepper and
chip results disagree or losing the original amount on a return to baseline.
No anchor or UI explanation is serialized on Recipe.

## Layout and accessibility

Keep the shortcuts subordinate to the existing dose row in both the editor
panel and home TUNE. Preserve the single existing BREW action and its validation.
Use the accepted appearance roles and existing chip conventions.

Do not increase the home sheet's nominal height merely to fit more controls.
Content must remain scrollable/reachable on short screens and at large text,
without covering the editor's BREW action. Allow wrapping rather than shrinking
text or touch targets. Selected chips expose their state and gram value.

## Qualification and closeout

Test the shared calculation, rounding and clamps; incremental versus direct
dose changes; returning to baseline after clipping; manual bypass rebasing;
tea/off cases; ratio-only changes; and unchanged JSON/card data for an unmodified
recipe. Deliberately resized recipes keep the existing serialization/wire formats.
Cover both Quick Edit hosts and normal editor edits, unsaved-recipe behavior,
existing save/autosave boundaries, all appearance combinations and both Jest
platforms. No bag accounting changes are needed: an accepted brew already
captures the actual intended dose.

Keep React Compiler behavior safe with the repository's mutable Recipe pattern.
The source PR's existing single Copilot review is already spent. Address its
stale-preset and short-screen findings without requesting another source round.

Use the existing typecheck, lint, Jest and Doctor gates. Native large-text,
small-screen and real-machine bypass behavior remain explicitly manual gates.
No native build, source merge/closure, focused PR or preview integration is
implicitly authorized by this design approval.
