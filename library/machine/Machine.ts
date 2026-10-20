import {
    ECHO_FRAMES, FRAME_GAP_MS, FRAME_HISTORY_LIMIT, HANDSHAKE_FRESH_MS,
    HANDSHAKE_WINDOW_MS, INFO_FRESH_MS, INFO_WAIT_MS, PAUSE_ACK_MS, RECIPE_ACK_MS, SETTLE_CAP_MS,
    SETTLE_CEILING_MS, STATE_FRESH_MS, STATE_REPLY_MS
} from "@/constants/machine";
import {brewProblems} from "@/library/cardLimits";
import {clampBypassTemp} from "@/library/bypassLimits";
import type Recipe from "@/library/Recipe";
import type {SlotDatabase} from "@/library/slots/SlotDatabase";
import type {SlotAcquireOptions, SlotIdentity} from "@/library/slots/slotWriter";
import {sameBytes} from "@/library/slots/slotModel";

import {BrewUploadError, RadioUnavailableError, SlotOperationError} from "./errors";

import {frameLogText, historyLine} from "./frameLog";
import {
    ascii,
    buildBypassDose,
    bypassTempValue,
    buildType1,
    buildType1Bytes,
    buildType2,
    COMMAND_PAUSE,
    COMMAND_RESUME,
    encodeCoffeeBlob,
    encodeTeaBlob,
    EVENT,
    frameCommand,
    MACHINE_STATE,
    parseNotification,
    PAUSE_COMMAND,
    RESUME_COMMAND,
    splitFrames,
    type BypassTempEncoding,
    type MachineInfo,
    type Notification,
} from "./protocol";
import type {ConnectionScope, FoundMachine, MachineTransport, ScanDecider} from "./Transport";

export type SlotSession = {
    restartFromBeginning: boolean;
    validateFrames: (frames: readonly (readonly number[])[]) => void;
    send: (frame: Uint8Array, dispatching: () => void) => Promise<void>;
    check: () => void;
    invalidate: (error: Error) => void;
    onInvalidated: (listener: (error: Error) => void) => () => void;
    release: (safe: boolean) => void;
};

/**
 * A subscriber to every frame in either direction, decoded. The console uses it.
 *
 * The direction is part of the event because the console's log is evidence —
 * it is what users are asked to attach to a protocol report — and a log that
 * cannot tell what the app said from what the machine answered is worse than
 * no log at all.
 */
export type FrameDirection = "sent" | "received";
export type FrameListener = (
    direction: FrameDirection, frame: Uint8Array, parsed: Notification, source?: string
) => void;

/**
 * One frame kept in the machine's always-on history.
 *
 * `at` is a wall clock, like `LinkEvent.at`, because the only reader is a human
 * lining the log up against a machine that beeped at a particular moment — and
 * the ~20 s of grind silence between two entries is itself diagnostic, so the
 * gaps have to be visible. `frame` is an independent copy of the raw bytes, kept
 * beside the decode exactly as the console prints them, because a frame we could
 * not decode on someone's firmware is the single most useful thing to have.
 */
export type FrameLogEntry = {
    at: number;
    direction: FrameDirection;
    frame: Uint8Array;
    parsed: Notification;
    source?: string;
};

/** Why a brew ended badly. Each has its own copy on the brew route. */
export type BrewFailure =
    | "noWater" | "noBeans" | "grindingStopped" | "gearPosition" | "doseMismatch" | "idling" | "rejected"
    /**
     * The machine went back to its loaded screen with the brew unfinished.
     *
     * It says nothing about why. Reported from the field as a tank two grams
     * short of the last stage, but the machine sent no fault for it -- only
     * the state, walking backwards.
     */
    | "stopped"
    /**
     * Refused before a single frame went out — a low tank, a busy machine, a
     * recipe the card format will not carry. The reason is in `detail`, because
     * it is already a sentence and there is no fixed set of them.
     */
    | "blocked";

/** Why a brew will not start, in a form the UI can branch on. */
export type BrewBlock = {
    kind: "notConnected" | "noVitals" | "notEnoughWater" | "noWater" | "noBeans"
        | "busy" | "recipe";
    /** The sentence to show. Still the only thing most callers need. */
    message: string;
};

/**
 * Where a brew has got to.
 *
 * Lifecycle only. The weight streams arrive ten times a second and are fully
 * available, but rendering them is M4 — this milestone reports stages.
 */
export type BrewPhase =
    | {name: "idle"}
    /** Asking a machine that has not answered yet, and asking again. */
    | {name: "waking"}
    | {name: "sending"}
    /** Uploaded and waiting for the user to press START in the app. */
    | {name: "readyToStart"}
    | {name: "armed"}
    /** Parked in `awaiting_confirm`. The user presses the button, not the app. */
    | {name: "pressPlay"}
    | {name: "grinding"}
    | {name: "pouring"; pour: number; pours: number}
    /**
     * The bypass is dispensing into the cup.
     *
     * A phase of its own rather than a fourth pour, because it is not a pour:
     * it does not go through the dripper, it is not in `recipe.pours`, and the
     * machine gives it its own event. Making it look like a pour is exactly
     * what folded its water onto the last stage.
     */
    | {name: "bypass"}
    /**
     * Water has stopped, but coffee is still draining from the brewer onto the
     * scale. **Non-terminal**: the brew is not over until the machine's first
     * ENJOY signal, the cup line goes flat, or the cup is lifted. Ending the
     * record at BREWER_STOP threw away the last several seconds of the cup
     * filling — the part that says how much coffee actually landed.
     */
    | {name: "settling"}
    /**
     * The user stopped the brew, and the machine confirmed it.
     *
     * Nothing on the machine says this. 40518 settles the state on `0x1f`,
     * which is `ARMED` — the same code a loaded-but-unstarted brew reports —
     * so the only thing in the world that knows a brew is paused is the thing
     * that sent the pause. `PAUSED_STATE` in `protocol.ts` carries the same
     * warning.
     *
     * `was` is what resuming restores, kept rather than recomputed because
     * the machine does not re-announce a stage it is already in: a pause
     * during `grinding` and a pause during `pouring` resume into different
     * phases and no later event distinguishes them.
     *
     * `pour`/`pours` are duplicated out of `was` so the stage ladder can be
     * drawn without unwrapping it. They are 0/0 for a pause taken before the
     * first pour.
     */
    | {name: "paused"; pour: number; pours: number; was: BrewPhase; pauseKind?: "overflow"}
    | {name: "done"}
    | {name: "cancelled"}
    /** The link dropped mid-brew. The machine is assumed to still be brewing. */
    | {name: "lostContact"}
    /**
     * `block` is the kind of pre-flight refusal, present only when `reason` is
     * `"blocked"`. Without it every refusal looks the same to the UI, and a
     * busy machine or an unwritable recipe was being explained as an empty
     * water tank.
     */
    | {name: "failed"; reason: BrewFailure; detail?: string; block?: BrewBlock["kind"]};

/**
 * Every phase in which a brew is under way.
 *
 * Exported because the brew screen has to reserve the height of the tallest
 * sentence any of them can say: a headline that wraps to a second line takes
 * that height out of the measured ladder and redraws every rung mid-brew.
 */
export const ACTIVE_BREW_PHASE_NAMES: ReadonlySet<BrewPhase["name"]> = new Set([
    "waking", "sending", "readyToStart", "armed", "pressPlay",
    // `paused` is active. A paused brew is still a brew: the dose is spent,
    // the water is in the dripper, and anything that treats the run as over
    // would tear down the recorder, the wake lock and the screen that holds
    // the only RESUME button in existence.
    "grinding", "pouring", "bypass", "settling", "paused"
]);

export function isActiveBrewPhase(phase: BrewPhase): boolean {
    return ACTIVE_BREW_PHASE_NAMES.has(phase.name);
}

const FAILURE_EVENTS: Record<number, BrewFailure> = {
    8203:  "gearPosition",
    8204:  "doseMismatch"
    // EVENT.ERROR_IDLING is deliberately absent: it means different things
    // depending on the phase it arrives in, and `onEvent` decides.
    //
    // EVENT.WATER_LOW (40522) was here, and was the bug. It is the tank
    // crossing its low mark, not the machine stopping: the capture of
    // 2026-09-09 has it arriving eleven seconds into the first pour of a brew
    // that went on to finish normally. Treating it as fatal threw away two
    // perfectly good brews and told the user the machine had run out of water
    // while it was visibly still pouring.
    //
    // Its absence from this map is the whole of the fix, which is why nothing
    // in `onEvent` mentions it: an event that is not a failure and has nothing
    // to show falls through to the end like any other. Nothing is shown for it
    // deliberately (#94). The consequence a user can act on is already handled
    // -- the next info frame reports `waterEnough: false` and pre-flight
    // `brewBlock` refuses the *next* brew with a message about filling the
    // tank. A line during a brew that will finish anyway, about something
    // nobody can do anything about until it ends, is noise.
};

/**
 * The phases a brew has already begun from.
 *
 * `armed` and `pressPlay` are deliberately out: those are the states the
 * machine is *in* while it waits, and a repeat of the state it is already
 * reporting is not an ending.
 */
const STARTED: ReadonlySet<string> = new Set([
    "grinding", "pouring", "bypass", "settling"
]);

/** States from which a brew may be started at all. */
const STARTABLE = new Set<number>([
    MACHINE_STATE.IDLE, MACHINE_STATE.COMPLETE, MACHINE_STATE.READY
]);

/** States that are faults rather than activity. They are not "busy". */
const FAULT_BLOCKS: Record<number, BrewBlock> = {
    [MACHINE_STATE.NO_WATER]: {
        kind: "noWater",
        message: "The machine's water tank is empty. Fill it and try again."
    },
    [MACHINE_STATE.NO_BEANS]: {
        kind: "noBeans",
        message: "The machine is waiting for beans. Fill the hopper and try again."
    }
};

