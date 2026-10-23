# Optional bag experiment for the 2.2.0 beta

Date: 2026-10-23

Status: Written spec and layout A approved. Implementation planning authorised.

## 1. Purpose and source scope

Give beta testers a fair opportunity to evaluate the contributor's bag tracking,
freshness guidance and Ready to brew concept without committing XBRW to becoming
an inventory app. Ordinary use must remain unchanged unless a tester opts in.
Inclusion in the beta does not imply inclusion in the final product.

This spec adapts the following source proposals, checked at these heads:

| PR | Scope | Head |
| --- | --- | --- |
| #238 | Bags and Beanconqueror bag handoff | `06ba667e143baf05f7ab89ec1af48493b39febf5` |
| #241 | Rest and peak guidance | `797f1b3be1d53773973e6808d91b4402a75cd05c` |
| #242 | Ready to brew home card | `acb625711e1b90627e253f780a528f5d40508181` |

The task base is freshly fetched `origin/develop` at
`8f2638dfa2e75928ff447fbbd0ee03ba14986886`. Source order is #238, then
#241, then #242; the latter proposals contain their predecessors' changes.
Preserve useful source work and tests, but replace assumptions incompatible
with this design. Recheck source heads before implementation integration.

**#239 is excluded.** Dose presets, save-as-dose, its dose/bypass scaling changes
and its compiler adjustments require a separate discussion, spec and review.
Existing one-brew quick edits remain supported and supply the actual dose used
by this experiment.

The cumulative preview in #252 is evaluation material, not an integration base.
Do not merge it wholesale or inherit unrelated pending features.

## 2. Hard boundaries

- One default-off Labs switch enables the complete experiment: bags, bag-derived
  freshness surfaces and Ready to brew. No separate enablement wizard or account.
- Bags and recipes are many-to-many. The recipe-owned, one-open-bag-per-recipe
  model in the source proposals is not acceptable, including during the beta.
- A recipe remembers its selected bag or an explicit No bag choice.
- Bag selection never changes the recipe, its card bytes or machine commands.
- Brewing never requires picking a bag or acknowledging an inventory warning.
- No new top-level inventory tab, cloud synchronisation, automatic brewing,
  notifications, analytics or permanent-release commitment.
- This is a coffee-bag experiment, not tea or water-only inventory tracking.

## 3. Labs lifecycle

Add the boolean setting through `Settings.DEFAULTS` and the existing Labs
settings structure. Explain that bags, freshness estimates and suggestions are
experimental and may not remain in the app. Fresh installs start disabled.

The opt-in is device-local and explicitly excluded from settings backup, like
the existing Labs unlock. Restoring bag data must not opt somebody in or change
their current opt-in. Add the exclusion to the typed backup contract, not an
untracked settings-key list.

While disabled, hide every bag entry point, bag-derived badge, selected-bag
row and recommendation. Do not add blank placeholders, upsells or experiment
onboarding to ordinary screens. Do not run the experiment's ordinary library
accounting/recommendation reads or assign new brews to bags. Explicit backup
and restore still preserve experimental data.

Disabling preserves bags, links, selections and past accounting. An already
accepted, attributed run keeps its frozen attribution and completes its
accounting; disabling does not rewrite a brew in progress. New runs are
untracked. Re-enabling never assigns intervening brews retrospectively and
visibly marks local quantity estimates as needing a check. The same rule
applies after a gap caused by changing the responsible tracker.

## 4. Data ownership and historical identity

Keep bag data outside serialized `Recipe` objects in the existing app database.
The following are logical responsibilities, not a mandate for a new service
layer or an unnecessarily generic schema:

| Record | Responsibility |
| --- | --- |
| Bag | Stable physical-bag ID, display name, size, remaining-quantity baseline, dates, optional price, saved roast advice/source, optional Beanconqueror name, finished state |
| Recipe/bag link | Unique pair of recipe UUID and bag ID; any number of open bags or recipes may participate |
| Recipe selection | Selected linked, unfinished bag, or explicit No bag; last explicit selection time for stable recommendations |
| Run attribution | Immutable run/brew ID, recipe identity, selected bag ID and local/Beanconqueror name snapshots, intended dose, responsible tracker |
| Bag accounting | Durable consumption/uncertainty entries and correction baseline, independent of brew-history retention or deletion |

