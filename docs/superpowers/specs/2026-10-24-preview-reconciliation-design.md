# Selective reconciliation of the 2.2.0 preview

## Status and purpose

Approved by the maintainer after review of the written specification.
Implementation planning is authorised; no reconciliation implementation is
included yet.

Account for the remaining useful work in cumulative preview PR #252 without
merging its obsolete proposals into accepted development. The maintainer
reviewed the differences sequentially and approved the decisions below.
Identical preview and develop trees are explicitly not required.

The task starts from freshly fetched, pinned `origin/develop`:
`f48738fd9479ac0c9308eb9433678db02ca32c45`.
The historical preview reference is:
`dee62ae5a35eacaa0ac20a9a1e9a748cd34c85c2`.
Issue #249 remains the coordination record.

## Approach and boundaries

Use one focused reconciliation task based on develop. Port selected behaviour
and assets, not entire preview commits. Such commits bundle accepted refinements
with superseded dose, bag and appearance experiments.

Alternatives considered:

1. Merge the whole preview: rejected because it would reintroduce SAVE AS and
   overwrite accepted dose behaviour, newer records and other decisions.
2. Leave every difference behind: rejected because several are useful
   presentation refinements, regression coverage or correctness fixes.
3. Selectively port the approved differences: chosen. Preserve develop's
   architecture and reconcile documentation to actual accepted behaviour.

The historical preview branch and its Metro servers remain untouched.
This task introduces no dependency, setting, schema or backup migration,
native config change, version bump, NFC encoding change or machine command.
The wrong-recipe investigation in #251 remains separate and hardware-blocked.

## Approved decision ledger

| Item | Difference | Decision |
| --- | --- | --- |
| 1 | Old preview dose/SAVE AS | Keep develop's accepted #267 implementation; no preview synchronisation. |
| 2 | Long editor titles | Port targeted whole-word fitting, not obsolete header-photo layout. |
| 3 | FROM attribution | Use preview's roaster-first rule, preserving sharer metadata. |
| 4 | Pod/profile name | For the same matching recipes, show a quieter labelled xBloom profile name and omit USE THIS NAME. |
| 5 | Flavours and notes | Show the short flavour list first and distinct longer notes below; preserve notes-only fallback. |
| 6 | Catalogue coffee facts | Derive from shared coffee-detail rows, including supplied type, roast date and decaf information. |
| 7 | Action appearance | Port enabled primary-action roles; preserve each existing disabled appearance. |
| 8 | Grinder history | Recognise valid whole BLE grinds 1-80, not only card-writable 40-80. |
| 9 | Bare date-picker plugin | Leave behind the unused config entry. |
| 10 | Catalogue stages | Use clearer catalogue-only stage labels and accented numbers/icons; live brewing unchanged. |
| 11 | Paused subscription, no cache | Say Updates paused instead of loading/failure. |
| 12 | Bag prototype remnants | Omit unused old controls and duplicate roast-advice application. |
| 13 | External link buttons | Retain the downloadable asset kit and usage/licensing documentation. |
| 14 | Focused maintenance | Reuse catalogue photo/chip components and clarify photo-setting scope; omit unused APIs/constants. |
| 15 | Supporting material | Retain useful nonduplicate coverage/evidence; reconcile documentation without overwriting newer accepted records. |
| 16 | Catalogue size choice | Use shared neutral selection colours; disabled appearances remain unchanged. |

Browser comparisons were mockups, not native screenshots. Items 5 and 6 were
confirmed as B after visual review. Item 7 was explicitly mixed: primary action
B, disabled state A. Catalogue stages were confirmed as B. Neutral size
selection was approved separately.

## Editor identity and coffee presentation

### Long titles

`RecipeHero` must not fit a title beside the pour-profile watermark by splitting
a word that cannot fit whole. Use the existing full-width alternative when
necessary. Retain accessible rename controls and current picture placement.
Do not port unused line-breaking bookkeeping or wrappers solely because they
were present in a historical photo experiment.

### Roaster-first FROM and profile name

Use one consistent eligibility rule for `FromSection` and `PodSection`:
the recipe source is `import` or `brewmind`, and its trimmed coffee roaster
is nonblank. Other recipes retain existing sharer presentation and name controls.

For eligible recipes, FROM presents the roaster and the coffee image rather
than the sharer name/avatar. The profile name becomes a quiet secondary value
labelled "xBloom profile name", and USE THIS NAME is absent. Header rename
remains available. Existing image visibility settings still apply.

This is a presentation heuristic, not proof of catalogue origin. An ordinary
personal share naming another roaster's coffee also matches. The maintainer
explicitly chose this broad rule after discussing that limitation. Do not add
a provenance restriction, mutate source identity, or discard `sharedBy` or
`sharedByAvatar` to implement the display.

### Flavour rows and catalogue facts

Use the existing coffee-details layer as the shared vocabulary and formatter:

- A supplied short flavour list is the main flavour value. Distinct aromatics
  appear as secondary detail using existing folded comparison for deduplication.
  With no flavour list, retain the current aromatics-only value.
