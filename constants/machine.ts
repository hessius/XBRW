/** The xBloom Studio's custom GATT service and its two characteristics. */
export const MACHINE_SERVICE = "0000E0FF-3C17-D293-8E48-14FE2E4DA212";
/** App → machine. Write Without Response only. */
export const MACHINE_WRITE_CHARACTERISTIC = "0000FFE1-0000-1000-8000-00805F9B34FB";
/** Machine → app. Notifications. */
export const MACHINE_NOTIFY_CHARACTERISTIC = "0000FFE2-0000-1000-8000-00805F9B34FB";

/** The machine advertises a name beginning with this. */
export const MACHINE_NAME_PREFIX = "XBLOOM";

/**
 * The ATT MTU to ask for once connected.
 *
 * Android negotiates 23 bytes by default, which leaves **20** for the payload —
 * and a recipe frame is 23 to 39. Without this the OS cannot carry a frame in
 * one write at all, whatever the library is told about chunking. iOS negotiates
 * for itself and ignores the request.
 *
 * 247 is the usual ceiling for a single LE Data Length Extension packet; a
 * machine that refuses it is not a reason to fail the connection.
 */
export const MACHINE_MTU = 247;

/** The MTU every Bluetooth LE stack must support, and so the floor. */
export const DEFAULT_MTU = 23;

/** The ATT header a write carries, which does not count towards the payload. */
export const ATT_HEADER_BYTES = 3;

/**
 * How long to wait for the Bluetooth adapter to finish powering on.
 *
 * `BleManager.start()` resolves before the adapter is usable, and a connect
 * issued in that window fails in a few milliseconds with no message at all --
 * which on a real phone was every single app launch. Five seconds is far
 * longer than a healthy radio needs and short enough that a radio which is
 * never coming up still says so while the user is watching.
 */
export const RADIO_READY_MS = 5000;

/**
 * How long `BleTransport.connect()` will wait for the rest of the connect
 * sequence (the native connect call, service discovery, MTU negotiation and
 * the model-number read) before giving up.
 *
 * Without this, a native BLE call that never resolves — the file's own
 * ghost-link comments already describe how this can happen — hangs the
 * promise forever. Nothing fails, so nothing retries and nothing is logged,
 * and the only way out is restarting the app, which recreates the one
 * `Machine` singleton `useMachine.ts` holds for the app's life.
 *
 * Sized from a real session log: observed connects, including the existing
 * ghost-link retry-once, completed in 1.5-3.5 s. `waitForRadio()` already has
 * its own 5 s timeout earlier in the same `connect()` call, so this only has
 * to cover what is left — 10 s is roughly 3x the slowest connect observed.
 */
export const CONNECT_TIMEOUT_MS = 10_000;

/** How long to scan before giving up on finding a machine. */
export const SCAN_SECONDS = 10;

/**
 * How long a scan keeps listening once it has heard a saved machine that is
 * not the default.
 *
 * The scan above stops at the first xBloom because a machine that is on and
 * nearby advertises within a second or two. With several saved, the first one
 * heard is not necessarily the one wanted: at home, Work is never heard, but
 * in a cafe with both in range the default may simply advertise a moment
 * later. Two seconds is that "second or two", and it is only ever spent when
 * the default has not been heard yet. Not measured on hardware with two
 * machines; nobody has had two in front of them.
 */
export const SAVED_MACHINE_SETTLE_MS = 2000;

/**
 * How long the machine picker listens to mark saved machines "Nearby".
 *
 * Shorter than `SCAN_SECONDS`, because it runs while somebody is looking at
 * a sheet, and a machine that is on and nearby advertises within a second or
 * two. It never stops early: the point is to hear every machine in the room.
 * Not measured with several machines; four is the guess to tune on hardware.
 */
export const SURVEY_SECONDS = 4;

/**
 * How long adding a machine listens before offering what it heard.
 *
 * Longer than the picker's look around, because a machine left out of this
 * list cannot be added at all, and adding one is rare enough to be worth a
 * few seconds more.
 */
