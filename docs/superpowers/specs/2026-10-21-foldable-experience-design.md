# Foldable experience: connected workspaces

Date: 2026-10-21

Status: Agreed visual direction for four unfolded landscape views. Other views
and tabletop remain design work. This is a design specification and a dated
technical landscape, not an implementation plan or a commitment to packages.

## Intent

Use the extra space of iPhone Duo and other foldable phones to connect tasks
that currently require navigating between screens. Do not simply enlarge the
phone UI, and do not create a different app whenever the device folds.

The organising principle is a continuous task with adaptive presentation:
collection beside selected recipe, recipe shape beside editable stages, and live
trace beside stage progress. Different destinations need different arrangements,
but share navigation, selection and action rules.

Unfolded handheld use and a half-folded countertop brew station are equally
important product goals. The approved sketches cover unfolded landscape only.
Tabletop is a separate, unfinished design decision, not the earlier proposal
of a graph above a control pad.

## Scope of agreement

| View | Agreed direction |
| --- | --- |
| Home/library | Collection left, selected recipe overview right |
| Recipe editor | Shape and overall parameters left, editable stages right |
| Brew history | Broad attempt table, selected record's evidence below |
| Live brew | Graph beside a vertical stage ladder |

These form a journey, not competing concepts. Home leads to Edit, History or
one-brew Tune. Quick tune is not a separate app architecture or persistent
desktop workspace.

The sketch dimensions use the supplied inner resolution rotated to
2670 x 1878. The supplied portrait inner resolution is 1878 x 2670 at 430 ppi;
outer resolution is 1398 x 2034 at 460 ppi. These are reference proportions,
not layout constants or independently verified hardware specifications.
Neither resolution nor ppi establishes the app's logical viewport.

## Home: choose, inspect, act

The leading pane holds shelves, search/filter controls and the recipe collection.
The detail pane shows the selected recipe without leaving that collection.
Selecting another recipe replaces the detail, not the surrounding workspace.

The recipe's profile is centre stage, with its name, beverage identity,
favourite star at the upper right, dose, ratio, grind and total water. Relevant
brew evidence can appear alongside those figures without overwhelming the recipe.

The available actions are Brew, Tune, Edit, Write and History. They remain
explicit actions, not consequences of selecting or unfolding a recipe.

Tune opens temporary one-brew adjustments. It must remain visibly distinct from
editing and saving the recipe. Exact quick-tune placement and controls are not
yet specified.

## Recipe editor: shape alongside stages

Editing opens a dedicated workspace rather than adding more controls to the
home preview. The collection gives way to recipe editing.

One pane retains the profile and overall brew parameters. The other presents
the stage sequence, with the selected stage expanded for editing. Changing one
stage must not hide the context of the complete recipe. The selected stage and
its profile segment should be visibly related.

The profile remains the recipe's identifying silhouette; it does not become a
real-seconds chart merely because more space is available. Live and historical
brew traces keep their real-time axes.

Identity and provenance remain on ABOUT. Save, Brew and Write retain their
existing meanings. The final action grouping, complete field set, validation
presentation, keyboard handling and tea-specific editor require refinement.
The sketch's reduced controls are not permission to remove existing features.

## History: attempts above, evidence below

A broad table makes attempts scannable across useful figures, such as date,
dose, grind, duration and rating. The selected attempt's trace, figures and
judgement occupy the area below, with Compare and Share actions.

The explored example is scoped to one recipe. Global history must remain
available; its grouping and filtering are not yet redesigned.

This is selection plus evidence, not an editable spreadsheet. Unrated is not a
zero-star verdict. A record whose sample stream expired still shows its saved
figures and clearly indicates that its trace is unavailable, rather than
displaying an empty chart that looks like a failed load.

Comparison is a natural continuation, but its complete foldable layout is not
yet agreed.

## Live brew: trace alongside ladder

The graph and vertical stage ladder are persistent companion views. The graph
occupies the larger content region; the ladder shows completed, active and
upcoming stages beside it. Expand the current stage's useful details while
retaining the sequence and upcoming temperatures/pauses.

Water delivered, cup reading and elapsed time remain clear. A long stage list
scrolls within its own region instead of displacing the graph or brew actions.
The plan and observed channels retain their existing meanings and distinctions.