/**
 * One thing that happened to the link.
 *
 * `at` is a wall clock, not a monotonic count, because the only consumer is a
 * human reading a log next to a machine that beeped at a particular moment.
 */
export type LinkEvent = {at: number; text: string};

/** How many link events to keep. The machine lives as long as the app does. */
const LINK_HISTORY_LIMIT = 200;

/**
 * One machine, one session.
 *
 * Takes a transport by constructor injection so the whole of this file can be
 * driven by a scripted fake — which matters, because the layer underneath it
 * cannot be tested at all.
 */
export default class Machine {
    public info: MachineInfo | null = null;
    /** When `info` arrived, by wall clock. 0 while there is none. */
    public infoAt = 0;
    public state: number | null = null;
    /** When `state` was last heard, as a wall clock. 0 means never. */
    private stateAt = 0;

    /**
     * What the link has been doing, oldest first.
     *
     * The console's frame log is component state filled from `onFrame`, so it
     * holds nothing about the case hardest to diagnose: a connection that never
     * came up. There is no screen open to log it and no frame to log. This
     * lives on the machine instead, so the console can be opened afterwards and
     * still say what happened.
     */
    public readonly linkHistory: LinkEvent[] = [];

    /**
     * The last frames in either direction, oldest first, minus the weight
     * stream. See `FRAME_HISTORY_LIMIT` for why it lives here and what it holds.
     *
     * Deliberately never cleared on disconnect or reconnect: the most useful log
     * is often the one that spans the drop — a link that failed mid-brew is
     * exactly the case with no screen open to catch it — so `forget()` leaves
     * this untouched even as it resets everything else.
     */
    public readonly frameHistory: FrameLogEntry[] = [];

    private transport: MachineTransport;
    private slotStore: SlotDatabase | undefined;
    private slotSession: {token: symbol; invalidate: (error: Error) => void} | null = null;
    private generation = 0;
    private ordinaryOperations = new Set<{generation: number}>();
    private backgrounded = false;
    private connectedId: string | null = null;
    private unsettledCommand = false;

    installSlotDatabase(store: SlotDatabase): void {
        if (this.slotStore !== undefined && this.slotStore !== store) {
            throw new Error("The shared machine already has an Easy Mode database.");
        }
        // Read synchronously before exposing the owner to any other consumer.
        if (this.connectedId !== null) store.read(this.connectedId);
        this.slotStore = store;
    }

    get slotStateIsNormal(): boolean {
        return this.state !== null && STARTABLE.has(this.state);
    }

    /**
     * The peripheral this machine holds a link to, or null.
     *
     * For the brew path's last check before sending: with several machines
     * saved, the connect can land on a different one from the machine the
     * screen named, and a recipe must not follow it there. Unlike
     * `slotIdentity` it needs no reading from the machine, so it is known
     * the moment the link is up.
     */
    get linkedDeviceId(): string | null {
        return this.isConnected() ? this.connectedId : null;
    }

    get slotIdentity(): SlotIdentity | null {
        const deviceId = this.transport.connectedDeviceId;
        if (!this.isConnected() || deviceId == null || deviceId !== this.connectedId) return null;
        const serial = this.info?.serial.trim();
        return Object.freeze({deviceId, serial: serial === undefined || serial === "" ? null : serial});
    }

    setAppState(state: string | null): void {
        this.backgrounded = state !== "active";
        if (this.backgrounded) this.slotSession?.invalidate(
            new Error("Easy Mode writing stopped because the app entered the background.")
        );
    }

    assertCanForgetDevice(deviceId: string): void {
        if (this.slotStore === undefined) return;
        if (this.slotStore.read(deviceId).journal !== null
            || (this.slotSession !== null && this.slotIdentity?.deviceId === deviceId)) {
            throw new SlotOperationError("Finish the incomplete Easy Mode write before forgetting this machine.");
        }
    }

    private beginOrdinaryOperation(): () => void {
        const operation = {generation: this.generation};
        this.ordinaryOperations.add(operation);
        return () => { this.ordinaryOperations.delete(operation); };
    }

    private assertOrdinaryOperation(): void {
        const ids = [this.connectedId, this.transport.connectedDeviceId];
        if (this.slotSession !== null || ids.some((id) => id != null
            && this.slotStore?.read(id).journal != null)) {
            throw new SlotOperationError("Finish the incomplete Easy Mode write before using the machine.");
        }
    }

    acquireSlotSession(identity: SlotIdentity, options?: SlotAcquireOptions): SlotSession {
        if (this.slotStore === undefined) throw new Error("Install the shared Easy Mode database first.");
        if (this.backgrounded) throw new Error("Easy Mode writing is unavailable in the background.");
        const actual = this.slotIdentity;
        if (actual === null || actual.deviceId !== identity.deviceId) {
            throw new Error("The selected machine is not the connected peripheral.");
        }
        if (actual.serial !== identity.serial) throw new Error("The connected machine serial must match.");
        if (options?.requireKnownNormal && (this.state === null || !STARTABLE.has(this.state))) {
            throw new Error("The tea slot probe needs a known normal machine state. Wait until it is back to normal, then reconnect if needed.");
        }
        const journal = this.slotStore.read(actual.deviceId).journal;
        if (journal?.serial != null && journal.serial !== actual.serial) {
            throw new Error("The recovery journal serial belongs to a different machine.");
        }
        if (options?.finishUncertain && journal === null) {
            throw new Error("Finishing requires an existing Easy Mode recovery journal.");
        }
        if (!options?.restart && !options?.finishUncertain && journal !== null
            && (journal.inFlight !== null || journal.acknowledged === 3)) {
            throw new Error("Confirm the machine is back to normal before retrying or cancelling.");
        }
        if (options?.restart && this.state !== null && !STARTABLE.has(this.state)) {
            throw new Error(this.state === MACHINE_STATE.NO_WATER
                ? "Fill the water tank and wait for the machine to return to normal, then retry."
                : "The machine is still busy or saving. Wait until it is back to normal before restarting or cancelling. If it is already back to normal, reconnect first.");
        }
        if (this.slotSession !== null
            || this.unsettledCommand
            || Array.from(this.ordinaryOperations).some((operation) => operation.generation === this.generation)
            || isActiveBrewPhase(this.phase)
            || (this.state !== null && !STARTABLE.has(this.state)
                && !(journal !== null && this.state === MACHINE_STATE.SAVING_SLOTS))) {
            throw new Error("The machine is busy. Finish its operation before writing Easy Mode slots.");
        }
        const token = Symbol("slots");
        const generation = this.generation;
        let failure: Error | null = null;
        let released = false;
        let sent = false;
        let slotDispatched = false;
        const listeners = new Set<(error: Error) => void>();
        const invalidate = (error: Error) => {
            if (failure !== null || released) return;
            failure = error;
            this.note(error.message);
            listeners.forEach((listener) => listener(error));
        };
        const check = () => {
            if (failure !== null) throw failure;
            if (released || this.slotSession?.token !== token || generation !== this.generation
                || !this.isConnected() || this.slotIdentity?.deviceId !== actual.deviceId
                || this.slotIdentity.serial !== actual.serial || this.backgrounded) {
                throw new Error("The Easy Mode connection changed. Receipt is unknown.");
            }
            if (journal !== null && this.slotStore?.read(actual.deviceId).journal?.id !== journal.id) {
                throw new Error("The Easy Mode recovery journal changed.");
            }
            if (options?.requireKnownNormal && !slotDispatched
                && (this.state === null || !STARTABLE.has(this.state))) {
                throw new Error("The tea slot probe needs a known normal machine state before writing.");
            }
            if (isActiveBrewPhase(this.phase) || (this.state !== null
                && !STARTABLE.has(this.state)
                && ((options?.restart && !slotDispatched)
                    || (this.state !== MACHINE_STATE.SAVING_SLOTS
                        && this.state !== MACHINE_STATE.SLOTS_SAVED)))) {
                throw new Error("The machine is busy. Easy Mode writing stopped.");
            }
        };
        this.slotSession = {token, invalidate};
        return {
            restartFromBeginning: journal !== null && options?.restart === true,
            validateFrames: (frames) => {
                check();
                if (journal !== null && (frames.length !== 3
                    || !frames.every((frame, index) => sameBytes(frame, journal.frames[index])))) {
                    throw new Error("The Easy Mode frames do not match the acquired recovery journal.");
                }
                const budget = this.transport.frameBudget;
                if (budget !== undefined && frames.some((frame) => frame.length > budget)) {
                    throw new Error("A recipe is too large for this Bluetooth connection. Reduce its stages or volumes before writing.");
                }
            },
            check, invalidate,
            onInvalidated: (listener) => {
                listeners.add(listener);
                if (failure !== null) listener(failure);
                return () => { listeners.delete(listener); };
            },
            send: async (frame, dispatching) => {
                check();
                if (!sent && !this.sessionIsFresh()) {
                    const finish = this.beginOrdinaryOperation();
                    try {
                        await this.writeFrame(buildType1(8100, [185, 1]), check);
                        check();
                        this.lastHandshakeAt = Date.now();
                    } finally {
                        finish();
                    }
                    sent = true;
                }
                if (sent && this.frameGapMs > 0) {
                    await new Promise<void>((resolve, reject) => {
                        const onFailure = (error: Error) => {
                            clearTimeout(timer);
                            listeners.delete(onFailure);
                            reject(error);
                        };
                        const timer = setTimeout(() => {
                            listeners.delete(onFailure);
                            resolve();
                        }, this.frameGapMs);
                        timer.unref?.();
                        listeners.add(onFailure);
                    });
                }
                check();
                sent = true;
                dispatching();
                // Cancelling never dispatches; a restart must stay normal until its first slot.
                slotDispatched = true;
                const finish = this.beginOrdinaryOperation();
                try {
                    await this.writeFrame(frame, check);
                } finally {
                    finish();
                }
                check();
            },
            release: (safe) => {
                if (released) return;
                if (safe && this.slotStore?.read(actual.deviceId).journal != null) {
                    throw new Error("Cannot release an incomplete durable Easy Mode journal.");
                }
                if (!safe) invalidate(new Error("Easy Mode writing stopped; its recovery journal is retained."));
                released = true;
                listeners.clear();
                if (this.slotSession?.token === token) this.slotSession = null;
                // The durable journal, not a route or lease, retains exclusion.
            }
        };
    }
    private frameListeners = new Set<FrameListener>();
    private notificationListeners = new Set<(parsed: Notification) => void>();
    private linkListeners = new Set<() => void>();
    private unsubscribe: (() => void)[] = [];

