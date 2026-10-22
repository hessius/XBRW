# Appearance themes and recipe palettes

Date: 2026-10-21

Revised: 2026-10-22

Status: Combined Package G design, incorporating #257 and an adapted #243,
implemented locally in the owned task branch; native/manual qualification and
maintainer acceptance remain pending. The approved product directions below
are unchanged. Tasks 1–11 have been implemented and reviewed; Task 12 records
local qualification separately from fresh-client, hardware, PR and release
gates in `docs/superpowers/plans/2026-10-22-appearance.md`. This is not approval
to build clients, open or merge a PR, close source proposals, or ship.

The original #257 design was committed at
`4dc0b2dee8ac3c7d6b73c92de64068b075c306dd`. The #243 proposal was inspected at
`8a45a42c1bfbb33ccde33d8ea012dc389b02b52b`; its existing automated review is
already complete and must not be requested again. Its useful shared colour
roles are adapted here, not its blanket magenta selection treatment.

## Goal

Add a useful light appearance and a small selection of expressive colour themes
without turning appearance into a complex customisation system. Preserve the
app's recipe identities, information hierarchy and accessible operation.

The initial theme set is:

- Original Dark: the existing foundation, with the limited primary-action
  refinement below.
- Light: a deliberately balanced light palette, not a literal colour inversion.
- Offline Blue: a saturated, BSOD-inspired blue appearance.
- Magenta: a brand-inspired appearance; the initial sketch uses an ink-dark plum
  foundation rather than a bright magenta screen.

The accepted starting palettes are specified below; native rendering still
requires verification. Offline Blue is not a sampled or verified match to the
machine finish.

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
Both preferences persist across launches. Existing users retain the Original
Dark foundation, neutral navigation and stock recipe colours. The deliberate
exception is the primary-action treatment described below.

One Appearance entry in Settings opens the existing `XbrwSheet` pattern. It
contains four labelled theme choices with colour previews, followed by the
independent Original/Themed recipe-colour choice. Both choices remain reachable
with large text and small screens; labels and selected indicators do not rely
on colour alone.

Choices apply immediately and persist without a restart or a separate Apply
button. Closing the sheet does not undo a successful choice. Changing theme
does not reset the recipe-colour choice. A failed settings write is surfaced
through the repository's error notification pattern and leaves the last
successfully persisted appearance in effect rather than pretending it was saved.

Both preferences belong in `Settings.DEFAULTS`, the typed Settings snapshot and
backup validation. Fresh installations default to Original Dark and Original.
Older backups without appearance keys remain valid and leave the current
appearance choices unchanged. New backups carry valid appearance preferences
without changing the canonical colours stored in recipes and brew records.

There is no custom colour editor, third palette selector, or automatic
machine-colour detection. Following the operating system is outside this initial
design; selecting Light is explicit.

## Primary actions, selected states and recipe accents

The maintainer rejected the submitted #243 treatment of the home list/grid
selector and active filters. A magenta selected view on the existing dark
background is not the intended use of the signature colour.

The agreed distinction is **actions versus selected states**:

- Primary actions without a recipe identity may use the theme's action fill.
  In Original Dark this is signature magenta with dark ink. SAVE and CREATE
  SHELF are representative examples, not an instruction to recolour every button.
- Generic selected views, filters, sort controls and other utility states stay
  neutral. An unaccented control does not become magenta merely because no
  `accent` prop was supplied.
- Recipe-local controls retain recipe-specific treatment. BREW, recipe choices
  and actions on recipe-coloured surfaces must not inherit brand magenta as an
  accidental fallback. Appropriate fill, ink or outline can express the recipe
  identity without putting an indistinguishable fill on an identical card.
- Destructive, warning, success, water and cup roles keep their meanings. Brand,
  primary action, selection and semantic status are separate roles even when
  two happen to share a colour in a preset.
- The already accepted switch treatment is not permission to make every
  selected control magenta. Switch state still has its redundant positional cue.

This deliberately refines the original promise of an entirely unchanged
Original Dark: its foundation, recipe colours and navigation stay familiar,
while selected primary non-recipe actions gain magenta.

The two reproduced #243 review findings remain mandatory fixes. Active
`RailChip` and selected `RailViewToggle` faded their whole group to 0.7 while
pressed, reducing the submitted magenta/ink pair from 5.18:1 to about 2.90:1 on
black. Press feedback must preserve readable foreground/background pairs,
rather than measuring an opaque token and fading the rendered control later.

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

Light retains the stock hue families with deeper fills and light ink. Blue
and Magenta use coordinated tones. Single-hue palettes must be judged across
all twelve slots, not just three attractive examples: text can remain readable
while recipes become harder to distinguish.

Recipe names, beverage markers, profiles and other non-colour cues remain.
Colour must not become the only way to identify a recipe or understand a state.

### Approved starting palettes