No bag is inferred from a matching name, pod, recipe clone or machine model.
Two bags of the same coffee remain distinct. Linking another bag does not finish
an existing bag. Creating a recipe copy or sharing a recipe copies neither
inventory nor selection.

Deleting a recipe removes its links and preference, not its bags or accounting.
Renaming a recipe or bag does not rewrite historical snapshots. Removing a bag
cannot move its historical consumption to a different bag. Finishing, removing
or unlinking the selected bag clears that preference to No bag; never silently
select a substitute. Preserve an explicit No bag choice across reloads.

Capture attribution only when the existing live-run owner accepts a new run.
Ignore duplicate start requests without creating or changing attribution.
Changing a preference, navigating, remounting a screen or disabling Labs
cannot change the bag or dose of an accepted run. Use the adjusted recipe's
dose, not the saved recipe's baseline dose.

## 5. Quantity accounting and uncertainty

Remaining grams is an **estimate**, never a claim that the machine measured
the coffee taken from a bag. Show approximate language consistently.

| Observation | Local accounting |
| --- | --- |
| New run accepted with Labs off, No bag, or an ineligible tea/water-only recipe | No bag charge |
| Confirmed pre-flight refusal before sending | No bag charge |
| Pouring observed for an attributed coffee brew | Count its intended dose once |
| Failure, cancellation or lost contact after pouring was observed | Keep that dose counted; coffee was not returned |
| Grinding may have occurred but consumption cannot be established | Mark the bag as needing a check; do not assert zero use |
| App termination or unresolved accepted run | Retain a recoverable pending entry and mark uncertainty on recovery |
| Manual remaining-grams correction | Establish a new baseline at that correction; preserve historical attribution |

This deliberately does not reuse the successful-brew `COUNTED_SQL` population:
success in the cup and consumption from a bag are different facts.

Persist enough run attribution/progress to survive app termination. Uncertainty
must not depend on a component remaining mounted or sample streams surviving
retention. Do not add another machine client or another brew owner.

Identify consumption by the existing run/brew ID so terminal callbacks,
reconnection, remounts and restore cannot duplicate a charge. Deleting or
judging a brew, sweeping its samples or editing a recipe must not refund beans.
Use transactional, ordered accounting so a correction during an active brew
does not get charged again by a late terminal callback. Consumption already
accounted for before a correction is covered by its new baseline; subsequent
consumption is not.

If a correction overlaps unresolved consumption, preserve that uncertainty
rather than assuming which side of the baseline the beans were used on. In
particular, a later first-pour or terminal event must not blindly charge the
full dose again when grinding may already be covered by the correction.

For uncertainty, show Check remaining coffee with an optional correction action.
Do not show a trusted zero, an authoritative number of brews left or a confident
low/empty recommendation based on an unresolved estimate. A correction resolves
uncertainty through that point. Clamp ordinary displayed remaining grams at
zero, without hiding over-consumption in the retained accounting.

Experiment storage/read failures must be surfaced through the existing error
and notification mechanisms. Do not silently skip corrupt stored rows or report
tracking success after a failed write. Preserve the ability to start the
unchanged recipe without tracking, with an explicit warning about the gap.
An experiment failure must not send an alternative recipe or machine command.

## 6. UI: approved layout A

Use existing appearance roles, Tamagui controls and `XbrwSheet` conventions.
The browser study compared a persistent quiet row with a TUNE-only control.
The maintainer selected the quiet row above BREW.

### Editor

Keep the current BREW / STAGES / ABOUT decks and the single existing BREW
action. With Labs enabled and at least one linked bag, place a tappable selected
bag row immediately above the action buttons, visible across decks. If the
person chose No bag, show that state rather than removing the control.

Identify the bag by its name and roast date where available. A secondary line
shows an approximate quantity, uncertainty or external-tracker status. The row
opens the chooser. Wrap long labels, keep the control reachable at large text
sizes, and include its height in the existing action-bar/quick-edit geometry.
Do not create a second BREW button or obscure WRITE, SAVE or numeric controls.

ABOUT holds bag details and management: choose/link an existing bag, add one,
edit facts and advice, correct remaining quantity, finish a bag and inspect
its linked recipes. Existing bags can be found beyond this recipe's current
links. There is no new inventory tab. Bag changes are independent of unsaved
recipe edits and must not save or discard those edits.

A new unsaved recipe must be saved before its bag links are persisted.
Explain that requirement in bag management; never save the draft implicitly
or block an untracked brew.