    public phase: BrewPhase = {name: "idle"};
    /**
     * Which reading of the bypass temperature to send.
     *
     * A property rather than a settings lookup, so this file keeps its one-way
     * dependency: `library/` does not reach up into `hooks/`. `useBrew` sets it
     * from the console's switch.
     */
    private bypassEncoding: BypassTempEncoding = "scaled";

    get bypassTempEncoding(): BypassTempEncoding {
        return this.bypassEncoding;
    }

    /**
     * A method rather than a settable field so that callers in `hooks/` are
     * telling the machine something rather than mutating a value the React
     * Compiler believes it owns.
     */
    setBypassTempEncoding(encoding: BypassTempEncoding): void {
        this.assertOrdinaryOperation();
        this.bypassEncoding = encoding;
    }

    /**
     * Whether a brew commits itself, or waits to be started.
     *
     * `true` here is the protocol's own shape — upload and commit in one
     * sequence — and is what every test that is not about this feature wants.
     * The app's preference defaults the other way: the machine starts grinding
     * the instant it is committed to, and a user who tapped BREW to see what
     * would happen deserves one more press before that. `useBrew` pushes the
     * setting down, exactly as it does the steep encoding.
     */
    private autoStart = true;

    setAutoStart(autoStart: boolean): void {
        this.assertOrdinaryOperation();
        this.autoStart = autoStart;
    }

    private phaseListeners = new Set<(phase: BrewPhase) => void>();
    private pourCount = 0;
    /**
     * Which paced sequence owns the radio.
     *
     * Bumped by every `sendPaced`. A sequence that finds the number has moved
     * on while it slept in a gap has been overtaken, and stops.
     */
    private sequence = 0;
    private brewing = false;
    /**
     * Whether a pause has been sent and not yet resumed.
     *
     * A paused brew reports `ARMED`, which is also what a loaded recipe
     * reports, so the state alone cannot tell them apart and only the sender
     * can. Nothing in the app sends a pause yet; the machine console can, and
     * without this a console pause would be recorded as a stopped brew and a
     * later resume ignored.
     */
    private pauseSent = false;
    private ackTimer: ReturnType<typeof setTimeout> | null = null;
    private startupGrinderPosition: number | undefined;
    /**
     * Whether a pause we sent is still waiting to be acknowledged.
     *
     * The flag is the whole of what separates a pause from an echo: 40515 is
     * the machine's only confirmation, and it would otherwise be
     * indistinguishable from a stray frame or from somebody pressing the
     * machine's own buttons.
     */
    private pauseRequested = false;
    private pauseTimer: ReturnType<typeof setTimeout> | null = null;
    private pendingPauseKind: "overflow" | undefined;
    private pauseRequestToken = 0;
    /**
     * Promotes a stranded `settling` to `done` after `settleCapMs`.
     *
     * `settling` is non-terminal and only ENJOY_2 reaches `done`, so one
     * dropped notification would otherwise leave the run hung — CANCEL on
     * screen, the next brew refused as busy. This is the run's own backstop,
     * separate from the recorder's cap on the record.
     */
    private settleTimer: ReturnType<typeof setTimeout> | null = null;
    /** When the current settle began, for the ceiling the watchdog cannot pass. */
    private settleOpenedAt = 0;
    private retriedInPro = false;
    /**
     * The commit frame of an uploaded recipe that has not been started yet.
     *
     * Held rather than rebuilt so that START commits the recipe that is
     * actually on the machine, and cleared everywhere a brew ends so it can
     * never commit one the user has already walked away from.
     */
    private pendingCommit: Uint8Array | null = null;

    /**
     * Whether this brew's commit frame has gone out.
     *
     * Not derivable from `pendingCommit`, which `startBrew` clears before it
     * sends: a brew that has just been committed and one that was never
     * uploaded both hold null. The difference is the whole question `0x1E`
     * asks -- the machine says "waiting to be started" and cannot say by whom.
     */
    private committed: boolean = false;

    /**
     * The one cancel (40519) in flight, shared by everyone who wants the
     * machine cleared, so a second caller waits for it instead of sending
     * another. Every 40519 beeps.
     */
    private cancelling: Promise<void> | null = null;
    /** The user's CANCEL in flight, so a second tap sends nothing. */
    private userCancel: Promise<void> | null = null;
    /**
     * Bumped by every CANCEL. A brew still in its pre-flight when it moves
     * stops before sending its recipe.
     */
    private cancelTicket = 0;
    /**
     * The tank flag the machine pushes as event 40522: false for 0 (empty or
     * below its low mark), true for 1 (filled). Null until one arrives on this
     * link. Owner log 2026-10-19: `40522 (0)` before `0x0C no_water`, then
     * `40522 (1)` once the tank was refilled.
     */
    private waterPresent: boolean | null = null;

    private frameGapMs: number;
    private stateReplyMs: number;
    private infoWaitMs: number;
    private handshakeFreshMs: number;
    private settleCapMs: number;
    /**
     * When the session was last known to be good, so it is not renewed
     * needlessly: a handshake, or the machine answering a question asked
     * without one. Zero means it has to be renewed before anything is asked.
     */
    private lastHandshakeAt = 0;

    /**
     * @param options.frameGapMs How long to leave between the frames of a brew.
     * @param options.infoWaitMs How long to wait for an answer to the info request.
     * @param options.handshakeFreshMs How long a session handshake stays good for.
     *     Tests pass 0; nothing else should.
     * @param options.settleCapMs How long a stranded settling phase waits before
     *     it is promoted to done. Tests may shorten it; nothing else should.
     * @param options.stateReplyMs How long to wait for a state report after a
     *     cancel or a back-to-home. See `STATE_REPLY_MS`.
     */
    constructor(
        transport: MachineTransport,
        options: {
            frameGapMs?: number; infoWaitMs?: number; handshakeFreshMs?: number;
            settleCapMs?: number; stateReplyMs?: number;
        } = {}
    ) {
        this.transport = transport;
        this.frameGapMs = options.frameGapMs ?? FRAME_GAP_MS;
        this.stateReplyMs = options.stateReplyMs ?? STATE_REPLY_MS;
        this.infoWaitMs = options.infoWaitMs ?? INFO_WAIT_MS;
        this.handshakeFreshMs = options.handshakeFreshMs ?? HANDSHAKE_FRESH_MS;
        this.settleCapMs = options.settleCapMs ?? SETTLE_CAP_MS;
    }

    /** The pause between frames of a sequence. See `FRAME_GAP_MS`. */
    private gap(): Promise<void> {
        if (this.frameGapMs === 0) return Promise.resolve();
        return new Promise((resolve) => {
            const timer = setTimeout(resolve, this.frameGapMs);
            timer.unref?.();
        });
    }

    /**
     * Send frames in order, leaving a gap between them.
     *
     * The gap is the point. A burst of Write Without Response frames is not
     * flow-controlled in any way, and the machine simply loses most of it.
     * Returns false when a newer sequence interrupted the upload.
     */
    private async sendPaced(frames: Uint8Array[]): Promise<boolean> {
        this.assertOrdinaryOperation();
        const finish = this.beginOrdinaryOperation();
        try {
            const mine = ++this.sequence;
            for (let index = 0; index < frames.length; index++) {
                if (index > 0) await this.gap();
                // A newer sequence, including cancel, owns the radio.
                if (this.sequence !== mine) return false;
                await this.send(frames[index]);
            }
            return this.sequence === mine;
        } finally {
            finish();
        }
    }

    scan(decide?: ScanDecider, seconds?: number): Promise<FoundMachine[]> {
        // Called bare when nothing is asked for, exactly as it always was.
        return decide === undefined && seconds === undefined
            ? this.transport.scan()
            : this.transport.scan(seconds, decide);
    }

    /** What the radio last heard the machine call itself. Delegated, not stored:
     *  a copy here would go stale the moment the transport reconnected. */
    get modelNumber(): string { return this.transport.modelNumber; }

    get advertisedName(): string { return this.transport.advertisedName; }

    async connect(id: string): Promise<void> {
        this.slotSession?.invalidate(new Error("Easy Mode connection was replaced."));
        this.forget();
        const generation = this.generation;
        this.slotStore?.read(id);
        this.connectedId = id;
        this.note(`connecting to ${id}`);
        const finish = this.beginOrdinaryOperation();
        try {
            await this.connectAttempt(id, generation);
        } finally {
            finish();
        }
    }