export const ADD_SCAN_SECONDS = 6;

/**
 * The handshake has to reach the machine within about 200 ms of connecting or
 * it ignores everything that follows. This is the budget, not the target.
 */
export const HANDSHAKE_WINDOW_MS = 200;

/**
 * How long a session handshake is treated as still good for.
 *
 * Settled on hardware (2026-09-01, V12.0D.500): a 40521 sent six minutes into
 * a live link was ignored outright, and the identical frame answered at once
 * when an 8100 preceded it. The machine forgets the session; how quickly is
 * not known, so this is deliberately short.
 *
 * It is not zero because the handshake makes the machine beep, and beeping
 * every time anything wants a reading is its own bug.
 */
export const HANDSHAKE_FRESH_MS = 20_000;

/**
 * How long to wait, after the handshake, for the machine to describe itself.
 *
 * The machine sends its 40521 vitals by itself right after acknowledging an
 * 8100: 1.2 s after it at connect and 0.4 s after it at a brew, on V12.0D.500
 * (owner log, 2026-10-19). A bare 40521 request is ignored, so this wait is
 * the only one there is, and three seconds leaves room above both.
 *
 * Nothing may be brewed until it has: the info frame is the only place the
 * water level is reported, and sending a recipe to a machine whose tank state
 * is unknown is how water ends up on the counter. Connecting still succeeds if
 * this elapses — the console is useful on a machine that will not introduce
 * itself, and the brew path refuses on its own.
 */
export const INFO_WAIT_MS = 3000;

/**
 * How long to leave between the frames of a brew sequence.
 *
 * Not politeness. These are Write Without Response, so nothing paces them and
 * the machine drops a burst on the floor: a single command lands reliably, and
 * five sent back-to-back never arrive. Every working implementation we have
 * waits between frames, and the one whose brew sequence is known to run on
 * hardware waits two full seconds.
 *
 * Source: `xbloom.py` `run_brew`, which sleeps 2.0 s after every packet.
 */
export const FRAME_GAP_MS = 2000;

/**
 * How long to wait for the machine to report its state after a cancel
 * (40519) or a back-to-home (8022), before going on without the report.
 *
 * Each 40519 beeps, so the app waits for the answer rather than sending
 * another. On V12.0D.500 the startable state follows a cancel in about 0.8 s
 * (owner logs 2026-10-19: 40519 at 09:38:26.426, state 0x41 at 27.267;
 * 09:08:42.362 to 43.187; 09:40:10.026 to 10.842; 09:40:21.866 to 22.693).
 */
export const STATE_REPLY_MS = 3000;

/** UNMEASURED conservative slot budgets; dispatch includes its pacing gap. */
export const SLOT_DISPATCH_MS = 15_000;
export const SLOT_RECEIPT_MS = 15_000;
export const SLOT_COMPLETION_MS = 15_000;

/** Start-response silence budget; changing grinder positions renew it. */
export const RECIPE_ACK_MS = 8000;

/**
 * How long to wait for the machine to acknowledge a pause with 40515.
 *
 * A guess, and the only number in the pause path that is. Hardware on
 * 2026-10-08 acknowledged in well under a second, but a single observation on
 * one firmware is not a budget. Three seconds is long enough that a busy
 * machine is not accused of ignoring us, and short enough that somebody who
 * pressed PAUSE and is watching the water finds out quickly that it did not
 * take.
 *
 * It is deliberately generous in the direction of giving up. The failure this
 * timeout prevents is the UI saying "paused" about a machine that is still
 * pouring, which is the one failure in this feature that sends somebody out
 * of the room.
 */
export const PAUSE_ACK_MS = 3000;

/**
 * There is deliberately **no** grinding timeout.
 *
 * After commit the machine grinds for around twenty seconds emitting no status
 * frames at all. A client that treats that gap as a stall reports a failure
 * that did not happen, so the grinding phase waits for the grinder-stop event
 * and nothing else.
 */
export const GRINDING_TIMEOUT_MS = null;