Pause and Stop are distinct explicit actions. Leaving the view does not stop
the brew. Folding, rotation, resizing, selection or navigation must never send
a start, pause, resume or stop command.

The live brew owner must survive presentation changes without duplication.
Missing observations are not zero readings. Existing blocked, fault, overflow,
pause, drawdown and completed states remain distinct. Their expanded layouts,
as well as tea and other long-stage cases, need a further design pass.

## Navigation and adaptive behaviour

Follow Apple's Duo conventions for system navigation and toolbars, including
vertical placement in supported landscape/outer-display contexts. The side
rail in the sketch expresses action hierarchy, not a requirement to recreate
system bars manually or place every control on a fixed edge.

Keep primary navigation first, followed by prominent task actions, with related
actions grouped. Preserve frequently used controls when space is constrained;
less frequent actions may overflow. Search and shelf controls stay near the
collection they affect. Local stage controls stay with the stage.

Preserve the same information hierarchy and functionality across displays.
Compact layouts can show one level at a time; expanded layouts reveal related
levels together. Preserve the selected recipe, filter, stage, historical record,
draft, quick-tune state and active brew where applicable.

Use available container space, text size, safe areas and reserved regions.
Do not equate landscape with expanded width, or infer a fold from a wide window.
Multitasking, portrait, large text and keyboards can reduce usable space.
Keep important content and controls clear of camera and fold regions.

Avoid dramatic rearrangement during folding. Move only what is necessary, keep
actions in recognisable relative positions, and honour reduced motion. Responsive
layouts must not remount state owners or lose unsaved work.

## Boundaries still to design

The following are explicitly not approved layouts:

- Tabletop and other partially folded arrangements. Explore the graph and ladder
  as a pair within the actual usable regions, not an assumed equal upper/lower
  split. Maintain the same task and reachable controls.
- Outer display, unfolded portrait, compact multitasking and transitions between
  them. Continuity requirements are agreed; exact layouts are not.
- Full quick tune, brew comparison, discovery/hub, import, machine management,
  settings, Easy Mode, NFC ceremony, sheets and other secondary routes.
- Large-text, keyboard, accessibility focus order, error and empty-state layouts.

These gaps prevent treating the four sketches as an app-wide implementation-ready
specification. They do not justify reducing existing functionality.

## Technical landscape, assessed 2026-10-21

This section is evidence, not an architecture decision. Recheck package releases,
API stability, runtime requirements and platform support when work is scheduled.
No dependency installation, upgrade, provider design or native bridge is selected.

The integration manifest currently uses Expo SDK 57, Expo Router 57, React Native
0.86.3, react-native-screens 4.26 and safe-area-context 5.7. It does not include
`@expo/ui` or `expo-hinge`. Native configuration currently locks orientation to
portrait. Most screens use custom headers; the live brew provider is above the
navigator. Those are constraints to account for, not changes made by this task.

| Area | Current evidence | Qualification |
| --- | --- | --- |
| Responsive content | RN window-size updates, container measurement, Tamagui and SVG can support the content arrangements | Window dimensions alone do not describe interior reserved regions or local native-pane bounds |
| Native arrangements | Published `@expo/ui` 57.0.26 exports SwiftUI `ArrangementView` with split/overlay styles, axes and sizing modifiers | Requires iOS 27.1 and a compatible build SDK; its older-system fallback renders children without the adaptive container |
| Reusing RN content | Expo UI `Host` and `RNHostView` bridge SwiftUI layout and RN/Yoga sizing | Gesture, accessibility, keyboard, capture and lifecycle behaviour in these arrangements is not verified in this app |
| System chrome | Router `Stack.Toolbar` and NativeTabs, plus Expo UI native toolbars, expose system building blocks | Custom app bars do not automatically gain native adaptation; detailed Duo behaviour and advanced controls need evaluation |
| Native navigation split | Router `unstable-split-view` exists | Documented alpha/not production-ready, root-only, non-nestable, limited header control; documented iPhone collapse behaviour needs Duo verification |
| Hinge telemetry | `expo-hinge` provides first-party angle/status across iOS and Android | Documented under SDK 58, with registry version 58.0.1 at assessment; SDK 57 compatibility not established |
| Interior fold geometry | Apple provides reserved-region and adaptive-container APIs; Android provides folding features | Four edge safe-area insets are not interior-fold geometry; direct JS coverage is not established by this assessment |