    private async connectAttempt(id: string, generation: number): Promise<void> {
        try {
            await this.transport.connect(id);
        } catch (e) {
            // Not every failure arrives as an Error: the one that prompted
            // this had no `message` at all, which the log rendered as the word
            // "undefined". Anything that is not a real sentence is silence.
            const said = (e as Error | undefined)?.message;
            const reason = typeof said === "string" ? said.trim() : "";
            this.note(`refused — ${reason === "" ? "no reason given" : reason}`);
            // A radio that is off, unauthorised or still coming up is a fact
            // about the phone, and saying anything else sends the user to the
            // machine to fix something that is not there.
            if (e instanceof RadioUnavailableError) throw e;
            // When the radio has said what went wrong, that is the only true
            // thing anyone knows about the failure; do not trade it for a
            // guess.
            if (reason !== "") throw e instanceof Error ? e : new Error(reason);
            // Silence, then. The machine permits one link at a time and does
            // not reject a second one so much as ignore it, so a failure with
            // nothing to say is almost always the official app holding the
            // slot. Guess that, rather than implying the hardware is at fault.
            throw new Error("The machine is already in use by another app.");
        }
        if (generation !== this.generation) throw new Error("Connection was superseded.");
        this.connectedId = this.transport.connectedDeviceId ?? id;
        this.slotStore?.read(this.connectedId);
        this.note("connected");
        // Which notification channels actually opened. A channel that refused
        // and a channel the machine never uses are indistinguishable from up
        // here, and only one of them is our fault.
        (this.transport.channels ?? []).forEach((channel) => this.note(channel));
        this.unsubscribe.push(
            this.transport.onFrame((frame, source, scope) => {
                if (this.matchesConnection(generation, scope)) this.receive(frame, source);
            }),
            this.transport.onDisconnect((scope) => {
                if (!this.matchesConnection(generation, scope)) return;
                this.note("link dropped by the radio");
                this.forget();
            })
        );

        // First write, before anything else is queued: the machine ignores
        // every command that follows if the handshake misses its window.
        //
        // A failure here used to pass straight through `connect`, leaving the
        // transport linked -- so the app said "Connected" while the machine
        // had not beeped, no vitals ever arrived, and the connection log had
        // nothing to say about any of it. The handshake is the one frame that
        // has to land, so its failure is worth a line of its own.
        // Listening before the handshake: the machine sends its vitals by
        // itself right after acknowledging it, and nothing else asks for them.
        const heard = this.waitForInfo();
        try {
            await this.shakeHands();
        } catch (e) {
            this.note(`handshake not sent — ${(e as Error).message}`);
            throw e;
        }
        this.announceLink();
        // Connecting is not finished until the machine has said who it is and
        // how much water it has. Waiting here rather than at the brew means a
        // recipe is never sent into the gap, and the settings screen shows
        // vitals rather than blanks the moment it says "connected". No 40521:
        // on V12.0D.500 a bare request is ignored (2026-10-19), and a second
        // handshake would beep twice for one connect. A machine that stays
        // quiet is asked once more, with a handshake, at the first BREW.
        if (!await heard && this.info === null) this.note("machine did not say how it is doing");
        if (generation !== this.generation) throw new Error("Connection was superseded.");
    }

    private matchesConnection(generation: number, scope?: ConnectionScope): boolean {
        return generation === this.generation && (scope === undefined
            || (scope.deviceId === this.connectedId
                && scope.generation === this.transport.connectionGeneration));
    }

    /**
     * The grind dial's position as the last vitals reported it, or null.
     *
     * A method rather than a field read, so a recorder can hold the machine
     * and take the reading at the moment it wants one: `info` is replaced
     * whenever the machine answers, and the whole point of the post-brew
     * reading is that *when* it was taken is part of what it means.
     */
    readDial(): number | null {
        return this.info?.grindSize ?? null;
    }

    /**
     * Ask the machine to describe itself until it does, or give up.
     *
     * Does not throw: a machine that never introduces itself is still worth
     * being connected to from the console, and `brewBlock` is where the
     * consequence belongs.
     *
     * @returns whether the vitals are now known.
     */
    async ensureInfo(): Promise<boolean> {
        if (this.info !== null) return true;
        // One handshake. See `askHowItIsDoing`.
        await this.askHowItIsDoing();
        if (this.info === null) this.note("machine did not say how it is doing");
        return this.info !== null;
    }

    /**
     * Wait for the next info frame.
     *
     * The *next* one, not "one at some point": a caller asking how the machine
     * is doing now must not be handed the answer to a question asked when the
     * link came up. Does not reject — a machine that stays quiet is still worth
     * being connected to, and `brewBlock` is where the consequence
     * belongs.
     *
     * @returns whether the machine answered before the window closed.
     */
    private waitForInfo(): Promise<boolean> {
        return new Promise((resolve) => {
            const finish = (answered: boolean): void => {
                clearTimeout(timer);
                off();
                resolve(answered);
            };
            const off = this.onNotification((parsed) => {
                if (parsed.kind === "info") finish(true);
            });
            const timer = setTimeout(() => finish(false), this.infoWaitMs);
            timer.unref?.();
        });
    }

    /**
     * Send the session handshake, and remember when.
     *
     * The machine beeps at this, so it is not sent for its own sake.
     */
    private async shakeHands(): Promise<void> {
        const generation = this.generation;
        const frame = buildType1(8100, [185, 1]);
        await this.transport.write(frame);
        if (generation !== this.generation) throw new Error("The machine connection changed during the handshake.");
        this.lastHandshakeAt = Date.now();
        // Logged like every other send. It used to go straight to the radio,
        // so the frame that makes the machine beep was the one frame missing
        // from the log that somebody reads to find out why it beeped.
        this.emitFrame("sent", frame, {kind: "unknown", raw: frame});
    }

    /** Whether the machine still counts us as being in a session. */
    private sessionIsFresh(): boolean {
        return Date.now() - this.lastHandshakeAt < this.handshakeFreshMs;
    }

    /**
     * Whether the vitals heard on this link are recent enough to brew on.
     *
     * The water flag and the grind dial change only by hand at the machine,
     * and the official app brews on the reading it took when it connected.
     * See `INFO_FRESH_MS` for the bound.
     */
    private infoIsFresh(): boolean {
        return this.info !== null && Date.now() - this.infoAt < INFO_FRESH_MS;
    }

    /**
     * Renew the session and wait for the vitals the machine sends after it.
     *
     * One handshake (one beep) and one wait, never a bare 40521. Settled on
     * hardware (2026-10-19, V12.0D.500): the machine sends 40521 by itself
     * right after acknowledging an 8100, and ignores a 40521 request on its
     * own, even seconds into a fresh session. Every "the session goes stale"
     * observation before that was this.
     *
     * For a user's Refresh, and for a brew with no recent vitals. Nothing
     * calls it on a timer or on a screen opening, because it beeps.
     *
     * @returns whether the machine answered.
     */
    async askHowItIsDoing(): Promise<boolean> {
        this.assertOrdinaryOperation();
        const finish = this.beginOrdinaryOperation();
        try {
            return await this.askInfo();
        } finally {
            finish();
        }
    }

    private async askInfo(): Promise<boolean> {
        const generation = this.generation;
        const infoBeforeRequest = this.info;
        // Listening before the handshake, not after: the info can arrive
        // inside the write, since the radio delivers on its own thread.
        const answered = this.waitForInfo();
        try {
            await this.shakeHands();
        } catch (error) {
            if (generation !== this.generation) throw error;
            // A handshake the radio would not carry is not a reason to abandon
            // what the caller was doing. The brew decides on what it last
            // heard, and fails on its own first frame if the radio is gone.
            return false;
        }
        return await answered || this.info !== infoBeforeRequest;
    }

    async disconnect(): Promise<void> {
        this.note("disconnected by the app");
        this.forget();
        await this.transport.disconnect();
    }

    /**
     * Add a line to the link history.
     *
     * Public because the interesting events happen outside this class: the app
     * going to the back, coming to the front, and each attempt at taking the
     * link again.
     */
    note(text: string): void {
        this.linkHistory.push({at: Date.now(), text});
        if (this.linkHistory.length > LINK_HISTORY_LIMIT) this.linkHistory.shift();
        this.announceLink();
    }

    isConnected(): boolean {
        return this.connectedId !== null && this.transport.isConnected();
    }

    /**
     * Ask the radio what the machine offers, and write it into the link
     * history where the console can show it.
     *
     * Notifications are enabled on one characteristic. A stream on any other
     * would never reach the app, and would look exactly like a stream the
     * machine does not send — which is the question this answers.
     */
    async describeRadio(): Promise<void> {
        const describe = this.transport.describeGatt?.bind(this.transport);
        if (describe === undefined) {
            this.note("this radio could not describe itself");
            return;
        }
        try {
            const lines = await describe();
            this.note(`radio offers ${lines.length}:`);
            lines.forEach((line) => this.note(line));
        } catch (e) {
            this.note(`could not describe the radio — ${(e as Error).message}`);
        }
    }

    /** Send an already-built frame. The brew path and the console both use it. */
    async send(frame: Uint8Array): Promise<void> {
        this.assertOrdinaryOperation();
        // Native acceptance is not completion of a standalone console action.
        // Keep slots out until a fresh terminal state or a new connection.
        if (!isActiveBrewPhase(this.phase)) this.unsettledCommand = true;
        const finish = this.beginOrdinaryOperation();
        try {
            await this.writeFrame(frame);
        } finally {
            finish();
        }
    }

    private async writeFrame(frame: Uint8Array, check?: () => void): Promise<void> {
        const generation = this.generation;
        // The MTU the radio actually granted, which on Android may be the
        // 20-byte floor. A recipe blob does not fit in that, and a write that
        // is quietly truncated arrives as a brew that never starts and a
        // machine that says nothing about why.
        const budget = this.transport.frameBudget;
        if (budget !== undefined && frame.length > budget) {
            throw new Error(
                `This connection is too narrow for the recipe: the radio agreed to carry ` +
                `${budget} bytes a message and this one is ${frame.length}. ` +
                `Reconnecting sometimes settles on a wider link.`
            );
        }
        // Announced after the write resolves, not before. The log is the only
        // account we have of what actually reached the machine, and a line
        // written before the radio has accepted the frame says a frame was
        // sent when the write is about to throw.
        await this.transport.write(frame);
        if (generation !== this.generation) throw new Error("The machine connection changed during the write.");
        check?.();
        // A pause reports the same ARMED state a loaded recipe does, so the
        // only thing that can tell them apart is having sent one. Read off the
        // bytes here rather than tracked by a caller, because the machine
        // console builds its frames by hand and this is where both paths meet.
        const command = frameCommand(frame);
        if (command === PAUSE_COMMAND) this.pauseSent = true;
        if (command === RESUME_COMMAND) this.pauseSent = false;
        this.emitFrame("sent", frame, {kind: "unknown", raw: frame});
    }

