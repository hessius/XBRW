# Appearance themes and recipe palettes

Date: 2026-10-21

Status: Agreed feature direction, documented for tracking. Not scheduled for
implementation. No implementation plan is included or authorised by this document.

## Goal

Add a useful light appearance and a small selection of expressive colour themes
without turning appearance into a complex customisation system. Preserve the
app's recipe identities, information hierarchy and accessible operation.

The initial theme set is:

- Original Dark: the existing appearance.
- Light: a deliberately balanced light palette, not a literal colour inversion.
- Offline Blue: a saturated, BSOD-inspired blue appearance.
- Magenta: a brand-inspired appearance; the initial sketch uses an ink-dark plum
  foundation rather than a bright magenta screen.

These are design directions, not final colour specifications. Offline Blue's
sketch is not a sampled or verified match to the machine finish.

## Appearance controls

Two independent choices belong in appearance settings:

| Setting | Choices | Default |
| --- | --- | --- |
| Theme | Original Dark, Light, Offline Blue, Magenta | Original Dark |
| Recipe colours | Original, Themed | Original |

Original keeps the current stock recipe colours in every theme. Themed uses the
selected theme's corresponding recipe palette. Original Dark's themed recipe
palette is the stock palette, so both recipe-colour choices look the same there.

Changing theme preserves the recipe-colour choice. A user can therefore choose
Light with stock cards, Blue with stock cards, or either with coordinated cards.
Both preferences persist across launches. Existing users retain their current
appearance until they choose otherwise.

There is no custom colour editor, third palette selector, or automatic
machine-colour detection. Following the operating system is outside this initial
design; selecting Light is explicit.

## Corresponding recipe colours

The stock palette is the canonical colour identity. Each theme supplies a fixed,
one-to-one counterpart for every stock shade: eight coffee slots and four tea
slots. A recipe's saved slot does not change when appearance changes.

For example, stock Sky always maps to the same Offline Blue shade and the same
Light shade. Mapping is by stable identity, never nearest-colour matching,
sorting by luminance, or a hash of the selected theme.

- Original renders the stock shade for that identity.
- Themed renders the selected theme's counterpart for that identity.
- Every existing slot remains available; themes do not collapse several stock
  colours into one.
- A palette may change hue and lightness, but should preserve recognisable
  relationships where practical.
- The recipe colour chooser displays the colours the current settings produce.
  Choosing one still saves its canonical slot, not its displayed hex value.

Light may retain the stock hue families with deeper fills and light ink. Blue
and Magenta may use coordinated tones. Single-hue palettes must be judged across
all twelve slots, not just three attractive examples: text can remain readable
while recipes become harder to distinguish.

Recipe names, beverage markers, profiles and other non-colour cues remain.
Colour must not become the only way to identify a recipe or understand a state.

## History and sharing

**Brew history and newly generated share cards follow current appearance
settings**, including the recipe-colour choice.

Recipes retain canonical slots. Brew records retain canonical stock colours,
not theme-resolved colours. A new record snapshots the recipe's canonical colour
at brew time, independent of the active theme.

Existing records carrying recognised stock colours can be mapped directly to
their corresponding slots. No rewrite of historical records is needed for those
values. Matching stored stock hex values is case-insensitive. A historical
colour outside the recognised palette retains its stored colour rather than
being guessed into a slot; its presentation still needs suitable foregrounds.

Changing appearance does not update database rows, change brew measurements, or
make an old brew inherit later recipe edits. Renaming, recolouring or deleting
the source recipe cannot change the colour identity captured by an existing
brew. Only its theme-specific presentation changes.

Newly rendered share cards use the current appearance, including the intended
background rather than an accidental transparent canvas. Previously exported
images are static and do not change. Backups and data exports preserve canonical
identities rather than baking a user's current visual preference into recipes
or historical records.

## Visual and accessibility requirements

Light requires independent choices for surfaces, borders, primary and secondary
text, placeholders, status colours and chart ink. Inverting the dark screenshot
is inspiration, not the rendering strategy.

A recipe colour has multiple visual roles. A pastel that works as a card fill
may disappear as chart ink on a pale background. Each theme therefore defines
appropriate foreground and chart treatments rather than using one displayed
hex indiscriminately for every role.

- Normal text, including small labels and placeholders, targets at least 4.5:1
  contrast against its actual composited background.
- Meaningful graphics and control indicators target at least 3:1 where required
  for understanding or operation.
- Semantic states retain their meanings. Danger, recoverable warning, success,
  water and cup channels cannot simply become variations of the theme hue.
- Charts remain distinguishable through existing non-colour treatments too.
- Both recipe-colour modes are assessed in every theme, including translucent
  inks, nested controls, selection, validation and disabled states.

Expressive themes may feel more intense or offer less colour separation, but
lower text contrast is not an assumed requirement. Prefer compliant palettes.
If a final expressive preset deliberately falls below a relevant contrast
target, document the exact exception and clearly disclose reduced contrast
before selection. Such an exception requires explicit design approval; a
warning is not blanket permission to make essential content unreadable.

The original and light themes must not depend on reduced-contrast exceptions.

## Scope and feasibility

Colours are already centralised in `constants/colors.ts`, and recipes already
have stable accent slots. This makes a bounded preset system feasible without a
new styling library or arbitrary user-authored themes.

The work is nevertheless cross-cutting: current consumers import a static
palette, the root and Tamagui configuration select dark appearance, native
configuration forces dark UI, and chart colour derivation assumes dark surfaces.
A future implementation must make these agree rather than changing only the
library screen.

The appearance boundary must cover:

- Screens, shared controls, sheets, overlays, toasts and recipe selectors.
- Recipe cards and heroes, shelf art, brew figures, chart channels and legends.
- Brew history, comparisons and generated story/share cards.
- Navigation backgrounds, status bars and system-owned UI where configurable.
- Launch and resume transitions, avoiding flashes of the wrong appearance.

Appearance changes must not remount the live brew owner, interrupt a running
brew, lose editor state, mutate recipes, or affect NFC/BLE payloads.

This design describes a shared presentation palette and canonical colour
mapping, not a choice of hooks, provider structure, migration scripts or task
sequence. Existing styling conventions remain in force.

## Acceptance criteria for future work

- All four presets support both Original and Themed recipe colours.
- Original Dark with Original colours preserves the existing appearance.
- Theme and recipe-colour preferences persist and remain independent.
- Correspondence is complete and deterministic for all twelve stock slots.
- Switching appearance leaves stored recipes and brew colour snapshots unchanged.
- A historical brew follows current appearance even if its recipe was deleted.
- Newly generated share cards agree with the selected appearance; existing
  exported images remain unchanged.
- Text, chart and control contrast is checked against rendered backgrounds,
  including alpha composition, rather than palette values in isolation.
- Representative library, editor, sheet, live brew, history and share-card views
  are reviewed on both platforms in all appearance combinations.
- A running brew and unsaved editor state survive an appearance change.

## Deliberate boundaries

No implementation, dependency change, native build, deployment or implementation
plan is part of this task. Final token values and complete twelve-slot palettes
require visual refinement before implementation is considered ready.

Standalone comparison sketches informed this decision. They are illustrative,
not app screenshots or accessibility certification, and are not runtime assets
or an additional supported frontend.