### Hinge telemetry is not layout geometry

Expo explicitly advises using hinge state for interactions/effects, not layout.
The hinge API does not expose usable pane bounds or a reserved fold rectangle.
An angle threshold alone must not determine tabletop placement.

`expo-hinge` requires iOS 27.1 with an Xcode 27.1+ build, or Android 11+.
Unsupported conditions can return `null`. `isAvailable()` indicates API support,
not proof of hinge hardware. Android never reports `closed` status and can report
`unknown` when the window does not span the fold; sensor availability varies.
Wildcard package peers do not establish native compatibility with SDK 57.

Android's native `FoldingFeature` provides bounds, orientation, separation,
occlusion and half-open state. Those capabilities are relevant to other folding
phones, but iOS arrangement containers do not provide Android layout support.

### Feasibility conclusion, not a selected solution

The approved content direction is feasible without abandoning Expo or rewriting
the domain and brewing logic. Shared RN content within platform-native adaptive
containers is a promising candidate, alongside other approaches that satisfy
the same continuity and platform requirements.

Do not commit now to a particular navigator, Expo UI version, SDK upgrade or
custom native module. The distinction to retain is between content layout,
navigation, reserved-region handling and optional hinge telemetry.

No native prototype, compilation, Duo simulation or physical-device validation
was performed for this assessment. Source availability is not proof of
production readiness or of preserving BLE/NFC safety.

## Acceptance criteria for future design and delivery

- The four agreed views preserve their task relationships in expanded landscape.
- The live graph and vertical ladder can be viewed together at suitable widths.
- Compact and expanded presentations retain equivalent functionality and state.
- Folding and resizing never send machine commands or create another brew owner.
- Unsaved edits and temporary quick-tune adjustments survive presentation changes.
- Layout responds to actual available space and reserved regions, including
  multitasking and missing hinge telemetry, without hardcoded device dimensions.
- System action placement and overflow follow platform conventions.
- Text scaling, focus order, contrast and touch targets remain usable.
- Missing traces, missing readings, unrated brews and machine faults remain explicit.
- Secondary views and tabletop receive design approval before being treated as
  covered by this specification.

## Sources and visual reference

- [Apple: Designing for iPhone Duo](https://developer.apple.com/design/human-interface-guidelines/designing-for-iphone-duo)
- [Apple: Preparing your app for iPhone Duo](https://developer.apple.com/documentation/technologyoverviews/preparing-your-app-for-iphone-duo)
- [RN 0.86: useWindowDimensions](https://reactnative.dev/docs/0.86/usewindowdimensions)
- [Expo SDK 57: Split View](https://docs.expo.dev/versions/v57.0.0/sdk/router/split-view/)
- [Expo SDK 57: Stack and toolbar](https://docs.expo.dev/versions/v57.0.0/sdk/router/stack/)
- [Expo SDK 57: Native tabs](https://docs.expo.dev/versions/v57.0.0/sdk/router/native-tabs/)
- [Expo SDK 57: RNHostView](https://docs.expo.dev/versions/v57.0.0/sdk/ui/swift-ui/rnhostview/)
- [Published ArrangementView interface](https://unpkg.com/@expo/ui@57.0.26/src/swift-ui/ArrangementView/index.tsx)
- [Published ArrangementView native availability](https://unpkg.com/@expo/ui@57.0.26/ios/ArrangementViewView.swift)
- [Expo Hinge, latest reference](https://docs.expo.dev/versions/latest/sdk/hinge/)
- [Android: Make your app fold aware](https://developer.android.com/develop/ui/compose/layouts/adaptive/foldables/make-your-app-fold-aware)

The adjacent `2026-10-21-foldable-landscape-reference.html` preserves the agreed
standalone sketch. Open it in a browser; its view selector works without a
server. It contains illustrative content, not app code, final native assets,
logical viewport measurements or an additional supported frontend. The
hand-drawn toolbar and reduced field sets are subordinate to the requirements
above.
