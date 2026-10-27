import {useEffect, useState} from "react";
import {AppState, Linking} from "react-native";

import {
    ADD_SCAN_SECONDS,
    CONNECT_DELAYS_MS,
    STUDIO_MODEL_STRINGS,
    SURVEY_SECONDS
} from "@/constants/machine";
import {sharedSettings, useSetting} from "@/hooks/useSetting";
import {useSavedMachines} from "@/hooks/useSavedMachines";
import {sharedSlotDatabase} from "@/hooks/useEasyModeSlots";
import {installMachineSlotPort} from "@/library/slots/machineSlotPort";
import {unavailableSlotPort, type SlotPort} from "@/library/slots/slotWriter";
import {notify} from "@/components/XbrwToast";
import Machine, {
    isActiveBrewPhase,
    type BrewPhase
} from "@/library/machine/Machine";
import {asMachineModel, type MachineModel} from "@/library/machine/machineModel";
import type {Settings} from "@/library/Settings";
import {ControlRecoveryStore} from "@/library/machine/controlRecovery";
import type {ControlRecoverySnapshot} from "@/library/machine/controlRecovery";
import MachineControls from "@/library/machine/MachineControls";
import {
    BluetoothPermissionError,
    ControlOperationError,
    NoSavedMachineError,
    RadioUnavailableError,
    SlotOperationError,
    WrongMachineError
} from "@/library/machine/errors";
import {
    bestSavedMachine,
    machineLabel,
    scanVerdict,
    unsavedMachines,
    type SavedMachine
} from "@/library/machine/savedMachines";
import {
    activateSavedMachine,
    addAndActivateMachine,
    forgetSavedMachine,
    loadSavedMachines,
    recordSerial,
    rememberMachine,
    restoreMachineInUse
} from "@/library/machine/savedMachineSettings";
import {
    BleTransport,
    ensureBluetoothPermission,
    type BluetoothPermissionResult,
    type FoundMachine,
    type ScanDecider
} from "@/library/machine/Transport";

export type LinkStatus = "idle" | "disconnected" | "connecting" | "connected" | "failed";

/**
 * One machine for the whole app.
 *
 * Shared rather than per-hook: the machine permits a single BLE link, so two
 * `Machine` instances would fight over it. Built lazily, because constructing
 * the transport touches the native module and importing a screen must not.
 */
let shared: Machine | undefined;
let sharedPort: SlotPort = unavailableSlotPort;
let sharedControls: MachineControls | undefined;
let stopSharedLifecycle: (() => void) | undefined;
let stopSharedControl: (() => void) | undefined;
let stopSharedReadings: (() => void) | undefined;

export function sharedMachine(): Machine {
    if (shared === undefined) {
        const machine = new Machine(new BleTransport());
        const settings = sharedSettings();
        stopSharedControl = machine.installControlRecovery(new ControlRecoveryStore({
            read: () => settings.get("machineControlRecovery"),
            write: (value) => settings.set("machineControlRecovery", value)
        }));
        sharedPort = installMachineSlotPort(machine, sharedSlotDatabase());
        sharedControls = new MachineControls(machine, {
            reconnect: (target, check) => openLink(machine, settingsStore(), undefined, {target, check, delays: [0]})
        });
        stopSharedLifecycle = holdLinkAcrossAppState(machine,
            (target) => openLink(machine, settingsStore(), undefined, {target}), {controls: sharedControls});
        // Whenever the machine describes itself, keep its serial against the
        // saved entry it belongs to. By `slotIdentity`, which names the
        // peripheral actually connected, never by `machineDeviceId`: during a
        // switch that already names the next machine while the old link is
        // still being let go.
        //
        // Link events are frequent (every console note is one), so the pair
        // last kept is remembered and the store is only read when it changes.
        let kept = "";
        stopSharedReadings = machine.onLink(() => {
            const identity = machine.slotIdentity;
            if (identity?.serial == null) return;
            const reserved = machine.controlRecovery?.marker;
            if (reserved && (reserved.deviceId !== identity.deviceId || reserved.serial !== identity.serial)) return;
            const pair = `${identity.deviceId}|${identity.serial}`;
            if (pair === kept) return;
            kept = pair;
            try {
                recordSerial(sharedSettings(), identity.deviceId, identity.serial);
            } catch (error) {
                machine.note(`could not keep the serial — ${(error as Error).message}`);
            }
        });
        shared = machine;
    }
    return shared;
}

export function sharedMachineControls(): MachineControls {
    sharedMachine();
    return sharedControls!;
}

/**
 * The machine the user picked by hand in this run of the app, or "".
 *
 * A pick outranks the priority order until the app is closed. Without it, a
 * trip to another app in a cafe would hand the link back on the way out and
 * take it again, on the way in, from whichever saved machine ranks highest:
 * somebody who had just switched to the machine in front of them would be
 * switched back without being asked. Not persisted, because the next launch
 * is a new place, and the order is how the user said to handle a new place.
 */
let chosenThisSession = "";

/** The remembered-machine half of the settings store, as the link needs it. Exported for tests. */
export function settingsStore(settings: Settings = sharedSettings()): LinkStore {
    return {
        rememberedId: () => settings.get("machineDeviceId"),
        rememberId: (id) => rememberMachine(settings, id),
        recordMachine: (reading) => applyMachineReading(settings, reading),
        savedMachines: () => loadSavedMachines(settings),
        chosenId: () => chosenThisSession,
        recordSerial: (id, serial) => recordSerial(settings, id, serial)
    };
}