### Chooser and other brew entry points

The shared chooser offers No bag, linked unfinished bags, a way to link another
existing bag and a way to add a bag. Distinguish same-coffee bags with roast date
and name. Mark the current selection accessibly. Selecting a bag explicitly
links it if necessary and remembers it for this recipe.

Make the chooser available in the home TUNE sheet. Direct home BREW and other
existing in-app brew entry points use the same remembered selection without
opening a mandatory picker. An unknown or unsaved recipe with no valid saved
selection brews untracked; never guess a bag from its display name.

If a previously selected bag becomes unavailable before start, notify the
person and retain No bag rather than substituting another bag. Normal core
brewing remains available. Resolve the displayed recipe and bag together when
accepting a run, not from independently changing screen state.

### Ready to brew

Show at most one card in the home library, following the existing preview's
placement beneath the rail. Hide it in the shelf picker, shelf room and
library editing states. With no eligible pair, render nothing.

Candidates are explicit, current recipe/bag selections. Deduplicate physical
bags before ranking. When several recipes select the same bag, use the most
recent explicit selection for that bag, with stable ID tie-breaking; do not
guess a new recipe or automatically select a different bag.

Prefer estimated-peak bags, then ready bags, then otherwise brewable bags
with absent or older guidance. Do not suggest bags still in their stated rest
period, finished bags, or bags reliably estimated empty. A bag without a roast
date can still be suggested, without a freshness claim. Quantity uncertainty
does not invent an empty state: show the check warning instead.

The card identifies both recipe and bag and starts exactly that pair through
the existing brew path. Cycle through other eligible bags rather than
duplicating variants of the same bag. Dismiss until the next local calendar
day. No automatic starts, timing changes, dose changes or recipe edits.
Ordinary brewing stays available regardless of any recommendation or estimate.

## 7. Freshness guidance

The physical bag owns its roast date and saved rest/peak/best-window advice.
Editing any linked recipe must not change that bag's advice. Seed new bag
advice from explicit roaster information where available, otherwise from
editable roast-level estimates. Preserve the source of the advice.

Distinguish roaster advice from generic estimates. Do not silently present
an assumed medium roast as known information. Missing roast date means no
freshness status. Copy must describe estimated rest/peak windows, not declare
that a coffee is definitively at its best or unsafe after a date.

Reuse calendar-local day arithmetic, including midnight, foreground refresh
and daylight-saving transitions. Keep the source's valid whole-day bounds;
validate the complete ordering of rest, peak and best-window advice, not just
each number separately. Surface invalid stored/imported advice rather than
silently claiming a valid freshness reading.

Bag-derived library badges follow that recipe's selected bag only. No bag means
no bag-derived badge, even when other linked bags exist. Guidance never locks
BREW or changes recipe values. Existing non-experimental roaster information
from earlier work packages remains unaffected when this experiment is off.

## 8. Beanconqueror

Preserve the existing choice of local versus Beanconqueror quantity tracking,
including the source proposal's auto mode following the handoff preference.
Do not infer whether another app is installed or claim live synchronisation.

In Beanconqueror mode retain bag facts, links, selection and freshness, but
show no competing local remaining-grams, brews-left or low/empty state.
Existing add-bean and brew handoffs must use the explicitly chosen bag's
Beanconqueror identity. A past brew uses its snapshotted identity, not the
recipe's newly selected bag. If identity is ambiguous, use the existing
explicit handoff confirmation rather than guessing between same-named bags.
Do not add an automatic app launch or an unrequested network integration.

Changing tracker ownership requires checking the new local baseline, not
replaying all historic handoffs as if they were synchronised inventory.

## 9. Backup, restore and preview-data migration

Back up bag facts, links, remembered selections and the accounting necessary
to recover estimates without sample streams or undeleted brew-history rows.
The Labs opt-in itself remains local. Old files without experiment collections
remain valid and do not create or enable the experiment.

Validate this data at the existing untrusted-backup boundary: IDs, references,
finite quantities, dates, statuses, advice and accounting uniqueness. Use the
existing partial-restore reporting pattern with explicit experimental-row
counts/warnings. Invalid or missing accounting must not produce a
success-shaped, trusted remaining figure.