    /** Every frame in either direction, for the console's log. */
    onFrame(listener: FrameListener): () => void {
        this.frameListeners.add(listener);
        return () => this.frameListeners.delete(listener);
    }

    /**
     * The link came up or went down, or the machine told us something new
     * about itself.
     *
     * Views cannot learn this from `onFrame`, because the interesting case —
     * the link dropping — produces no frame at all.
     */
    onLink(listener: () => void): () => void {
        this.linkListeners.add(listener);
        return () => this.linkListeners.delete(listener);
    }

    private announceLink(): void {
        this.linkListeners.forEach((listener) => listener());
    }

    /** Decoded notifications only. The brew state machine uses this. */
    onNotification(listener: (parsed: Notification) => void): () => void {
        this.notificationListeners.add(listener);
        return () => this.notificationListeners.delete(listener);
    }

    private receive(packet: Uint8Array, source?: string): void {
        // A packet may carry more than one frame: the machine packs an event
        // and a weight reading together under load, and reading only the first
        // silently dropped the rest. See `splitFrames`.
        for (const frame of splitFrames(packet)) this.receiveFrame(frame, source);
    }

    private receiveFrame(frame: Uint8Array, source?: string): void {
        const parsed = parseNotification(frame);
        // Retain and announce *before* acting on the frame. Handling it fires
        // the phase listeners, and a phase listener — `BrewRecorder` — is what
        // snapshots the log for a brew's record. Retaining afterwards meant the
        // frame that ended a brew was the one frame missing from that brew's
        // log, which is precisely the frame the record exists to preserve.
        this.emitFrame("received", frame, parsed, source);
        if (parsed.kind === "status") {
            this.state = parsed.state;
            this.stateAt = Date.now();
            if (STARTABLE.has(parsed.state)) this.unsettledCommand = false;
            this.onState(parsed.state);
        }
        if (parsed.kind === "info") {
            this.info = parsed;
            this.infoAt = Date.now();
            this.announceLink();
        }
        if (parsed.kind === "event" && parsed.code === EVENT.WATER_LOW
            && parsed.value !== undefined) {
            // Kept whether or not a brew is running: it is the tank, and the
            // next brew's pre-flight is what reads it.
            this.waterPresent = parsed.value !== 0;
        }
        if (parsed.kind === "event") this.onEvent(parsed.code, parsed.value);
        // Proof of life during the drawdown. Handled after the frame, so an
        // ENJOY_2 that has just ended the brew does not re-arm a watchdog for a
        // phase the run has already left.
        if (this.phase.name === "settling") this.armSettleTimer();
        this.notificationListeners.forEach((listener) => listener(parsed));
    }

    /**
     * Announce a frame to the console's live listeners and fold it into the
     * always-on history. One path so the two can never disagree about what the
     * link carried.
     */
    private emitFrame(
        direction: FrameDirection, frame: Uint8Array, parsed: Notification, source?: string
    ): void {
        this.retainFrame(direction, frame, parsed, source);
        this.frameListeners.forEach((listener) => listener(direction, frame, parsed, source));
    }

    /**
     * Fold one frame into the bounded history, dropping the weight stream.
     *
     * Cup and water weight arrive at ~10 Hz each and would evict everything
     * diagnostic within seconds, so they are the one thing left out — the same
     * point `parseNotification` makes about keeping `unknown` above all else.
     * The bytes are copied because the parser hands out subarray views over a
     * packet buffer the transport is free to reuse.
     */
    private retainFrame(
        direction: FrameDirection, frame: Uint8Array, parsed: Notification, source?: string
    ): void {
        if (parsed.kind === "waterWeight" || parsed.kind === "cupWeight") return;
        const entry = {at: Date.now(), direction, frame: frame.slice(), parsed, source};
        this.frameHistory.push(entry);
        if (this.frameHistory.length > FRAME_HISTORY_LIMIT) this.frameHistory.shift();
        if (ECHO_FRAMES) console.log(`[xbrw] ${historyLine(entry)}`);
    }

    /**
     * The frames of this session since `from`, as text, oldest first.
     *
     * Taken by wall clock rather than by index because the caller is a brew,
     * which knows when it started and nothing about the ring behind it.
     */
    public frameLogSince(from: number): string {
        return frameLogText(this.frameHistory.filter((entry) => entry.at >= from));
    }

    onPhase(listener: (phase: BrewPhase) => void): () => void {
        this.phaseListeners.add(listener);
        return () => this.phaseListeners.delete(listener);
    }

    private setPhase(phase: BrewPhase): void {
        if (phase.name === "sending") this.startupGrinderPosition = undefined;
        // The acknowledgement timer only asks one question — did the recipe
        // reach the machine? — and any phase other than `sending` has already
        // answered it. A stale timer left running would fire a "rejected"
        // failure into the middle of a working pour.
        if (phase.name !== "sending") this.clearAckTimer();
        // The settling watchdog belongs only to the settling phase; any other
        // phase has already moved the run on, so drop it before it is possibly
        // re-armed below. This is also what stops it firing into a later brew.
        this.clearSettleTimer();
        // Any phase that is not the pause ends it. The pause is the one piece
        // of brew state the machine does not hold, so the only thing that can
        // strand it is us forgetting to put it down.
        if (phase.name !== "paused") {
            this.clearPauseRequest();
        }
        this.phase = phase;
        this.brewing = isActiveBrewPhase(phase);
        if (phase.name === "settling") {
            this.settleOpenedAt = Date.now();
            this.armSettleTimer();
        }
        // A brew that has ended takes its uncommitted recipe with it. Left
        // behind, START on a later screen would commit a recipe the user has
        // already cancelled or watched fail.
        if (!this.brewing) {
            this.pendingCommit = null;
            this.committed = false;
        }
        this.phaseListeners.forEach((listener) => listener(phase));
    }

    /**
     * The machine's state, with an expired fault treated as unknown.
     *
     * Only a fault expires. The alternative to expiring one is refusing a brew
     * on a reading from before the user filled the tank it complained about,
     * which is the bug this fixes. The alternative to *keeping* an activity
     * state is deciding a silently grinding machine is free, which is worse.
     */
    private freshState(): number | null {
        if (this.state === null) return null;
        if (FAULT_BLOCKS[this.state] === undefined) return this.state;
        if (Date.now() - this.stateAt > STATE_FRESH_MS) return null;
        return this.state;
    }

    /**
     * Why this recipe cannot be sent right now, or null.
     *
     * Strict, deliberately: a false refusal costs one more press, a false send
     * costs water on the counter or a brew interrupted halfway. What it cannot
     * check — whether a cup is under the spout, whether the pod is in, whether
     * the beans match the dose — is stated on the brew route instead.
     *
     * Typed rather than prose because the two water failures are not the same
     * event: refused before anything was sent is amber, recoverable and offers
     * TRY AGAIN, while the machine stopping mid-brew is red and deliberately
     * offers nothing, because the dose is already spent.
     */
    brewBlock(recipe: Recipe): BrewBlock | null {
        if (!this.isConnected()) {
            return {kind: "notConnected", message: "The machine is not connected."};
        }
        if (this.info === null) {
            // Not a pedantic check. The water level is reported nowhere else,
            // and "we never heard" is not the same as "the tank is fine" —
            // treating it as such is how a recipe gets committed to a machine
            // with an empty tank.
            return {
                kind: "noVitals",
                message:
                    "The machine has not said how it is doing yet. Reconnect and try again."
            };
        }
        // `waterEnough` is the reservoir sensor. A tap-fed machine reports the
        // unused tank as low even though its configured supply is available.
        if (this.info.waterFeed === "tank" && !this.info.waterEnough) {
            return {kind: "notEnoughWater", message: "The machine's water tank is low."};
        }
        // The tank's own flag, 40522, pushed when it changes. It can say empty
        // while the vitals still say enough: on 2026-10-19 a `40522 (0)` came
        // in, the recipe went out anyway, and the machine stopped on
        // `0x0C no_water` after the brew had started. Refusing here costs
        // nothing; the machine pushes `40522 (1)` once the tank is filled.
        if (this.info.waterFeed === "tank" && this.waterPresent === false) {
            return {
                kind: "notEnoughWater",
                message: "The machine says its water tank is empty. Fill it and try again."
            };
        }
        const state = this.freshState();
        if (state !== null) {
            const fault = FAULT_BLOCKS[state];
            // A fault is not activity. Telling somebody with an empty hopper
            // to wait for the machine to finish is both wrong and unactionable.
            if (fault !== undefined) return fault;
            if (!STARTABLE.has(state)) {
                return {kind: "busy", message: "The machine is busy. Wait for it to finish."};
            }
        }
        // `brewProblems`, not `cardWriteProblems`: everything a card refuses
        // the machine refuses too, bar a fractional ratio, which never reaches
        // the wire because the blob derives its ratio byte from the volumes
        // and the dose. See `brewProblems` for why that one is subtracted.
        const problems = brewProblems(recipe);
        if (problems.length > 0) return {kind: "recipe", message: problems[0]};
        return null;
    }