/** What the radio heard about the machine itself, as opposed to the link. */
export type MachineReading = {model: string; name: string};

/** Where the remembered machine is kept. Injected, so the algorithm is testable. */
export type LinkStore = {
    rememberedId: () => string;
    rememberId: (id: string) => void;
    /**
     * Record what the machine said it was.
     *
     * Separate from `rememberId` because it answers a different question. The
     * id is how to find this machine again; this is what the machine is, and
     * it is kept as evidence rather than as configuration. See issue #138.
     *
     * Returns whether it overruled the user's machine setting.
     */
    recordMachine: (reading: MachineReading) => boolean;
    /**
     * The saved machines, default first.
     *
     * Optional, and a store without it is a one-machine store, which is what
     * every store was before the list. With fewer than two saved the link
     * behaves exactly as it always has.
     */
    savedMachines?: () => SavedMachine[];
    /** The machine picked by hand this session, or "". See `chosenThisSession`. */
    chosenId?: () => string;
    /** Keep the serial a machine reported against its saved entry. */
    recordSerial?: (id: string, serial: string) => void;
};

/** How a caller overrides the retrying, which is only ever a test. */
export type RetryOptions = {delays?: number[]; wait?: (ms: number) => Promise<void>};

/**
 * What `openLink` lets a caller fix in advance.
 *
 * `target` is a peripheral the link must connect to and nothing else: no
 * priority scan and no stale-id rescan. Choosing and adding a machine both
 * need it, because a rescan there could land on a machine nobody picked.
 * `check` revalidates a retained control owner across permission and retries.
 * Its explicit reconnect uses one attempt, so supersession cannot retry over
 * another connection; the owning route offers a deliberate retry instead.
 */
export type LinkOptions = RetryOptions & {target?: string; check?: () => void};

/** What `useMachine` lets a test replace. */
export type MachineOptions = RetryOptions & {settings?: Settings};