The maintainer reviewed all twelve slots together, in both recipe-colour modes
and all four presets, and accepted these palette directions. The tables preserve
the corresponding identities from that study. Values are the starting point for
implementation, not a claim that browser mockups qualify native rendering.
Any tuning must keep the agreed families, complete correspondence and contrast
requirements. A materially different direction requires renewed design review.

The Original column remains the canonical stored palette. It is also the
displayed palette for Original recipe colours in every theme, and for either
recipe-colour mode in Original Dark.

| Group / slot | Original | Light themed | Offline Blue themed | Magenta themed |
| --- | --- | --- | --- | --- |
| Coffee 1 / Sky | `#9FC3F0` | `#254E83` | `#A9C1FF` | `#F4A0CA` |
| Coffee 2 / Peach | `#F0B98E` | `#8B463A` | `#7296E8` | `#CC7AA7` |
| Coffee 3 / Blossom | `#F0A0AB` | `#8B3656` | `#8CA9ED` | `#EAB0D0` |
| Coffee 4 / Sage | `#B4D6A8` | `#426039` | `#BACDFB` | `#BA95B6` |
| Coffee 5 / Mint | `#97D8C4` | `#255F58` | `#86BBD9` | `#D9A0C2` |
| Coffee 6 / Lilac | `#BDB2E8` | `#654581` | `#B7B1F0` | `#D1A5D8` |
| Coffee 7 / Ice | `#A6D6E8` | `#286076` | `#C6DFFF` | `#E7C0D5` |
| Coffee 8 / Rose | `#E7A9C9` | `#83465E` | `#8E9BD9` | `#DC8EBA` |
| Tea 1 / Sencha | `#CFD6A3` | `#46613D` | `#CED7F5` | `#DFCBD8` |
| Tea 2 / Oolong | `#DCC194` | `#725429` | `#AABCD9` | `#BBA2B2` |
| Tea 3 / Jasmine | `#D9CF9A` | `#685D25` | `#D6E4EE` | `#F1DAE8` |
| Tea 4 / Hibiscus | `#E0AEA6` | `#84433F` | `#9EADD3` | `#CBADB9` |

Theme foundations and generic controls are independent of that recipe mapping:

| Role | Original Dark | Light | Offline Blue | Magenta |
| --- | --- | --- | --- | --- |
| Base | `#000000` | `#F5F4F0` | `#0015B8` | `#260B1D` |
| Primary text | `#FFFFFF` | `#171717` | `#FFFFFF` | `#FFFFFF` |
| Secondary text | `#A3A3A3` | `#595959` | `#CED7FF` | `#D7BECE` |
| Primary action fill | `#FF007F` | `#D10069` | `#E0ECFF` | `#FF76BA` |
| Primary action ink | `#0C0C0C` | `#FFFFFF` | `#091536` | `#250B1B` |
| Generic selected fill | `#FFFFFF` | `#202020` | `#FFFFFF` | `#FFFFFF` |
| Generic selected ink | `#0C0C0C` | `#FFFFFF` | `#0C0C0C` | `#0C0C0C` |
| Success ink | `#5DDC8A` | `#1F6A3B` | `#9AF1B3` | `#9AF1B3` |
| Warning ink | `#F0C24A` | `#785B00` | `#FFE58F` | `#FFE58F` |
| Danger ink | `#FF6B5E` | `#AF2118` | `#FFB0A5` | `#FFB0A5` |

Surfaces, borders, placeholders, disabled controls, chart channels and their
pressed/translucent variants must be completed as semantic tokens in the same
colour module, measured on their actual backgrounds. They are not inferred by
inverting colours, blindly reusing an alpha, or making everything the theme hue.

Card foreground roles from the accepted study:

| Displayed card palette | Main ink | Micro-label ink | Profile stroke |
| --- | --- | --- | --- |
| Original, in any theme | `#0C0C0C` | Black at 0.65 | Black at 0.50 |
| Light themed | `#FFFFFF` | White at 0.90 | White at 0.80 |
| Offline Blue / Magenta themed | `#0C0C0C` | Black at 0.80 | Black at 0.70 |

These roles are resolved for the displayed fill, not the canonical stored
colour. A stock pastel can remain a card fill in Light while its chart
representation needs a darker ink. This does not recolour the stored identity.
The study's worst shown translucent label was 5.14:1 and profile stroke 3.35:1;
native coverage must measure every additional real composition too.

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

Changing appearance does not update recipe or brew-record rows, change brew
measurements, or make an old brew inherit later recipe edits. Renaming,
recolouring or deleting the source recipe cannot change the colour identity
captured by an existing brew. Only its theme-specific presentation changes.

Newly rendered share cards use the current appearance, including the intended
background rather than an accidental transparent canvas. Previously exported
images are static and do not change. Backups and data exports preserve canonical
identities rather than baking a user's current visual preference into recipes
or historical records.

Cached generated images must not reuse an earlier appearance merely because the
brew id is unchanged. Rendering/capture uses one consistent appearance snapshot
and an appearance-sensitive cache identity; changing theme during an export must
not produce a mixed-theme image. Non-image recipe/card/handoff exports retain
their existing canonical payloads.

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
Actually disabled controls are assessed separately; the inactive-control
exemption does not extend to explanatory text or to enabled pressed controls.