    /**
     * Send a recipe and commit it.
     *
     * Resolves once the machine has been committed to, not once the brew is
     * over — the brew's progress arrives as phases.
     * `verifyTarget` rechecks the caller's selected machine after fresh vitals.
     */
    async brew(recipe: Recipe, verifyTarget?: () => Promise<void>): Promise<void> {
        this.assertOrdinaryOperation();
        const finish = this.beginOrdinaryOperation();
        try {
            await this.brewAttempt(recipe, verifyTarget);
        } finally {
            finish();
        }
    }

    private async brewAttempt(recipe: Recipe, verifyTarget?: () => Promise<void>): Promise<void> {
        // Pinned to the link this attempt started on, as `connectAttempt` and
        // `shakeHands` are. The pre-flight below can take several seconds of
        // asking, and a machine picked by hand meanwhile replaces the link: the
        // recipe must not go to that machine instead.
        const generation = this.generation;
        // A fresh attempt: the PRO-mode offer is per-brew, and this was not
        // reached through `switchToProAndRetry`, so the machine may be asked
        // about its mode again if this send also goes nowhere.
        this.retriedInPro = false;
        this.pauseSent = false;
        // A CANCEL pressed while this attempt is still preparing must stop it
        // before the recipe goes out, not after.
        const ticket = this.cancelTicket;
        // A brew that died on the machine leaves a warning up, and a machine
        // sitting on a warning will not take a recipe: on device, TRY AGAIN
        // after a no-beans stop did nothing until the warning was dismissed by
        // hand. At most one cancel, and none when the machine already says it
        // is startable. See `clearForBrew`.
        await this.clearForBrew();
        if (ticket !== this.cancelTicket) return;
        if (generation !== this.generation && this.isConnected()) {
            throw new Error("The machine connection changed.");
        }
        // The vitals this link already heard are used as they are: the
        // official app brews on its connect-time reading, and asking again
        // costs a handshake, which beeps (2026-10-19 owner report). Only a
        // link with no vitals, vitals older than `INFO_FRESH_MS`, or a cached
        // low tank (which may have been filled since, and would otherwise
        // refuse the brew on a stale reading) gets one handshake and one wait
        // for the vitals that follow it. Never a bare 40521: V12.0D.500
        // ignores it, and three of them cost ten seconds before the beep.
        const lowTank = this.info !== null
            && this.info.waterFeed === "tank" && !this.info.waterEnough;
        // No `waking` phase for it: that is an active brew phase, and a link
        // dropped during this one wait must be refused as `notConnected`
        // (which keeps `useBrew`'s one relink), not reported as lost contact.
        if (this.isConnected() && (!this.infoIsFresh() || lowTank)) {
            await this.askHowItIsDoing();
        }
        // Replaced, not merely lost: a link that dropped is left to
        // `brewBlock`, which refuses it as `notConnected` and so keeps the
        // brew path's one relink. A link that is up again under a newer
        // generation was opened by somebody else, to whatever they chose.
        if (generation !== this.generation && this.isConnected()) {
            throw new Error("The machine connection changed.");
        }
        if (ticket !== this.cancelTicket) return;
        if (verifyTarget !== undefined) {
            await verifyTarget();
            if (ticket !== this.cancelTicket) return;
            if (generation !== this.generation && this.isConnected()) {
                throw new Error("The machine connection changed.");
            }
        }
        await this.brewOnce(recipe);
    }

    private async brewOnce(recipe: Recipe): Promise<void> {
        this.assertOrdinaryOperation();
        const generation = this.generation;
        const ticket = this.cancelTicket;
        const autoStart = this.autoStart;
        const blocked = this.brewBlock(recipe);
        if (blocked !== null) {
            // The phase as well as the throw. The caller gets an exception to
            // handle, but the brew screen watches the phase, and a refusal that
            // left the phase at `idle` sat there saying "Ready when you are."
            // with nothing to press.
            this.setPhase({
                name: "failed", reason: "blocked",
                detail: blocked.message, block: blocked.kind
            });
            throw new Error(blocked.message);
        }

        this.pourCount = recipe.pours.length;
        this.setPhase({name: "sending"});

        const tea = recipe.isTea();
        const commit = tea ? buildType1(4512) : buildType1(8002);
        this.pendingCommit = null;
        this.committed = false;

        // No handshake in the burst. The reference re-sends one at the start
        // of every brew, but the reference connects for each brew, so that
        // is its connect handshake. On a held link the session opened at
        // connect (or by the pre-flight above) is the one the official app
        // brews in, without a second beep.
        try {
            // This whole sequence, gaps and all, mirrors `run_brew` in the
            // reference implementation, which is the only brew sequence we have
            // that is known to work on real hardware.
            const sent = await this.sendPaced([
                // The dose has to travel whether or not there is a bypass: the
                // machine needs it to grind correctly, and skipping this frame
                // makes the grind drift. Tea sends no bypass at all -- the
                // machine ignores it there, as `shareLink` already assumes.
                // The two bypass arguments are float bits (see `buildBypassDose`
                // and `ble-protocol.md`), so a live volume or temperature must
                // be encoded as a float, not as the integer `buildType1` writes.
                tea || !recipe.bypassEnabled
                    ? buildBypassDose(0, 0, recipe.dosage)
                    : buildBypassDose(
                        Math.round(recipe.bypassVolume),
                        // Clamped here rather than inside `bypassTempValue`,
                        // which is in the wire layer and imports nothing from
                        // the app. This is the last place the number is still a
                        // number: `buildBypassDose` writes it as a float32 and
                        // the machine has no idea what it was asked for. A
                        // stage's unset temperature is -1, and that sentinel has
                        // reached a recipe's `bypassTemp` before now.
                        bypassTempValue(
                            clampBypassTemp(recipe.bypassTemp), this.bypassEncoding
                        ),
                        recipe.dosage
                    ),
                ...(tea ? [
                    buildType1Bytes(4513, encodeTeaBlob(recipe))
                ] : [
                    setCupFrame(),
                    buildType1Bytes(
                        recipe.grinder ? 8001 : 8004, encodeCoffeeBlob(recipe)
                    )
                ]),
                // The commit is the frame that sets a burr spinning, so it is
                // the one the user may want to keep for themselves.
                ...(autoStart ? [commit] : [])
            ]);
            if (!sent || ticket !== this.cancelTicket || generation !== this.generation) return;
            // The burst carried the commit when auto-start is on, so from here
            // the machine is starting itself and needs nothing from the user.
            this.committed = autoStart;
        } catch (error) {
            if (ticket !== this.cancelTicket) return;
            // Without this the brew is left in `sending` with no timer armed —
            // the phase is only ever left by an acknowledgement that can no
            // longer come, so the brew screen would spin for good.
            if (generation === this.generation) {
                this.setPhase({
                    name: "failed", reason: "rejected",
                    detail: error instanceof Error ? error.message : undefined
                });
            }
            if (error instanceof SlotOperationError) throw error;
            throw new BrewUploadError(error);
        }

        if (!autoStart) {
            // Uploaded, not committed. Nothing is timed from here: the machine
            // is holding a recipe quite happily, and the only thing outstanding
            // is a person.
            this.pendingCommit = commit;
            this.setPhase({name: "readyToStart"});
            return;
        }

        // Not a grinding timeout — there is deliberately none of those, because
        // the machine goes silent for twenty seconds while it grinds. This is a
        // much earlier question: did the recipe reach the machine at all?
        this.armAckTimer();
    }

    /**
     * Commit a recipe that was uploaded but held back. See `setAutoStart`.
     *
     * From here on a started brew is indistinguishable from an auto-started
     * one: same phase, same acknowledgement question.
     */
    async startBrew(): Promise<void> {
        this.assertOrdinaryOperation();
        const generation = this.generation;
        const ticket = this.cancelTicket;
        const commit = this.pendingCommit;
        if (commit === null) throw new Error("There is no recipe waiting to be started.");
        this.pendingCommit = null;
        this.setPhase({name: "sending"});
        try {
            await this.send(commit);
        } catch (error) {
            if (ticket !== this.cancelTicket) return;
            if (generation === this.generation) {
                this.setPhase({
                    name: "failed", reason: "rejected",
                    detail: error instanceof Error ? error.message : undefined
                });
            }
            throw error;
        }
        if (ticket !== this.cancelTicket) return;
        if (generation !== this.generation) {
            throw new Error("The machine connection changed during the brew start.");
        }
        this.committed = true;
        this.armAckTimer();
    }

    /**
     * Whether offering a mode switch would be a reasonable thing to do.
     *
     * Only after a send has gone nowhere, only on a machine that says it is in
     * EASY, and only once. The app never changes the mode of a machine across
     * the room without asking, and never asks twice about the same brew.
     */
    canOfferProMode(): boolean {
        return this.phase.name === "failed"
            && this.phase.reason === "rejected"
            && this.info?.mode === "EASY"
            && !this.retriedInPro;
    }

    /** Switch the machine to PRO, then send the recipe again. Once. */
    async switchToProAndRetry(recipe: Recipe, verifyTarget?: () => Promise<void>): Promise<void> {
        this.assertOrdinaryOperation();
        const generation = this.generation;
        const ticket = this.cancelTicket;
        const canContinue = (): boolean => {
            if (ticket !== this.cancelTicket) return false;
            if (generation !== this.generation) throw new Error("The machine connection changed.");
            return true;
        };
        if (verifyTarget !== undefined) {
            await verifyTarget();
            if (!canContinue()) return;
        }
        this.retriedInPro = true;
        // Byte-exact, confirmed on hardware: "00000000" is PRO, "91327856" EASY.
        await this.send(buildType2(11511, ascii("00000000")));
        // The brew opens with a handshake, and without this pause that
        // handshake would tread on the mode frame -- the one unpaced seam in
        // the whole sequence, at the position where a lost frame costs most.
        await this.gap();
        if (!canContinue()) return;
        // Renewed after a mode change, as it always was. Nobody has looked at
        // whether a session survives one, and this path is rare enough that a
        // beep is the cheaper risk.
        await this.shakeHands();
        await this.gap();
        if (!canContinue()) return;
        if (verifyTarget !== undefined) {
            await verifyTarget();
            if (!canContinue()) return;
        }
        await this.brewOnce(recipe);
    }