/**
 * How long the vitals heard on a link are good enough to brew on.
 *
 * The water flag and the grind dial change only by hand at the machine, and
 * the official app brews on the reading it took when it connected, without
 * asking again. Refreshing costs a handshake, which beeps, so a brew within
 * this window uses what it has. Ten minutes bounds how old a "tank OK" can be;
 * a cached low tank is always refreshed before it refuses a brew, so a tank
 * filled since is not refused on an old reading. A tank that ran low inside
 * the window is still caught by the machine's own no-water stop.
 */
export const INFO_FRESH_MS = 10 * 60_000;

/**
 * How long to wait before each attempt at opening a link.
 *
 * Five attempts, spread over about fourteen seconds. Connecting to the J15 is
 * simply unreliable: on hardware it has taken up to five presses of Connect to
 * get a link, usually three, and pressing a button over and over is not a thing
 * to ask of somebody standing at a coffee machine. Backing off rather than
 * hammering, because the failures cluster — a radio that has just refused is
 * unlikely to accept a millisecond later.
 */
export const CONNECT_DELAYS_MS = [0, 1200, 2500, 4000, 6000];

/**
 * How long a fault state is believed before it is treated as unknown.
 *
 * Only fault states (`NO_WATER`, `NO_BEANS`) expire. Activity states never do,
 * because the machine is silent while it works: grinding emits no `0x57` frame
 * for around twenty seconds and a pour emits none for the duration of the pour,
 * so silence is what a busy machine sounds like. Expiring an activity state
 * would let the app decide a running machine is free.
 *
 * A fault expires because the user fixes it at the machine, away from the app,
 * and the app cannot observe that. Without expiry, `NO_WATER` stays forever and
 * every subsequent attempt is refused as a tank fault on a full tank.
 *
 * Fifteen seconds is safely shorter than the ~20 s grind gap recorded in
 * `docs/machine-integration/ble-protocol.md`, so a fault frame emitted at the
 * start of a grind could not masquerade as a grind silence. It is also longer
 * than a full pre-flight, so a fault that arrives during a pre-flight is still
 * fresh when `brewBlock` runs.
 */
export const STATE_FRESH_MS = 15_000;

/**
 * How long the cup weight must sit flat before a settling brew is called done.
 *
 * After the machine stops pouring, coffee keeps dripping from the brewer onto
 * the scale; the brew is not over until that drawdown stops and the cup line
 * flattens. Four seconds of no meaningful rise is long enough that a slow last
 * drip does not cut the trace short, and short enough that the record is
 * stamped while the drawdown is still fresh.
 *
 * Four seconds is only safe because this test is now gated on the machine
 * having said the coffee is ready — see `BrewRecorder.watchSettle`. Ungated it
 * was not: a bed that dams, drips nothing for five seconds and then releases is
 * an ordinary slow drawdown, and calling that the end truncated the record with
 * a third of the water still sitting above the grounds.
 */
export const SETTLE_FLAT_MS = 4000;

/**
 * How long the machine must say *nothing at all* before a settling brew is
 * force-ended.
 *
 * Settling waits for the machine's own end signal, ENJOY_2 (40513) — the event
 * that stops its timer. That is the only thing that actually knows when the
 * drawdown is finished, so nothing here should ever beat it to the conclusion.
 * But `settling` is non-terminal, so a single dropped BLE notification would
 * strand the run: the screen stuck on CANCEL, the mini bar never finishing, the
 * next brew refused as "machine busy". Hence a backstop.
 *
 * This is a **silence** timer, not an elapsed one, and that distinction is the
 * whole point. As a plain ninety seconds from the start of settling it fired on
 * a real brew — a slow, well-behaved drawdown that took over two minutes, whose
 * machine went on happily reporting the cup filling the entire time. The app
 * declared it finished with a third of the water still in the dripper. A
 * machine that is still talking is still brewing; only one that has gone quiet
 * has lost its ENJOY_2. So every frame that arrives during settling starts this
 * over.
 *
 * It bounds two things with two timers on the same duration: `BrewRecorder`
 * caps the *record*, and `Machine` runs a *settling watchdog* over the *run*.
 */