Merge without overwriting local changes. An existing local bag and its
selection/correction/accounting state win as one coherent unit; do not import
older accounting into its newer baseline. Repeated imports are idempotent.
Existing per-recipe selections, including No bag, also win when an incoming
bag is new; restore cannot replace the person's current choice indirectly.
New valid bags may be retained without a surviving recipe link because a
physical bag is independent of a recipe. Reject or report broken recipe links
without deleting the valid bag.

Support data already created in the cumulative beta preview. Preserve bag
IDs, facts and the current estimated baseline while converting recipe-owned
bags to independent bags with explicit links. Do not merge same-named bags,
finish other open bags, invent old per-brew bag identities or recompute the
old baseline from a changed definition of counted brews. Preserve raw data
when migration cannot establish a trustworthy result and visibly request a
check. Schema and backup changes must be backward-compatible and tested;
do not use the forgiving Recipe constructor as a validator.

## 10. Architecture and verification

Keep pure bag, accounting, freshness and ranking rules in `library/`.
Use the shared app SQLite handle and bounded grouped reads. Keep screen state
and orchestration in hooks; keep components presentational. The current-query
recipe list is not a whole-library inventory: use the existing whole-library
interfaces or dedicated grouped reads where required.

Attach tracking to the existing `LiveBrewProvider` run lifetime, not route
mounts. Preserve its single run owner and machine command sequencing. Changes
to recipe bytes, BLE protocol, brew lifecycle control, history verdicts,
static accent identity and image-capture scoping are outside this feature.

Required evidence before a future merge:

| Area | Acceptance evidence |
| --- | --- |
| Disabled path | Fresh install stays off; restore does not change the device's opt-in; disabled means no experimental UI or routine library reads, with normal brewing unchanged |
| Relationships | Two recipes share one bag; one recipe uses two simultaneously open bags; explicit No bag survives reload; deleting a recipe only unlinks |
| Attribution | Every existing in-app brew entry point uses the correct frozen pair and quick-edited dose; a second start cannot rebind an existing run |
| Accounting | Success and post-pour interruptions count once; preflight refuses count zero; unresolved grinding/disconnect/app termination produces visible uncertainty |
| Corrections | Correction before/after consumption and during an active run; terminal callbacks, history deletion and sample retention cannot refund or double-charge |
| Lifecycle | Disabling during a run preserves that run; off-period brews remain unassigned; re-enabling/tracker gaps request a check |
| Persistence | Real SQLite tests using `createTestDatabase` cover joins, transactions, migration, duplicate events and restore, not query-pattern mocks |
| Backups | Old files, malformed rows/references, skipped-row reporting, local-state precedence and repeated imports; sample streams remain excluded |
| Suggestions | One candidate per physical bag; deterministic recipe selection; no empty/resting suggestions; unknown/uncertain states truthful; local-day dismissal refresh |
| Freshness | Shared bag edits, source labels, missing/invalid dates, advice ordering, midnight/DST and foreground changes |
| External app | Chosen and historic bag identity survives handoff; ambiguous names confirmed; external mode makes no local count or sync claim |
| UI | iOS and Android, all existing appearance combinations, small screens, large text, keyboard, VoiceOver/TalkBack and reachable single BREW action |
| Compatibility | Existing recipe/card fixtures, quick edits, single-run ownership, backups, colour identity and frozen image capture remain intact |

Use existing targeted checks first, then the normal CI gates: typecheck, lint,
both Jest platforms and Expo Doctor. No new tooling is required for the spec.
Native UI and actual Beanconqueror handoffs require manual qualification;
scripted transports and simulators do not satisfy existing physical BLE/NFC
release gates. Builds and production operations remain separately authorised.

## 11. Beta exit and workflow

Evaluate opt-in tester feedback: whether the feature is useful at all, whether
shared bags match real use, whether estimates and corrections are understood,
and whether the extra controls or home card add unwanted friction. Do not
introduce telemetry to answer these questions.

Before final release, explicitly choose retain, revise or remove. No automatic
default-on transition or assumption that contributor effort commits the final
product to this feature. Preserve beta data through disablement and any
subsequent explicit removal decision.

Each source PR already received its single automated Copilot review round.
Do not request another on those PRs. A focused adaptation PR requires separate
permission and at most one review round of its own. Source closeout, merging,
preview integration, native builds and destructive worktree cleanup remain
separate authorised operations.

The maintainer approved this written spec and authorised pushing the branch
and writing its implementation plan. Application implementation remains a
separate execution gate. Discuss #239 separately.
