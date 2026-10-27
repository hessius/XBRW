# Machine tools and settings

Design for #64, agreed through an interactive brainstorming session on
2026-10-27. The software interface and ownership foundation are implemented
on the accompanying plan's task branch. Production capabilities remain
unavailable; neither this document nor that implementation establishes new
hardware support.

## Purpose and scope

Make the connected machine useful without a saved recipe: standalone grinding,
weighing and water dispensing. Expose its user-facing settings without turning
the recipe library into a machine dashboard.

These are occasional utilities, not a second primary brewing workflow.
There is no new bottom tab, persistent home toolbar or background-utility bar.
Recipe brewing, history, NFC encoding and Easy Mode slot formats remain unchanged.

Include:

- Grind size and RPM, explicit grinder Start and Stop.
- Scale weight and Tare.
- Target-volume and continuous ("Until stopped") pouring.
- Pour temperature, flow, pattern and, for targeted pours, volume.
- Live temperature and pattern adjustment during pouring, once qualified.
- Machine temperature/weight units, display brightness and water source.
- Pour radius and vibration amplitude as named tuning settings.
- Existing machine identity, firmware and management access.

Do not add dose-targeted grinding, a scale timer, estimated bean counts,
invented progress, live flow changes, automatic test pours or recipe/history
records for utility sessions.

## Navigation

Combine two routes to the same destinations:

1. **Discoverable:** Settings -> Machines -> the selected machine's full page.
2. **Shortcut:** the existing home machine panel -> Grind, Scale or Pour.

The home panel also links to Easy Mode and the machine page. Its status dot
does not have to carry discovery on its own. Leave the dot's long-press machine
picker and the collapsed home layout intact.

The full machine page has four sections:

| Section | Contents |
| --- | --- |
| Use | Grind, Scale, Pour, Easy Mode |
| Machine settings | Temperature unit, Weight unit, Display brightness, Water source |
| Tuning | Pour radius, Vibration amplitude |
| This machine | Reported model/firmware and Manage machine |

Settings are summary rows displaying their current value and opening focused
editors. This was chosen over inline segmented controls because the setting
list will grow. Tuning rows are visible by name; do not insert an extra generic
Calibration menu.

Manage machine retains name, model choice, colour, connection priority and
forgetting. Preserve saved-machine ordering and the existing explicit
connection/switching semantics. Viewing a different machine never silently
activates it.

The diagnostic console remains `/machine`, including its Labs and secret-tap
entry points. New normal controls do not replace or expose the raw console.

## Common tool interface

Each tool is a dedicated full-screen instrument with the app's ScreenHeader,
the exact machine name, generous dot-matrix readout, restrained controls and
a bottom-anchored primary action.

Use the existing DotMatrixText/Doto implementation, Stepper, PourGlyph,
appearance resolution, spacing and safe-area conventions. The browser
sketches explored hierarchy, not a new theme or a replacement digit font.
Readouts remain accessible text; artwork cannot replace the spoken values.

Opening a screen does not start grinding or dispensing. Tool-entry commands
may navigate the machine's own screen only after their non-starting behaviour
has been verified.

### Grind

- The large number is the selected grind size, not a live measurement.
- Labelled controls below adjust grind size and RPM before starting.
- Omit the finer/coarser arrow band underneath the large number. That surface
  is a readout, not a horizontal adjustment control.
- Start grinding changes to Stop grinding only through honest pending/running
  state handling.
- While running, keep the number steady and show a small dot-matrix activity
  band with a persistent GRINDING label.
- Reuse the live brew's RPM-derived grind-flicker cadence and accent-to-muted
  character. Do not copy timing literals or flash the entire large number.
- The band conveys activity, not measured burr speed, dose or completion.
- Reduced Motion holds it steady. Running state and Stop remain visible.
- Grind size/RPM become read-only while running; live grinder adjustment is
  outside the agreed scope.

### Scale

- A large live dot-matrix weight reading and a prominent Tare button.
- No extra Start step, setup form or decorative dashboard.
- Missing/stale telemetry is unavailable, not zero. Do not manufacture
  stability or precision.
- Changing machine weight-display units must not reinterpret a stream whose
  on-wire unit is fixed. Keep the existing app convention of grams unless a
  separate app-unit change is explicitly designed.
- An unconfirmed tare does not optimistically force the displayed value to zero.

### Pour

- Choose Target volume or Until stopped before starting.
- Before a targeted pour the large readout is labelled TARGET VOLUME.
- During pouring it is labelled DISPENSED and is driven only by qualified
  dispenser telemetry, never cup weight or an integrated requested flow.
- Targeted pouring shows the target and may show a measured progress band.
- Until stopped has neither a target nor a filling progress bar.
- Temperature and pattern stay adjustable inline while running. Reuse
  Stepper and the existing shared pour glyphs with clear labels.
- Flow, mode and target volume become read-only during a run.
- A temperature control describes a requested setpoint, not measured outlet
  temperature. A pending setting is distinguishable from an accepted setting.
- Stop remains reachable while adjusting; do not cover it with a settings sheet.
- Returning from Stop retains the tool screen and draft parameters for another
  deliberate Start. Do not automatically start again.

Continuous mode is a required product feature, but its command semantics are
not established. Do not invent a zero-volume sentinel, substitute a huge finite
target, or implement repeated automatic pours as "continuous".

## Settings editors

Show the named machine and its current reading separately from an editable
proposal. Every editor uses explicit Apply; stepper/selection changes do not
send commands. Back discards an unapplied proposal.