/** The part of `AppState` this file uses, so a test can supply its own. */
export type AppStateLike = {
    currentState?: string | null;
    addEventListener: (
        type: "change", handler: (state: string) => void
    ) => {remove: () => void};
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Store what the machine said, and change the setting only when it is certain.
 *
 * Exported for its own tests: this is the rule, and the rest of this file is
 * the plumbing that carries a reading to it.
 *
 * The reading is kept always. It is allowed to overrule the user only on a
 * positive match against a string read off real hardware, because a string we
 * have never seen is not evidence of an original xBloom: we own none to read
 * one from, and a firmware revision would produce an unfamiliar string too.
 * `STUDIO_MODEL_STRINGS` is empty until somebody fills it in, and an empty list
 * matches nothing, so detection is inert rather than wrong.
 *
 * A blank reading is "did not learn", never "learned it is blank", so it is
 * dropped rather than written, and each half is judged on its own. Both halves
 * go blank in ordinary use and neither is a discovery: the Device Information
 * Service is optional, and `advertisedName` is only ever filled in by a scan,
 * which `attemptLink` skips for a returning user. Writing a blank through would
 * erase what an earlier connect found out, on the reconnect after it, for
 * almost everybody, and these two keys exist to be trustworthy about what a
 * real machine said.
 *
 * Returns whether it overruled the user, so the caller can say so in the
 * console. A setting that changes itself and mentions it to nobody is the
 * hardest kind of bug to hear about from the field.
 */
export function applyMachineReading(settings: Settings, reading: MachineReading): boolean {
    if (reading.model !== "") settings.set("machineModelString", reading.model);
    if (reading.name !== "") settings.set("machineName", reading.name);
    // The emptiness half of this is not redundant. `[].includes("")` is already
    // false, but a later edit that put "" on the list by accident would
    // otherwise promote every machine that stayed silent to a Studio.
    const certain = reading.model !== "" && STUDIO_MODEL_STRINGS.includes(reading.model);
    if (!certain || settings.get("machineModel") === "studio") return false;
    settings.set("machineModel", "studio");
    return true;
}

/**
 * Throw away what the machine said, for a user pairing a different one.
 *
 * The opposite of the rule above, and not a contradiction of it. A blank
 * reading on reconnect means "did not learn"; unpairing means "this is no
 * longer the machine I was describing". Left behind, `machineModelString`
 * would go on standing as evidence about whatever gets paired next.
 */
export function forgetMachineReadings(settings: Settings): void {
    settings.set("machineModelString", "");
    settings.set("machineName", "");
}

type LinkLifecycleMachine = {
    phase: BrewPhase;
    isConnected: () => boolean;
    disconnect: () => Promise<void>;
    note: (text: string) => void;
    onPhase: (listener: (phase: BrewPhase) => void) => () => void;
    setAppState?: (state: string | null) => void;
    readonly controlRecovery?: ControlRecoverySnapshot | null;
};

/**
 * Hold the link across the app leaving the front and coming back.
 *
 * Two halves, and the app only ever had the first. Going away releases the
 * machine's single connection slot, because an app iOS has suspended is not
 * using the link it holds. **Coming back takes it again** — without that, every
 * trip to another app left the user looking at a machine that said it was not
 * connected, with no way back but Connect, and often not even that.
 *
 * `background` only, never `inactive`. iOS fires `inactive` for notification
 * centre, the app switcher and every system alert, and releasing the link for
 * those made the connection look random.
 *
 * Without a control owner/recovery marker, a link is only restored if this
 * function gave it up. Owned controls instead retain their link and reconcile
 * their exact device on return: OS suspension cannot guarantee a motor stop.
 */
export function holdLinkAcrossAppState(
    machine: LinkLifecycleMachine,
    reconnect: (target?: string) => Promise<void>,
    options: {appState?: AppStateLike; controls?: MachineControls} = {}
): () => void {
    const appState = options.appState ?? AppState;
    machine.setAppState?.(appState.currentState ?? null);

    let released = false;
    let reconnecting = false;
    let backgrounded = false;
    let retainedForBrew = false;
    let releasePromise: Promise<void> | null = null;
    let alive = true;
    const controls = options.controls;
    const ownedControl = () => (controls !== undefined && controls.getSnapshot().phase !== "closed")
        || machine.controlRecovery?.marker != null;
    const controlTarget = () => machine.controlRecovery?.marker?.deviceId
        ?? (ownedControl() ? controls?.getSnapshot().identity?.deviceId : undefined);

    function release(note: string): void {
        if (ownedControl()) return;
        if (!machine.isConnected() || released) return;
        released = true;
        retainedForBrew = false;
        machine.note(note);
        releasePromise = machine.disconnect()
            .catch((error) => {
                machine.note(`could not give the link back — ${(error as Error).message}`);
            })
            .finally(() => {
                releasePromise = null;
            });
    }

    const phaseSubscription = machine.onPhase((phase) => {
        if (!backgrounded || !retainedForBrew || isActiveBrewPhase(phase)) return;

        // A real transport loss reaches `lostContact` after the radio is already
        // gone. Do not mark that as our release: foregrounding must not reconnect
        // into a brew whose live state is unknown.
        if (!machine.isConnected()) {
            retainedForBrew = false;
            return;
        }

        release("brew ended in the background — giving the link back");
    });

    const appStateSubscription = appState.addEventListener("change", (next) => {
        machine.setAppState?.(next);
        if (next === "background") {
            backgrounded = true;
            if (!machine.isConnected()) return;

            if (ownedControl()) {
                released = false;
                machine.note("owned machine control went to the back — retaining the link; OS suspension is not a stop");
                return;
            }

            if (isActiveBrewPhase(machine.phase)) {
                retainedForBrew = true;
                released = false;
                machine.note("active brew went to the back — keeping the link");
                return;
            }

            release("app went to the back — giving the link back");
            return;
        }

        if (next !== "active") return;
        backgrounded = false;
        retainedForBrew = false;
        const target = controlTarget();
        const reconcile = target !== undefined && (ownedControl() || machine.controlRecovery?.marker != null);
        if ((!released && !reconcile) || reconnecting) return;

        reconnecting = true;
        machine.note("app came to the front — taking the link back");
        void (async () => {
            try {
                await releasePromise;
                if (!alive) return;
                if (!machine.isConnected()) {
                    if (target === undefined) await reconnect();
                    else await reconnect(target);
                }
                if (!alive) return;
                // Inspection is qualified and never replays Enter or Start.
                if (reconcile && controls && (controls.getSnapshot().phase === "unknown"
                    || (controls.getSnapshot().phase === "closed" && machine.controlRecovery?.marker != null))) {
                    await controls.recover();
                }
                if (backgrounded) {
                    released = false;
                    if (isActiveBrewPhase(machine.phase)) {
                        retainedForBrew = true;
                        machine.note("active brew is in the back — keeping the restored link");
                        return;
                    }
                    release("reconnect finished in the back — giving the link back");
                    return;
                }
                released = false;
            } catch (error) {
                machine.note(`could not take it back — ${(error as Error).message}`);
            } finally {
                reconnecting = false;
            }
        })();
    });

    return () => {
        alive = false;
        appStateSubscription.remove();
        phaseSubscription();
    };
}

/**
 * Connect to the machine the user has already paired, if there is one.
 *
 * Called once at launch. Silent about failure on purpose: nobody pressed
 * anything, so nobody should be shown an error — the status line in Settings
 * says it well enough, and Connect is still there.
 *
 * Does nothing at all when no machine has been paired. A beep at launch, for
 * somebody who opened the app to edit a recipe and will never own a J15, is the
 * machine shouting about something nobody asked for; and it must not provoke a
 * Bluetooth permission prompt either.
 */
export async function connectRememberedMachine(
    machine: Machine,
    store: LinkStore,
    ensurePermission: () => Promise<BluetoothPermissionResult> = ensureBluetoothPermission,
    options: RetryOptions = {}
): Promise<void> {
    try {
        if (machine.controlRecoveryTarget === null && store.rememberedId() === "") return;
        machine.note("launch — connecting to the remembered or recovery machine");
        await openLink(machine, store, ensurePermission, options);
    } catch {
        // Deliberately swallowed. See above.
    }
}

/**
 * Take the link at launch, if a machine has been paired.
 *
 * Called from the root layout rather than from a screen, because the settings
 * screen is where the only `useMachine` on a normal launch path lives and a
 * user who never opens it would never be connected.
 *
 * This *is* the warm connect: by the time anyone reaches for BREW the app
 * already knows whether the machine is there and whether its tank has water.
 * Resist the urge to add a second one inside `sharedMachine()` — merely asking
 * for the machine must not touch the radio, which is the whole reason the
 * remembered-id check above is repeated here.
 */
export function startMachineLink(): void {
    const store = settingsStore();
    // Checked here as well as inside `connectRememberedMachine`, and for a
    // different reason: building the shared machine builds the BLE manager,
    // which is enough on its own to put a "turn Bluetooth on" alert in front of
    // somebody who has never paired anything and never will.
    if (store.rememberedId() === "") {
        try {
            if (sharedSettings().get("machineControlRecovery") === "") return;
        } catch {
            // Construct the owner so its recovery-store error stays visible.
        }
    }
    void connectRememberedMachine(sharedMachine(), store);
}

/** Tests only. */
export function __resetSharedMachine(): void {
    chosenThisSession = "";
    lastSurvey = null;
    scanQueue = Promise.resolve();
    stopSharedLifecycle?.();
    stopSharedLifecycle = undefined;
    sharedControls?.dispose();
    sharedControls = undefined;
    stopSharedControl?.();
    stopSharedControl = undefined;
    stopSharedReadings?.();
    stopSharedReadings = undefined;
    shared = undefined;
    sharedPort = unavailableSlotPort;
}

/**
 * Connect to the remembered machine, or find one and remember it.
 *
 * A plain function rather than part of the hook, because the link has to be
 * restorable from the app-state handler, which runs nowhere near React.
 */
export async function openLink(
    machine: Machine,
    store: LinkStore,
    ensurePermission: () => Promise<BluetoothPermissionResult> = ensureBluetoothPermission,
    options: LinkOptions = {}
): Promise<void> {
    options.check?.();
    const recoveryTarget = machine.controlRecoveryTarget;
    // Capture the explicit retained-owner scope before awaiting permission.
    // Its check pins the lease/identity across every await; ordinary connects
    // still follow selection and never gain this info-only recovery path.
    const ownedReconnect = options.check !== undefined && options.target !== undefined
        && machine.controlBlocker !== null;
    if (recoveryTarget !== null && options.target !== undefined && options.target !== recoveryTarget) {
        throw new ControlOperationError("Recover the uncertain control operation before changing machines.");
    }
    if (machine.isConnected()) {
        if (recoveryTarget !== null && machine.linkedDeviceId !== recoveryTarget) {
            throw new ControlOperationError("The connected device is not the control recovery device.");
        }
        return;
    }
    const startedWith = store.rememberedId();
    // Outside the retrying on purpose. Waiting fourteen seconds to be told the
    // app needs permission it has already been denied helps nobody.
    await requirePermission(ensurePermission);
    options.check?.();

    // Which machine, decided once, before the retrying (see the spec's
    // "Connection algorithm"). With fewer than two saved, `target` stays
    // undefined and the loop below is exactly the single-machine path it has
    // always been, stale-id rescan included. With two or more, in order:
    //
    // 1. A brew the link lost (`lostContact`) pins the machine in use. That
    //    machine is assumed to be still pouring, and `Machine.brewBlock` has
    //    no `lostContact` check, so letting a scan pick another machine here
    //    would let a BREW on another recipe start somewhere else while the
    //    first may still be running.
    // 2. A machine picked by hand this session.
    // 3. One scan, which prefers the machine in use when it is heard and
    //    otherwise follows the priority order.
    let target = recoveryTarget ?? options.target;
    const saved = target === undefined ? store.savedMachines?.() ?? [] : [];
    if (saved.length >= 2) {
        const active = store.rememberedId();
        const chosen = store.chosenId?.() ?? "";
        if (machine.phase.name === "lostContact" && active !== "") {
            machine.note(`a brew lost contact — reconnecting to ${active} only`);
            target = active;
        } else if (chosen !== "" && saved.some((entry) => entry.id === chosen)) {
            target = chosen;
        } else {
            target = await findSavedMachine(machine, saved, active);
        }
    }

    const delays = options.delays ?? CONNECT_DELAYS_MS;
    const wait = options.wait ?? sleep;
    let lastFailure: Error | null = null;
    for (const delay of delays) {
        if (delay > 0) await wait(delay);
        options.check?.();
        if (machine.controlRecoveryTarget !== recoveryTarget) {
            throw new ControlOperationError("The control recovery target changed while connecting.");
        }
        // The retrying takes the better part of fifteen seconds. Somebody who
        // gives up on it and presses "forget this machine" has said what they
        // want, and connecting anyway would be the app arguing with them. The
        // same goes for picking another machine meanwhile, which moves the
        // active machine rather than emptying it: hence "changed", not "empty".
        if (recoveryTarget === null && !ownedReconnect && startedWith !== "" && store.rememberedId() !== startedWith) {
            throw new WrongMachineError("Connecting was cancelled. The machine selection changed.");
        }
        if (saved.length >= 2 && !store.savedMachines?.().some(entry => entry.id === target)) {
            throw new WrongMachineError(
                "The selected machine is not saved any more. Choose a machine, then try again."
            );
        }
        try {
            await attemptLink(machine, store, target, recoveryTarget !== null || ownedReconnect, options.check);
            options.check?.();
            return;
        } catch (e) {
            if (e instanceof RadioUnavailableError) throw e;
            lastFailure = e as Error;
        }
    }
    // The reason has to survive the retrying: "the machine is already in use by
    // another app" is far more use to somebody than "could not connect".
    throw lastFailure ?? new Error("Could not connect to the machine.");
}

/** The permission check `openLink` runs first, shared with adding a machine. */
async function requirePermission(
    ensurePermission: () => Promise<BluetoothPermissionResult>
): Promise<void> {
    const permission = await ensurePermission();
    if (!permission.granted) {
        // Two different refusals on Android, and only one of them can be
        // undone by asking again. "Grant permission" is bad advice to somebody
        // whose second refusal has already turned the system dialog off for
        // good; the only route left is the app's own page in Settings.
        throw permission.permanentlyDenied
            ? new BluetoothPermissionError(
                "Bluetooth permission is off for XBRW++. Turn it on in Settings to reach the machine.",
                true
            )
            : new BluetoothPermissionError(
                "XBRW++ needs permission to use Bluetooth to reach the machine.",
                false
            );
    }
}

/** What the last full scan heard, and when. Read by the picker for "Nearby". */
export type Survey = {at: number; heard: FoundMachine[]};

let lastSurvey: Survey | null = null;
const surveyListeners = new Set<() => void>();
/** The tail of the scan queue. See `exclusiveScan`. */
let scanQueue: Promise<unknown> = Promise.resolve();

/** The last survey, or null if nothing has been heard in this run of the app. */
export function latestSurvey(): Survey | null {
    return lastSurvey;
}

/** Be told when a scan finishes. Returns the unsubscribe. */
export function onSurvey(listener: () => void): () => void {
    surveyListeners.add(listener);
    return () => { surveyListeners.delete(listener); };
}

/**
 * Every scan in this file, one at a time.
 *
 * The radio has one scanner. A picker that looks around while the launch
 * connect is still listening would call `BleManager.scan` a second time, and
 * the second call's `stopScan` would end the first one's window early. So
 * scans queue behind each other instead.
 *
 * Only a scan that listened for its whole window is kept as the latest
 * survey (`publish`). A connect's scan stops as soon as it hears the machine
 * it wants, so what it heard is not a fair answer to "which machines are
 * nearby", and the picker would mark machines in the room as not nearby.
 *
 * Exported for tests.
 */
export async function exclusiveScan(
    machine: Pick<Machine, "scan">, decide?: ScanDecider, seconds?: number, publish = false
): Promise<FoundMachine[]> {
    const run = scanQueue.then(() => machine.scan(decide, seconds));
    scanQueue = run.catch(() => undefined);
    const found = await run;
    if (publish) {
        lastSurvey = {at: Date.now(), heard: found};
        surveyListeners.forEach((listener) => listener());
    }
    return found;
}

/**
 * Listen for every xBloom in range, for the picker's "Nearby".
 *
 * A short scan that never stops early, because the point is to hear all of
 * them, and that sends nothing to any machine. `SURVEY_SECONDS` long, and
 * only ever run because somebody opened the picker or asked to rescan.
 */
export function surveyMachines(machine: Machine): Promise<FoundMachine[]> {
    machine.note("looking for saved machines nearby");
    return exclusiveScan(machine, () => "continue", SURVEY_SECONDS, true);
}

/**
 * Listen once for every saved machine and take the highest-priority one heard.
 *
 * One scan rather than a connect to each in turn, because a connect to a
 * machine that is not there does not fail fast. Core Bluetooth never times a
 * connection out by itself, and `BleTransport.connect` only gives up at
 * `CONNECT_TIMEOUT_MS`; with `openLink`'s retrying on top, an absent Home
 * would cost about a minute before Work was even tried. A scan hears every
 * advertising xBloom in the same few seconds, and the list picks.
 *
 * Not retried. A scan that heard none of them has already listened for all of
 * them, so the reason is reported straight away and by name.
 */
async function findSavedMachine(
    machine: Machine, saved: SavedMachine[], preferred: string
): Promise<string> {
    const priority = saved.map((entry) => entry.id);
    machine.note(`${saved.length} machines saved — scanning, the machine in use first, then the order`);
    const found = await exclusiveScan(machine, (heard) => scanVerdict(heard, priority, preferred));
    const best = bestSavedMachine(found, saved, preferred);
    if (best === null) {
        // Never a fallback to an xBloom that is not saved. In a cafe that is
        // somebody else's machine, and connecting to it makes it beep.
        const names = saved.map((entry, index) => machineLabel(entry, index)).join(", ");
        throw new NoSavedMachineError(
            `None of your saved machines is nearby (${names}). Check one is switched on, then try again.`
        );
    }
    const heardSaved = found.filter((entry) => priority.includes(entry.id)).length;
    machine.note(heardSaved > 1
        ? `${heardSaved} saved machines in range — taking ${best.id}`
        : `found the saved machine ${best.id}`);
    return best.id;
}

/**
 * One go at it: remembered identifier first, a scan if that has gone stale.
 *
 * With a `target` there is no scan at all. The target was picked from the
 * saved list or picked by hand, and a stale-id rescan takes whatever xBloom
 * answers first, which with several saved is quite possibly not the one that
 * was meant, and in a cafe possibly not one of the user's at all.
 */
async function attemptLink(
    machine: Machine, store: LinkStore, target?: string, recoveryOnly = false, check?: () => void
): Promise<void> {
    const scanForMachine = async (): Promise<string> => {
        const found = await exclusiveScan(machine);
        if (found.length === 0) {
            throw new Error("Could not find a machine. Check it is switched on and nearby.");
        }
        return found[0].id;
    };

    const active = store.rememberedId();
    const remembered = target ?? active;
    machine.note(remembered === ""
        ? "no machine remembered — scanning"
        : `using the remembered machine ${remembered}`);
    // The remembered id first, so a returning user pays for no scan.
    let id = remembered === "" ? await scanForMachine() : remembered;
    try {
        check?.();
        await machine.connect(id);
    } catch (e) {
        if (e instanceof RadioUnavailableError) throw e;
        if (target !== undefined) throw e;
        // A remembered id can go stale — settings restored onto another phone,
        // or a machine that changed its identifier. Falling back to a scan
        // means the user is never stuck retrying a dead id with "forget this
        // machine" as their only way out.
        if (id !== remembered) throw e;
        id = await scanForMachine();
        if (id === remembered) throw e;
        await machine.connect(id);
    }
    check?.();
    // Recovery reconnects a reserved owner, never selects or re-labels a machine.
    if (recoveryOnly) return;
    // Remembering now comes before the reading. Remembering is what makes this
    // machine the active one, and the reading is written to the active
    // machine's keys: in the old order, a switch from Home to Work would have
    // filed Work's model string under Home.
    if (id !== active) {
        store.rememberId(id);
        // Written to the history because the consequence of it not happening is
        // invisible until much later: a ten-second scan on every connect, and
        // no connection at launch at all, because the launch path has nothing
        // to reach for.
        machine.note(`remembering ${id}`);
    }
    // Every successful connect, not only a new machine: firmware can change
    // under an identifier that did not.
    try {
        const corrected = store.recordMachine({
            model: machine.modelNumber, name: machine.advertisedName
        });
        if (corrected) machine.note(`recognised a Studio — machine setting corrected`);
        // The serial is what tells two machines with one name apart. Read off
        // the description the connect just asked for; a machine that did not
        // answer leaves it for `sharedMachine`'s listener to pick up later.
        const serial = machine.info?.serial.trim() ?? "";
        if (serial !== "") store.recordSerial?.(id, serial);
    } catch (error) {
        // Best effort, like every other self-description step in this path.
        // The link is already open and usable; throwing here would report a
        // failure over a machine that is in fact connected.
        machine.note(`could not write down what the machine is — ${(error as Error).message}`);
    }
}

/**
 * Why the machine cannot be changed right now, or null if it can.
 *
 * A brew under way, or one the link lost in the middle of (`lostContact`
 * means the machine is assumed to still be brewing), owns the link. Moving it
 * would leave a dose on one machine and the recorder, the wake lock and the
 * only STOP button pointing at another. An Easy Mode slot operation owns it
 * too, which `assertCanForgetDevice` already knows how to say.
 */
export function machineChangeBlocker(machine: Machine, activeId: string): string | null {
    if (machine.controlBlocker !== null) return machine.controlBlocker.message;
    if (isActiveBrewPhase(machine.phase) || machine.phase.name === "lostContact") {
        return "A brew is running. Stop it or let it finish before changing machines.";
    }
    try {
        const actual = machine.slotIdentity;
        if (actual !== null) machine.assertCanForgetDevice(actual.deviceId);
        if (activeId !== "") machine.assertCanForgetDevice(activeId);
    } catch (failure) {
        if (failure instanceof SlotOperationError || failure instanceof ControlOperationError) return failure.message;
        throw failure;
    }
    return null;
}

/**
 * Switch to a saved machine, by hand.
 *
 * Makes it the active machine first, so its model takes over at once (the
 * importers follow the machine the user is standing at, whether or not it
 * answers), then gives up the current link and connects to this one alone.
 * Sends nothing but the connect and the handshake every connect sends: no
 * recipe and no brew.
 *
 * Throws if it cannot change, or if the machine does not answer. The pick
 * stands either way, so a later Connect or BREW keeps trying the machine the
 * user asked for rather than drifting back to the default.
 */
export async function chooseMachine(
    machine: Machine,
    settings: Settings,
    id: string,
    ensurePermission: () => Promise<BluetoothPermissionResult> = ensureBluetoothPermission,
    options: RetryOptions = {}
): Promise<void> {
    const blocker = machineChangeBlocker(machine, settings.get("machineDeviceId"));
    if (blocker !== null) throw new Error(blocker);
    if (!loadSavedMachines(settings).some((entry) => entry.id === id)) {
        throw new Error("That machine is not saved any more.");
    }
    chosenThisSession = id;
    if (settings.get("machineDeviceId") === id && machine.isConnected()
        && machine.linkedDeviceId === id) return;
    activateSavedMachine(settings, id);
    machine.note(`switching to the saved machine ${id}`);
    if (machine.isConnected()) await machine.disconnect();
    await openLink(machine, settingsStore(settings), ensurePermission, {...options, target: id});
}

/**
 * Every xBloom in range that is not saved yet, for the user to pick one to add.
 *
 * A full scan with no early stop, `ADD_SCAN_SECONDS` long, because with
 * several unsaved machines in a room taking the first one heard would be a
 * guess, and connecting to the wrong one makes somebody else's machine beep.
 * Sends nothing to any machine.
 */
export async function findUnsavedMachines(
    machine: Machine,
    settings: Settings,
    ensurePermission: () => Promise<BluetoothPermissionResult> = ensureBluetoothPermission
): Promise<FoundMachine[]> {
    await requirePermission(ensurePermission);
    machine.note("adding a machine — looking for ones that are not saved");
    const found = await exclusiveScan(machine, () => "continue", ADD_SCAN_SECONDS, true);
    return unsavedMachines(found, loadSavedMachines(settings));
}

/**
 * Connect to the unsaved xBloom the user picked, and save it.
 *
 * The pairing path, not a second one: the same retrying `openLink` and the
 * same reading. The connect is pinned to the picked id, so a retry can never
 * wander onto a machine that is already saved. The new machine goes on the
 * end of the order with the model currently chosen, and becomes the machine in
 * use, because the user is standing in front of it.
 */
export async function addMachine(
    machine: Machine,
    settings: Settings,
    id: string,
    ensurePermission: () => Promise<BluetoothPermissionResult> = ensureBluetoothPermission,
    options: RetryOptions = {}
): Promise<void> {
    const blocker = machineChangeBlocker(machine, settings.get("machineDeviceId"));
    if (blocker !== null) throw new Error(blocker);
    if (loadSavedMachines(settings).some((entry) => entry.id === id)) {
        throw new Error("That machine is already saved.");
    }
    await requirePermission(ensurePermission);
    const entry: SavedMachine = {
        id,
        label: "",
        model: asMachineModel(settings.get("machineModel")),
        modelString: "",
        advertisedName: "",
        serial: ""
    };
    const store: LinkStore = {
        rememberedId: () => settings.get("machineDeviceId"),
        // Not `rememberMachine`: with one machine saved it would read a new id
        // as the stale-id case and rename the existing machine.
        rememberId: () => addAndActivateMachine(settings, entry),
        recordMachine: (reading) => applyMachineReading(settings, reading),
        recordSerial: (machineId, serial) => recordSerial(settings, machineId, serial)
    };
    if (machine.isConnected()) await machine.disconnect();
    machine.note(`adding the machine ${id}`);
    await openLink(machine, store, ensurePermission, {...options, target: id});
    chosenThisSession = id;
}

export type MachineLink = {
    machine: Machine;
    slotPort?: SlotPort;
    status: LinkStatus;
    error: string | null;
    /** The active machine's device id, or "" if no machine has ever connected. */
    remembered: string;
    /**
     * Connect, and **throw** if it did not work.
     *
     * Callers that merely display the link swallow it and read `error`; the
     * brew path needs the throw, because "the machine is already in use by
     * another app" is a far more useful thing to tell somebody than the
     * "not connected" it would otherwise hit one line later.
     */
    connect: () => Promise<void>;
    /** Forget the active machine. */
    forget: () => Promise<void>;
    /**
     * Forget one saved machine. The active one hands over to the new default.
     *
     * Resolves to whether it was forgotten. An Easy Mode slot operation on
     * that machine refuses it, and the reason lands in `error` and a toast.
     */
    forgetMachine: (id: string) => Promise<boolean>;
    /**
     * Switch to a saved machine. Throws, with the reason also in `error`, if
     * it cannot change or the machine does not answer.
     */
    choose: (id: string) => Promise<void>;
    /**
     * After a brew refused to follow the link to another machine: drop that
     * link and make the machine that was on screen the machine in use again.
     */
    keepMachineInUse: (shown: string, linked: string) => Promise<void>;
    /** Connect to and save an unsaved machine the user picked from a scan. */
    add: (id: string) => Promise<void>;
    /** The saved machines, default first. */
    machines: SavedMachine[];
    /**
     * Whether the machine can be changed now, and if not, why.
     *
     * Read at render, so a picker can say so before anybody taps, rather than
     * after. See `machineChangeBlocker`.
     */
    changeBlocker: string | null;
    /**
     * Whether the failure in `error` is one only the system settings can undo.
     *
     * Android only, and always false on iOS, which has no permanently-denied
     * state: refuse the Bluetooth dialog twice on Android and it never appears
     * again, so asking again is not a remedy and should not be offered as one.
     */
    canOpenSettings: boolean;
    /** Send the user to the app's own page in the system settings. */
    openSettings: () => void;
    /**
     * Which machine the user says this is. The setting, not a reading.
     *
     * Narrowed here so a consumer does not have to. Nothing in the app reads
     * it yet: the settings row owns both halves of the setting and goes
     * through `useSetting` directly. It is the seam this file's own tests use
     * to see a correction land, and the one a brew screen would use.
     */
    machineModel: MachineModel;
};

/**
 * The link to the machine: lazy to connect, sticky while the app is in front.
 *
 * @param injected Tests pass a `Machine` over a fake transport.
 * @param options Tests pass a `wait` that does not, so the retrying is instant.
 */
export function useMachine(injected?: Machine, options: MachineOptions = {}): MachineLink {
    const machine = injected ?? sharedMachine();
    // A function, not a value: reaching for the shared store at render would
    // open it in every screen test that draws a machine without connecting.
    const store = () => options.settings ?? sharedSettings();
    const {machines, activeId: remembered} = useSavedMachines(options.settings);
    const [machineModelSetting] = useSetting("machineModel", options.settings);
    const [status, setStatus] = useState<LinkStatus>(
        // If already connected (e.g. the hook remounts with a live machine),
        // reflect that. Otherwise we genuinely do not know yet: no attempt has
        // been made in this app session.
        machine.isConnected() ? "connected" : "idle"
    );
    const [error, setError] = useState<string | null>(null);
    /**
     * Whether the failure on screen is one the user can only undo in Settings.
     *
     * Carried beside `error` rather than read out of its text, because the
     * message is copy and copy gets rewritten. It is the error's own flag that
     * decides, and only Android ever sets it: iOS has no permanently-denied
     * state to escape from.
     */
    const [canOpenSettings, setCanOpenSettings] = useState(false);

    // Bumped whenever the machine says something about itself, so a view
    // holding `machine.info` repaints. The info blob is mutated in place on the
    // shared machine, which React cannot see on its own.
    const [, setLinkVersion] = useState(0);

    useEffect(() => {
        // `onLink`, not `onFrame`: the case that matters most — the link
        // dropping — produces no frame at all, so a frame subscription leaves
        // the view saying "Connected" about a machine that has gone away.
        const offLink = machine.onLink(() => {
            setStatus(prev =>
                // A link event saying "connected" is always correct — take it.
                // A link event saying "not connected" means the state changed:
                // if we were connected, the link dropped → disconnected.
                // Any other previous state (idle, connecting, failed) should
                // not be overwritten here; connect()'s own path owns those.
                machine.isConnected() ? "connected"
                    : prev === "connected" ? "disconnected"
                        : prev
            );
            setLinkVersion((n) => n + 1);
        });
        const offPhase = machine.onPhase(() => setLinkVersion((n) => n + 1));
        return () => { offLink(); offPhase(); };
    }, [machine]);

    /** Run one link operation with the status and error bookkeeping around it. */
    async function linking<T>(operation: () => Promise<T>): Promise<T> {
        setStatus("connecting");
        setError(null);
        setCanOpenSettings(false);
        try {
            const result = await operation();
            setStatus("connected");
            return result;
        } catch (e) {
            setError((e as Error).message);
            setCanOpenSettings(
                e instanceof BluetoothPermissionError && e.canOpenSettings
            );
            setStatus(machine.isConnected() ? "connected" : "failed");
            throw e;
        }
    }

    async function connect(): Promise<void> {
        if (machine.isConnected()) {
            setStatus("connected");
            return;
        }
        await linking(() =>
            openLink(machine, settingsStore(store()), ensureBluetoothPermission, options));
    }

    async function choose(id: string): Promise<void> {
        await linking(() => chooseMachine(machine, store(), id, ensureBluetoothPermission, options));
    }

    async function add(id: string): Promise<void> {
        await linking(() => addMachine(machine, store(), id, ensureBluetoothPermission, options));
    }

    async function forgetMachine(id: string): Promise<boolean> {
        const settings = store();
        const active = settings.get("machineDeviceId");
        // Forgetting is a change of machine too: forgetting the machine in use
        // makes the next one active, and the next BREW would go there while
        // the first may still be pouring.
        const blocker = machineChangeBlocker(machine, active);
        if (blocker !== null) {
            setError(blocker);
            notify({tone: "error", message: blocker});
            return false;
        }
        try {
            if (id === active) {
                const actual = machine.slotIdentity;
                if (actual !== null) machine.assertCanForgetDevice(actual.deviceId);
            }
            machine.assertCanForgetDevice(id);
        } catch (failure) {
            if (!(failure instanceof SlotOperationError) && !(failure instanceof ControlOperationError)) throw failure;
            setError(failure.message);
            notify({tone: "error", message: failure.message});
            return false;
        }
        if (id === active) await machine.disconnect();
        if (chosenThisSession === id) chosenThisSession = "";
        forgetSavedMachine(settings, id);
        if (id === active) {
            setError(null);
            setCanOpenSettings(false);
            setStatus("idle");
        }
        return true;
    }

    async function keepMachineInUse(shown: string, linked: string): Promise<void> {
        await machine.disconnect();
        restoreMachineInUse(store(), shown, linked);
        setStatus("idle");
    }

    async function forget(): Promise<void> {
        const settings = store();
        const active = settings.get("machineDeviceId");
        if (active !== "") {
            await forgetMachine(active);
            return;
        }
        // Nothing saved: the old unpairing, which still drops any link and
        // any stray reading rather than leaving them to describe nothing.
        await machine.disconnect();
        forgetMachineReadings(settings);
        setError(null);
        setCanOpenSettings(false);
        setStatus("idle");
    }

    return {
        machine, slotPort: injected === undefined ? sharedPort : unavailableSlotPort,
        status, error: machine.controlBlocker?.message ?? error,
        remembered, connect, forget, forgetMachine, choose, add, machines,
        keepMachineInUse,
        changeBlocker: machineChangeBlocker(machine, remembered),
        canOpenSettings,
        /** Send the user to the app's own page in the system settings. */
        openSettings: () => { void Linking.openSettings(); },
        // `SettingValue` widens the stored union back to `string`, so this has
        // to be narrowed rather than asserted. Coerced rather than refused,
        // because there is a correct answer to fall back on.
        machineModel: asMachineModel(machineModelSetting)
    };
}

export default useMachine;