- Render both values in `PodCoffeeRows`, and include both in its accessible
  description without repeating identical content.
- Catalogue facts flatten shared detail groups, excluding roaster, flavour
  and roast rows already shown elsewhere. Include supplied type, roasted date
  and explicit decaf facts. Missing fields produce no empty or invented row.
- Do not infer ordinary caffeinated status from an absent decaf flag.

## Appearance and catalogue components

Route remaining enabled generic primary actions through the existing
`useAppearance().primary` fill/ink pair. Relevant consumers include BrewNote,
BeanName, LeaveEditor, hub error/recovery, home clear-search and Easy Mode
write/recovery actions.

Preserve disabled fill, ink and opacity at each consumer, including when a
previously shared text-colour expression is separated into enabled/disabled
branches. This is not a new universal disabled style. Do not introduce the
preview's `disabledFill`/`disabledInk` roles or old global primary export.

Use the existing neutral `selection` pair for the selected catalogue
recipe-size chip, not the primary-action colour.

`BrewStageLadder`/`BrewStageRung` expose the preview's opt-in `plan` flag,
defaulting false. Hub and roaster detail plans enable it: stage numbers and
pattern icons use the recipe accent; temperatures and volumes use normal text.
Bars, values, pause geometry and live-state behaviour stay unchanged. Do not
carry redundant opacity overrides.

Replace hub-local photo/chip implementations with existing `CatalogueParts`.
Retain banner dimensions, cropping, placeholders and interaction behaviour.
This reuse is not a fix for retrying a failed image after its URI changes.
Keep the outbound-image inventory accurate after moving the call site.

Clarify that Recipe card photos also controls Ready to brew, matching existing
behaviour. Omit unused `SettingsActionRow.mark`, `UPDATED_TO_LATEST` and the
unneeded public cache-reader extraction.

## Correctness fixes

`grinderRan` still requires `grinderUsed === true`, but recognises finite whole
grind settings in BLE's 1-80 range. Off, fractional and invalid values remain
excluded. This corrects history, dial notes, comparisons and Beanconqueror
handoff interpretation; it does not widen NFC's 40-80 writing range or change
any machine payload.

For a paused roaster subscription with no cached feed, `rowLine` returns
"Updates paused" regardless of an earlier error. Active loading/failure
messages and cached-coffee counts remain unchanged. Fetching and pause logic
are not modified.

## Assets, documentation and evidence

Retain the four external Open recipe in XBRW++ designs, their SVGs and
1x/2x/3x PNGs, permission/font notices and website/native usage guidance.
Preserve outlined typography, proportions and self-contained artwork.
Examples must use valid import URL construction and stable available asset
references. Explain installed-app requirements, accessibility and the absence
of automatic install/web fallback. These are not new in-app controls.

Retain useful extra re-import tests covering unchanged and edited copies,
author refresh choices, blank-field enrichment and failed saves, plus
nonduplicate roaster-colour regressions. Adapt tests to current contracts;
do not change correct production behaviour merely to copy old expectations.

Update applicable copy, network, release and testing records to accepted
behaviour. Preserve develop's newer dose spec/plan and integration evidence.
Reconcile useful historical release/protocol evidence only after checking its
supporting records; never import stale acceptance states or claim new hardware
qualification. Historical designs may be retained as explicitly historical
evidence, not reinstated as current requirements.

## Preservation and explicit exclusions

Preserve #267's dose shortcuts, stable proportional-bypass anchor, bounds
notices on BREW/STAGES, scrolling and one-brew Quick Edit boundary.
Do not add SAVE AS or `saveAtDose`.

Preserve the accepted bag-management relationships, frozen history attribution,
accounting and history-only restore. Do not add unused legacy BagSection or
overflow props, or reapply roast advice already copied through the validated
path. The redundant bare date-picker plugin entry stays excluded; this does
not waive native rebuild requirements for existing native dependencies.

No preview reset, force push, cleanup, PR creation/merge, #252 closure, release
promotion, deployment or native build is authorised by this design.

## Verification and eventual closeout

Add focused regressions for whole-word fitting, roaster eligibility/fallbacks,
metadata preservation, flavour deduplication/fallback, catalogue facts, theme
roles across supported themes, unchanged disabled states, catalogue-only plan
colouring, valid/invalid grind history and handoff, and paused/no-cache copy.
Exercise shared photo placeholders and size selection without changing their
behaviour. Run relevant tests on both Jest platforms.

After focused checks, implementation qualification uses existing typecheck,
repository lint, both Jest projects and Expo Doctor. No new tooling is needed.
Native narrow-screen/large-text/accessibility and actual device appearance
remain manual checks; software transports cannot qualify NFC/BLE hardware.

The next step is the implementation plan. Any subsequent
PR/review/integration needs appropriate
explicit authority, with at most one automated Copilot review round per PR.
Only after accepted work is integrated and exclusions recorded may #252 be
closed with permission, as accounted for rather than merged wholesale.