## Scope and feasibility

Colours are already centralised in `constants/colors.ts`, and recipes already
have stable accent slots. This makes a bounded preset system feasible without a
new styling library or arbitrary user-authored themes.

The work is nevertheless cross-cutting: current consumers import a static
palette, the root and Tamagui configuration select dark appearance, native
configuration forces dark UI, and chart colour derivation assumes dark surfaces.
A future implementation must make these agree rather than changing only the
library screen.

### Shared presentation boundary

Use one typed, reactive appearance boundary above the navigator, with palette
definitions remaining in the existing colour module. Screens, plain React
Native views, SVG, Tamagui, navigation and image rendering read the same resolved
appearance. The boundary changes values, not component identities.

Pure TypeScript helpers receive explicit presentation values when needed.
Domain models and persistence retain canonical colours and do not read mutable
global theme state or import React. Do not change the canonical `accents` export
into the active theme's displayed array.

Two approaches were considered: a shared appearance boundary with plain typed
palette resolution, or making Tamagui named themes authoritative and bridging
all non-Tamagui consumers through them. The shared boundary is chosen because
the app already centralises colours outside Tamagui, many consumers require
plain strings, and nested Tamagui themes do not provide parent-key fallback.
Tamagui remains in use; a second styling library is not introduced.

Every consumer must participate. Updating a mutable palette object while leaving
module-level style constants and derived colours unchanged is not reactivity.
Theme-aware derived values, chart ink and capture caches must update too.

The appearance boundary must cover:

- Screens, shared controls, sheets, overlays, toasts and recipe selectors.
- Recipe cards and heroes, shelf art, brew figures, chart channels and legends.
- Brew history, comparisons and generated story/share cards.
- Navigation backgrounds, status bars and system-owned UI where configurable.
- Launch and resume transitions, avoiding flashes of the wrong appearance.

Appearance changes must not remount the live brew owner, interrupt a running
brew, lose editor state, mutate recipes, or affect NFC/BLE payloads.

The first application frame waits for the persisted appearance, and resume
must not briefly show a different preset. System-owned launch artwork is a
fixed branded launch surface, not a theme-specific screenshot; JavaScript
SQLite settings cannot be assumed available to the operating system's earliest
launch frame. Native light/dark configuration and configurable system-owned UI
must support the selected preset rather than remaining forced dark.

This design chooses the presentation boundary, not a task sequence or a new
styling framework. Existing colour, motion, sheet and header conventions remain
in force. Native configuration changes require a fresh development client and
the existing deliberate 2.2.0 runtime/release boundary; Metro reload alone does
not qualify them.

## Acceptance criteria for future work

- All four presets support both Original and Themed recipe colours.
- Original Dark with Original colours preserves existing recipe colours and
  neutral navigation, with the approved limited magenta primary-action change.
- Theme and recipe-colour preferences persist and remain independent.
- Appearance is reachable in Settings, applies immediately, handles write
  failure explicitly, and restores valid preferences without breaking old backups.
- Correspondence is complete and deterministic for all twelve stock slots.
- Generic selected controls stay neutral, primary non-recipe actions use the
  appropriate role, and recipe-local actions retain recipe-specific treatment.
- Switching appearance leaves stored recipes and brew colour snapshots unchanged.
- A historical brew follows current appearance even if its recipe was deleted.
- Newly generated share cards agree with the selected appearance; existing
  exported images remain unchanged.
- Text, chart and control contrast is checked against rendered backgrounds,
  including alpha composition, rather than palette values in isolation.
- Representative library, editor, sheet, live brew, history and share-card views
  are reviewed on both platforms in all appearance combinations.
- A running brew and unsaved editor state survive an appearance change.
- Stored and serialized recipe/record identities, NFC bytes and BLE payloads
  remain unchanged across all eight appearance combinations.
- Image caches and captures respect appearance, including switching during
  an export; previously generated images remain unchanged.
- Both Jest projects cover the presentation mappings and lifecycle regressions.
  Real SQLite tests cover appearance persistence/restore where SQL is involved.
- The reproduced #243 pressed-state defects are covered against actual
  composited pairs, not only opaque token ratios.

## Deliberate boundaries

This checkpoint is design only: no application implementation, dependency
change, native build, deployment, new PR or original-PR closure is authorised by
the document itself. Written review precedes an implementation plan. Application
work then follows the ordinary isolated task/PR workflow, with one review round
per authorised focused PR and explicit integration permission.

The existing #243 source branch is not edited or closed as an incidental design
action. Its provenance and completed review must be accounted for when the
adaptation is implemented. The cumulative preview remains an evaluation branch,
not the implementation base or approval of Package F.

Standalone comparison sketches informed this decision. They are illustrative,
not app screenshots or accessibility certification, and are not runtime assets
or an additional supported frontend.