    private armAckTimer(): void {
        this.clearAckTimer();
        this.ackTimer = setTimeout(() => {
            if (this.phase.name === "sending") {
                this.setPhase({name: "failed", reason: "rejected"});
            }
        }, RECIPE_ACK_MS);
        // This timer only waits to see whether the machine answers; it must not
        // by itself keep the process alive (and hold a test runner open) if
        // nothing else is pending.
        this.ackTimer.unref?.();
    }

    private clearAckTimer(): void {
        if (this.ackTimer !== null) clearTimeout(this.ackTimer);
        this.ackTimer = null;
    }

    /**
     * (Re)start the silence watchdog over settling.
     *
     * Called once when settling opens and again on every frame that arrives
     * during it, so the countdown measures how long the machine has been quiet
     * rather than how long the drawdown has taken. A drawdown may take as long
     * as it likes; ENJOY ends it. The ceiling is what stops a machine that
     * chatters without ever finishing from hanging the run.
     */
    private armSettleTimer(): void {
        this.clearSettleTimer();
        const since = Date.now() - this.settleOpenedAt;
        const wait = Math.max(0, Math.min(this.settleCapMs, SETTLE_CEILING_MS - since));
        this.settleTimer = setTimeout(() => {
            // Only if nothing else moved the run on. A dropped ENJOY must not
            // strand it in a non-terminal phase forever.
            if (this.phase.name === "settling") this.setPhase({name: "done"});
        }, wait);
        this.settleTimer.unref?.();
    }

    private clearSettleTimer(): void {
        if (this.settleTimer !== null) clearTimeout(this.settleTimer);
        this.settleTimer = null;
    }

    /**
     * Wait for the next state report `accept` takes, or give up.
     *
     * Listening starts at the call, so call it before sending the frame that
     * provokes the report: the answer can arrive inside the write.
     *
     * @returns the state reported, or null when none came in time.
     */
    private waitForState(accept: (state: number) => boolean): Promise<number | null> {
        const generation = this.generation;
        return new Promise((resolve) => {
            const finish = (state: number | null): void => {
                clearTimeout(timer);
                off();
                resolve(state);
            };
            const off = this.onNotification((parsed) => {
                if (generation !== this.generation) {
                    finish(null);
                    return;
                }
                if (parsed.kind === "status" && accept(parsed.state)) finish(parsed.state);
            });
            const timer = setTimeout(() => finish(null), this.stateReplyMs);
            timer.unref?.();
        });
    }

    /**
     * Send one cancel (40519) and wait for the machine to say it is startable.
     *
     * Every 40519 beeps, so a cancel already in flight is shared rather than
     * repeated. Owner logs of 2026-10-19 (V12.0D.500) caught two and three of
     * them a second apart, each one a beep, after the machine had already
     * reported `0x41` to the first. The old pair, 40519 then 8022 after a
     * fixed gap, gave the machine no say in when it was done, and a second
     * caller inside that gap sent a second 40519.
     *
     * Through `sendPaced`, which takes the radio away from a brew sequence
     * that may still be mid-flight. A machine that never reports is waited on
     * for `STATE_REPLY_MS` and no longer.
     */
    private cancelOnce(): Promise<void> {
        if (this.cancelling !== null) return this.cancelling;
        const run = async (): Promise<void> => {
            const generation = this.generation;
            const settled = this.waitForState((state) => STARTABLE.has(state));
            await this.sendPaced([buildType1(40519, [1])]);
            await settled;
            if (generation !== this.generation) {
                throw new Error("The machine connection changed during cancellation.");
            }
        };
        const tracked: Promise<void> = run().finally(() => {
            if (this.cancelling === tracked) this.cancelling = null;
        });
        this.cancelling = tracked;
        return tracked;
    }

    /**
     * Get a machine that may be sitting on a warning ready for a recipe.
     *
     * Nothing at all after a brew that ended cleanly, as before. Otherwise the
     * last state the machine reported decides: a startable one (idle,
     * complete, ready) needs nothing, and anything else gets one cancel. A
     * link with no state report yet (a fresh reconnect sends none) asks with
     * 8022 first, the back-to-home the official app sends on connect
     * (`ble-protocol.md`), and cancels only when the answer is not startable
     * or no answer comes. No 8022 follows the cancel here: the machine
     * reporting a startable state is what it was for.
     */
    private async clearForBrew(): Promise<void> {
        if (this.userCancel !== null) {
            await this.userCancel;
            return;
        }
        if (!this.mayBeShowingAWarning()) return;
        if (this.cancelling !== null) {
            await this.cancelling;
            return;
        }
        let state = this.state;
        if (state === null) {
            const generation = this.generation;
            const ticket = this.cancelTicket;
            const answered = this.waitForState(() => true);
            await this.sendPaced([buildType1(8022)]);
            state = await answered;
            if (generation !== this.generation) {
                throw new Error("The machine connection changed during brew preparation.");
            }
            if (ticket !== this.cancelTicket) return;
        }
        if (state !== null && STARTABLE.has(state)) return;
        await this.cancelOnce();
    }

    /**
     * Stop a brew and put the machine back on its home screen.
     *
     * One 40519, then the machine's own report that it has stopped, then the
     * 8022 the official app sends after a cancel. A second tap while this is
     * under way joins it and sends nothing.
     */
    cancelBrew(): Promise<void> {
        if (this.userCancel !== null) return this.userCancel;
        this.cancelTicket++;
        this.pendingCommit = null;
        const generation = this.generation;
        const run = async (): Promise<void> => {
            await this.cancelOnce();
            if (generation !== this.generation) {
                throw new Error("The machine connection changed during cancellation.");
            }
            await this.sendPaced([buildType1(8022)]);
            if (generation !== this.generation) {
                throw new Error("The machine connection changed during cancellation.");
            }
            this.setPhase({name: "cancelled"});
        };
        const tracked: Promise<void> = run().finally(() => {
            if (this.userCancel === tracked) this.userCancel = null;
        });
        this.userCancel = tracked;
        return tracked;
    }

    /**
     * Ask the machine to stop, keeping the brew where it is.
     *
     * Deliberately does **not** set the phase. The machine's only confirmation
     * that a brew is paused is `40515`; its state settles on `0x1f`, which is
     * `ARMED` and says nothing. Setting the phase here would be claiming a
     * pause on the strength of having asked for one, and the next thing
     * somebody does after pressing PAUSE is walk away from the machine.
     *
     * Inert when nothing is running, so there is no state guard.
     */
    async pauseBrew(pauseKind?: "overflow"): Promise<void> {
        this.assertOrdinaryOperation();
        this.clearPauseRequest();
        const token = ++this.pauseRequestToken;
        this.pauseRequested = true;
        this.pendingPauseKind = pauseKind;
        this.pauseTimer = setTimeout(() => {
            // The machine did not answer. Drop the request rather than the
            // phase: nothing was ever claimed, so there is nothing to undo.
            if (this.pauseRequestToken === token) this.clearPauseRequest();
        }, PAUSE_ACK_MS);
        this.pauseTimer.unref?.();
        try {
            await this.send(buildType1(COMMAND_PAUSE, [1]));
        } catch (error) {
            if (this.pauseRequestToken === token) this.clearPauseRequest();
            throw error;
        }
    }

    /**
     * Let a paused brew carry on from where it stopped.
     *
     * Optimistic, which is the opposite of `pauseBrew` and is the safe
     * direction for the same reason. A resume that did not take leaves the UI
     * saying "running" about a stopped machine, which the next stage event
     * corrects and which costs nothing while it lasts. Waiting for `40516`
     * instead would leave it saying "paused" about a machine pouring water.
     */
    async resumeBrew(): Promise<void> {
        this.assertOrdinaryOperation();
        this.leavePause();
        await this.send(buildType1(COMMAND_RESUME, [1]));
    }

    /**
     * Drop the pause, restoring whatever the brew was doing.
     *
     * Called by the resume, and by every event that contradicts a pause. The
     * contradiction list is deliberately a default rather than an enumeration:
     * an uncatalogued event should fall through to "not paused", because an
     * offered RESUME that does nothing (and `40524` is inert) costs far less
     * than a pause the app has invented.
     */
    private leavePause(): void {
        this.clearPauseRequest();
        if (this.phase.name === "paused") this.setPhase(this.phase.was);
    }

    private clearPauseRequest(): void {
        this.clearPauseTimer();
        this.pauseRequested = false;
        this.pendingPauseKind = undefined;
    }

    private clearPauseTimer(): void {
        if (this.pauseTimer !== null) clearTimeout(this.pauseTimer);
        this.pauseTimer = null;
    }

    /**
     * Whether the machine is likely to be sitting on something it wants
     * acknowledged, rather than on its home screen.
     *
     * Two endings are excluded. A pre-flight refusal never told the machine
     * anything, so there is nothing on its screen. And a cancel already sent it
     * home -- that is what `cancelBrew` is.
     */
    private mayBeShowingAWarning(): boolean {
        const p = this.phase;
        if (p.name === "lostContact") return true;
        return p.name === "failed" && p.reason !== "blocked";
    }