While applying, preserve command ownership, show pending state and retain the
proposal on failure. Confirm against a fresh, correlated machine response or
readback before claiming success. Do not equate transport write acceptance
with an applied value.

Temperature/weight units configure the machine's display. They are separate
from the app's `temperatureUnit` preference. Do not add local settings that
pretend to mirror hardware.

Water source explains that the machine must actually be connected to the
selected supply. Require deliberate Apply because tank/plumbed selection
changes interpretation of the reservoir flag.

Tuning editors expose only qualified units, ranges, increments and supported
firmware. No guessed defaults, reset-to-guessed-value buttons or automatic
motor/water actions. The mockup's numbers were illustrative raw values.

Unsupported or unreadable settings remain discoverable as unavailable, with
a reason. Offline values, if retained in memory, are explicitly last-known.
Shorter firmware info payloads must not fabricate tuning values.

## Ownership, stopping and connection loss

The shared Machine remains the sole BLE owner. One shared control owner
coordinates tool sessions and settings transactions. Screens never create
another Machine, transport or recorder.

Pin every operation to the selected device and current connection generation,
and to its reported serial where available. A pending callback or route update
cannot redirect a command to another machine.

Tools/settings, recipe brews, raw console commands and Easy Mode writes must
not overlap. Block conflicts in the domain/transport owner, not only via
disabled buttons. Preserve durable Easy Mode recovery reservations.

Pour preflight shares the current tank-safety readings, including the pushed
empty-tank flag. No water dispatch against an unconfirmed supply. Do not
give passive weighing or standalone grinding irrelevant recipe-volume or
reservoir requirements, and never let those checks prevent an owned Stop.

While grinding/pouring is starting, running, stopping or uncertain, intercept
Back, Android back, iOS swipe-back and other app navigation:

- Offer Stop and leave or Stay.
- Leave only after qualified terminal feedback confirms the stop.
- Failed or timed-out stopping retains the screen and explains the failure.
- Do not release ownership merely because the screen unmounted.

Scale entry/exit and tool cleanup also need qualified non-disruptive exit
semantics; do not treat an exit command as a proven motor Stop.

The OS cannot be prevented from backgrounding or terminating the app.
Do not promise a guaranteed Bluetooth stop in those cases. Keep an unresolved
operation recoverable, preserve the correct machine identity, and reconcile
fresh machine state before another operation. Never replay a Start on
reconnection. Explain unknown state and how to stop at the physical machine.

Implementation safety requirement: retain a minimal, local-only uncertain-tool
marker before a possible motor/water dispatch, so process loss cannot silently
erase that uncertainty. It is not a hardware-settings cache, backup payload,
background task or brew-history record. Clear only after fresh qualified proof
that the owned operation is terminal. Malformed recovery data fails visibly
closed rather than being silently discarded.

## Hardware qualification

`docs/machine-integration/ble-protocol.md` and `commands.ts` are research, not
uniformly qualified production contracts. In particular:

- Unit payload mappings conflict between sources.
- Standalone start/stop success signals, continuous-pour encoding and actual
  dispensed-volume telemetry need evidence.
- The existing parser exposes neither unit/brightness values nor tuning fields.
- Longer info payloads may contain tuning data absent from shorter firmware.
- Radius units/range/step and vibration semantics are not established.
- Command 8019 is destructive to recipe brewing; it is not recipe pause.
- A selected RPM provides animation cadence, not proof the motor is running.

Qualify each capability on identified firmware before enabling it. An explicit
unknown/unsupported state is acceptable during development; quietly replacing
an agreed feature with an approximation is not.

## Acceptance

Both entry routes reach the same focused tools/settings for the named machine.
Home stays library-first. All three tools follow the agreed readout design,
and the grinder has the small shared-language activity signal.

No navigation path, reconnect, failed write, settings edit or route remount
can silently restart a tool, send to a different machine, report an unconfirmed
stop or race an existing brew/slot operation.

Physical device acceptance covers real Start/Stop, targeted and continuous
pouring, live changes, display-unit changes, tuning read/write, physical-machine
controls, missing feedback, backgrounding and reconnect. Software tests prove
ownership, framing and UI behaviour, not physical hardware safety.

### Implementation boundary

The named machine page, both discovery routes, three instruments and six
focused editors are present. Tool entry is explicit and never starts motion.
Unqualified controls remain named and unavailable. Live temperature/pattern
controls are not enabled merely because a general pour policy exists.

The shared owner retains uncertainty across route lifetimes and app lifecycle
changes. An owning tool can explicitly reconnect the exact retained device,
then inspect before restoring Stop authority; it cannot switch machines or
replay Start. A disconnected Scale or in-flight setting owner uses that same
explicit reconnect for qualified INFO-only inspection, without creating a motor
marker or replaying Enter, Tare, Read or Apply. The lease remains exclusive until
qualified closed/settings proof arrives; local setting proposals survive.

Machine numeric editing snaps to `min + n × step`, including an off-grid maximum
and a decimal minimum, without enumerating the range. Domain validation remains
the authority and shares the ladder's bounded value-space tolerance.

Tool and setting routes cover their underlying accessibility content only for
departure prompts and the global brew-rating note sheet. Busy entry, exit, Tare,
Read and Apply leave status and Back readable while separately blocking the
global brew bar; native Back still requests safe departure rather than escaping.

Task 1 qualification and physical Task 10 acceptance remain incomplete.
Issue #64 must stay open unless those gates pass or the user explicitly accepts
a reduced scope.