export const SETTLE_CAP_MS = 90_000;

/**
 * The longest a brew may sit in settling however talkative the machine is.
 *
 * `SETTLE_CAP_MS` restarts on every frame, which is right for a slow drawdown
 * and wrong for a cup that never stops weeping: a scale nudging up and down at
 * 10 Hz would re-arm the watchdog forever and hang the run — exactly the defect
 * the watchdog exists to prevent, reintroduced through its own fix. This is the
 * ceiling that cannot be pushed back.
 *
 * Ten minutes because it must not be reachable by any real brew. The slowest
 * drawdown observed is a little over two, and the failure it guards against is
 * a stuck run, which the user can already leave by dismissing the sheet.
 */
export const SETTLE_CEILING_MS = 600_000;

/**
 * How far the cup weight must fall from its peak to read as the cup being
 * lifted off the scale, ending settling at once.
 *
 * Not the noise floor. `NOISE_FLOOR_ML` is the half-gram the scale settles by
 * frame to frame, and `settlePeak` is a running maximum — so testing a
 * peak-to-trough fall against it turns ordinary ±0.3 g jitter (a 0.6 g swing
 * across a plateau) into a "lift" and truncates the drawdown this whole phase
 * exists to capture. A cup actually being lifted changes the reading by tens
 * to hundreds of grams, three orders of magnitude clear of that jitter, so ten
 * grams sits safely between the two and cannot be reached by noise.
 */
export const LIFT_DROP_G = 10;

/**
 * How many notification frames the machine keeps in its always-on history.
 *
 * The console's frame log only exists while that screen is mounted, but during
 * a brew the user is on the brew sheet — so a brew produces no log at all, and
 * the one-off field bugs that most need diagnosing leave nothing to read. This
 * buffer lives on the machine so a log covering the brew can be copied
 * afterwards.
 *
 * The weight stream is excluded (see `retainFrame`), so what lands here is
 * sparse. A whole brew is a few minutes and emits only: a handful of state
 * changes, ~10 lifecycle events (grinder-stop, up to six pour-starts,
 * brewer-stop, the two enjoys), the five or so recipe-send frames, and the
 * occasional info or unknown — tens of frames, not thousands. 256 holds several
 * whole brews with wide margin while staying a small fixed cap (256 short byte
 * arrays) that can never grow without bound.
 */
export const FRAME_HISTORY_LIMIT = 256;

/**
 * Whether every retained frame is also echoed to the Metro console.
 *
 * On in development and off under test, where two thousand frames of echo
 * would bury the assertions. It exists because the in-memory history dies with
 * a JS reload, and the first field capture of a false out-of-water was lost
 * exactly that way; the terminal's scrollback outlives the app.
 */
export const ECHO_FRAMES =
    typeof __DEV__ !== "undefined" && __DEV__ && process.env.NODE_ENV !== "test";

/**
 * The standard Bluetooth Device Information Service, and the characteristic
 * that carries the model number.
 *
 * Not xBloom's own service: these are assigned numbers every compliant device
 * may implement, and many do not. Every read of them is best effort.
 */
export const DEVICE_INFO_SERVICE = "0000180A-0000-1000-8000-00805F9B34FB";
export const MODEL_NUMBER_CHARACTERISTIC = "00002A24-0000-1000-8000-00805F9B34FB";

/**
 * Model strings that are certainly an xBloom Studio.
 *
 * Deliberately empty until somebody reads one off real hardware and adds it.
 * An empty list means detection never fires, which is the correct behaviour
 * for a guess we cannot check: the setting simply stays where the user left it.
 *
 * Only ever matched positively. A string that is not on this list is **not**
 * evidence of an original xBloom, because we own none to read, and treating it
 * as such would also misfire on a firmware revision. See issue #138.
 */
export const STUDIO_MODEL_STRINGS: readonly string[] = [];