    private onState(state: number): void {
        if (!this.brewing) return;
        switch (state) {
            case MACHINE_STATE.ARMED:
            case MACHINE_STATE.LOADING:
                // A pause settles the state on ARMED, which is the whole
                // ambiguity: the code a paused brew reports is the code a
                // loaded-but-unstarted brew reports. Reading it as a fresh
                // load here would throw the pause away a moment after
                // entering it, and would do so whichever order 40515 and the
                // state arrive in.
                //
                // Three readings of the same flag, kept apart on purpose.
                // `pauseSent` is the long one: it is true from the frame
                // going out until a resume goes out, and it is what stops the
                // #199 ending below from calling a held brew a stopped one.
                // `pauseRequested` is the short one, dropped after
                // `PAUSE_ACK_MS`, and it is what stops a *fresh load* being
                // read in. They overlap here and that is fine; collapsing
                // them would tie the ending's silence to the acknowledgement
                // window, which is a guess.
                if (this.pauseSent) break;
                if (this.pauseRequested || this.phase.name === "paused") break;
                // Not while a recipe is waiting to be started: this is the
                // machine acknowledging the upload, and letting it replace the
                // phase would take away the only control that can commit it.
                if (this.pendingCommit !== null) break;
                // A brew that has started cannot become a loaded recipe again.
                // Read literally, it did: #199 carries a screenshot of a brew
                // stopped two grams short of its last stage, 423 ml in, with
                // the headline reading "Recipe loaded." and CANCEL the only
                // control on the screen. The machine sent no fault for it, so
                // nothing else said the brew was over, nothing terminal was
                // reached, and the record was never written -- the user's
                // whole complaint was that the brew vanished.
                //
                // So the state walking backwards is itself the ending. Why is
                // not knowable from here and is not guessed at.
                if (STARTED.has(this.phase.name)) {
                    this.setPhase({name: "failed", reason: "stopped"});
                    break;
                }
                this.setPhase({name: "armed"});
                break;
            case MACHINE_STATE.AWAITING_CONFIRM:
                // "Waiting to be started" -- the machine cannot say by whom,
                // and only we know. Once our commit has gone out this is a
                // waypoint on the way to grinding, and hardware confirms the
                // firmware usually skips it entirely; telling the user to
                // press a button they just pressed in the app is how it read
                // on the device.
                //
                // Uncommitted, it is the state the prompt exists for. We still
                // do not send 40518 to escape it: one source watched it move
                // the state backwards, another verified it aborts a running
                // brew, a third calls it PAUSE.
                if (this.committed) break;
                this.setPhase({name: "pressPlay"});
                break;
            case MACHINE_STATE.STARTING:
                this.pauseSent = false;
                // Grinding begins here, and the machine now goes silent for
                // about twenty seconds. There is no timeout on this phase.
                this.setPhase({name: "grinding"});
                break;
            case MACHINE_STATE.NO_BEANS:
                this.setPhase({name: "failed", reason: "noBeans"});
                break;
            case MACHINE_STATE.NO_WATER:
                // The 0x57 status channel reports a water *level*, not a
                // *fault*. While the pump draws hard during a pour, a tank
                // sitting near the float sensor's threshold dips transiently
                // below it and surfaces here as NO_WATER.
                //
                // Its neighbour, event 40522, was once read as the explicit
                // fault channel that justified this being only a level. That
                // turned out to be a level warning too — see `EVENT.WATER_LOW`
                // — so neither channel stops a running pour any more.
                //
                // In the field report that prompted this, the machine was
                // observed pouring normally throughout — it never beeped, never
                // showed a water warning, and 40522 never fired — yet a single
                // 0x0C mid-pour discarded the whole brew. So once water is
                // actually running we ignore the *state*: `pouring`, and
                // `settling` too, where the pour is over and the record all but
                // complete, so throwing a finished brew away over a level
                // reading would be strictly worse than the bug being fixed.
                // Every other phase keeps the original fatal handling.
                //
                // The frame buffer added alongside this did its job: the
                // console log of 2026-09-09 caught the next occurrence and
                // showed 40522, not 0x0C, ending a brew the machine completed.
                if (this.phase.name === "pouring" || this.phase.name === "bypass"
                    || this.phase.name === "settling") break;
                this.setPhase({name: "failed", reason: "noWater"});
                break;
            default:
                break;
        }
    }

    private onEvent(code: number, value?: number): void {
        if (!this.brewing) return;

        if (code === EVENT.COFFEE_PAUSED) {
            // The only confirmation a pause ever gets, and it is honoured only
            // against a request of ours. An unasked-for 40515 is not evidence
            // the user stopped anything.
            if (!this.pauseRequested) return;
            const pauseKind = this.pendingPauseKind;
            this.clearPauseRequest();
            const was = this.phase.name === "paused" ? this.phase.was : this.phase;
            const pour = was.name === "pouring" ? was.pour : 0;
            const pours = was.name === "pouring" ? was.pours : 0;
            this.setPhase({name: "paused", pour, pours, was,
                ...(pauseKind === undefined ? {} : {pauseKind})});
            return;
        }

        // Anything else is the brew moving, which contradicts a pause whoever
        // caused it -- us, the machine's own buttons, or a fault. Dropped
        // before the event is handled, so the handler below sees the phase the
        // brew was really in.
        this.leavePause();
        if (code === EVENT.COFFEE_RESUMED) return;

        if (code === EVENT.ERROR_IDLING) {
            // An idle event during grinding suggests missing beans, but only
            // state 0x0F confirms that. Keep the observation distinct.
            this.setPhase(this.phase.name === "grinding"
                ? {name: "failed", reason: "grindingStopped"}
                : {name: "failed", reason: "idling"});
            return;
        }

        const failure = FAILURE_EVENTS[code];
        if (failure !== undefined) {
            this.setPhase({name: "failed", reason: failure});
            return;
        }

        switch (code) {
            case EVENT.GRINDER_POSITION:
                // Positioning can outlast the start timeout. Changing gear
                // readings prove progress, not that grinding has begun.
                if (this.committed && this.phase.name === "sending"
                    && value !== undefined && value !== this.startupGrinderPosition) {
                    this.startupGrinderPosition = value;
                    this.armAckTimer();
                }
                break;
            case EVENT.GRINDER_STOP:
                this.setPhase({name: "pouring", pour: 1, pours: this.pourCount});
                break;
            case EVENT.POUR_START:
                this.setPhase({
                    name: "pouring",
                    // The machine's index is **zero-based**: the HCI snoop
                    // quoted in docs/machine-integration/ble-protocol.md
                    // records 0 for the first pour of six and 5 for the last.
                    // Clamping it up to one with `Math.max`
                    // made the first stage right by accident and every later
                    // stage wrong by one, which froze the counter, stopped the
                    // second rung ever animating and left the holding warning
                    // permanently on.
                    pour: Math.min((value ?? 0) + 1, this.pourCount),
                    pours: this.pourCount
                });
                break;
            case EVENT.RD_BYPASS:
                // Deliberately not clamped into the pours, the way POUR_START
                // is. The bypass is after them.
                this.setPhase({name: "bypass"});
                break;
            case EVENT.BREWER_STOP:
                // Water is done, drawdown is not. Enter settling so the
                // recorder keeps the cup filling; the brew ends when the cup
                // line flattens, not here.
                this.setPhase({name: "settling"});
                break;
            case EVENT.ENJOY:
            case EVENT.ENJOY_2:
                // The first ENJOY is the machine's coffee-ready signal and the
                // point where its own UI considers the brew complete. ENJOY_2
                // remains a fallback for firmware that omits the first event.
                this.setPhase({name: "done"});
                break;
            default:
                break;
        }
    }

    private forget(): void {
        ++this.generation;
        ++this.sequence;
        this.ordinaryOperations.clear();
        this.unsettledCommand = false;
        this.slotSession?.invalidate(new Error("Easy Mode link lost. Receipt is unknown."));
        this.connectedId = null;
        this.unsubscribe.forEach((off) => off());
        this.unsubscribe = [];
        // The acknowledgement timer must not outlive the link it was asking
        // about: a fired timer after a disconnect would report a phantom
        // failure about a machine we are no longer talking to.
        this.clearAckTimer();
        // Likewise the settling watchdog: a promotion to `done` fired after the
        // link dropped would land on whatever brew came next.
        this.clearSettleTimer();
        this.clearPauseRequest();
        if (this.brewing) {
            // The machine executes a committed recipe itself, so a dropped
            // link is very probably not a failed brew. Saying "failed" would
            // send somebody to rescue a brew that is going fine.
            this.setPhase({name: "lostContact"});
        }
        // Not merely tidiness: a stale info blob would let the app claim the
        // tank is full and the mode is PRO about a machine it is no longer
        // talking to.
        this.info = null;
        this.infoAt = 0;
        this.waterPresent = null;
        // A cancel waiting on the old link's answer is not one a new link can
        // share.
        this.cancelling = null;
        this.userCancel = null;
        this.state = null;
        this.stateAt = 0;
        // Last, so a listener reading `isConnected()` or `info` sees the link
        // as gone rather than half torn down.
        this.announceLink();
    }
}

/**
 * Command 8104, the cup weight range, as two IEEE-754 floats.
 *
 * XBRW++ used to omit this on the grounds that three implementations send
 * three different value sets and nobody can name the field. That was a
 * misreading of the evidence: the sources disagree about the *values*, not
 * about whether the command is sent — all of them send it, and the reference
 * brew sequence that works on hardware sends it between the dose and the
 * recipe.
 *
 * (200.0, 80.0) is the reference's default and is HCI-confirmed for Free Solo.
 * It is also the widest range, which is the conservative choice for a field
 * that appears to govern overflow protection: too wide risks nothing that the
 * machine's own sensors do not already catch, while too narrow could refuse a
 * cup that is perfectly fine.
 */
function setCupFrame(): Uint8Array {
    const payload = new Uint8Array(8);
    const view = new DataView(payload.buffer);
    view.setFloat32(0, 200.0, true);
    view.setFloat32(4, 80.0, true);
    return buildType1Bytes(8104, payload);
}

/** Exported for the copy that explains the handshake budget. */
export {HANDSHAKE_WINDOW_MS};
