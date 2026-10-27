import {useEffect, useState} from "react";

import {useMachine} from "@/hooks/useMachine";
import {useSetting} from "@/hooks/useSetting";
import type Machine from "@/library/machine/Machine";
import {isActiveBrewPhase, type BrewPhase} from "@/library/machine/Machine";
import {
    BluetoothPermissionError,
    BrewOwnershipError,
    BrewUploadError,
    ControlOperationError,
    type BrewRefusal,
    isBrewRefusal,
    RadioUnavailableError,
    SlotOperationError,
    WrongMachineError
} from "@/library/machine/errors";
import {machineLabel, type SavedMachine} from "@/library/machine/savedMachines";
import {notify} from "@/components/XbrwToast";
import type {BypassTempEncoding} from "@/library/machine/protocol";
import type Recipe from "@/library/Recipe";

/**
 * The pre-flight refusals a second attempt can actually clear.
 *
 * A low tank, a busy machine and a recipe the card format will not carry give
 * the same answer however often they are asked, and asking again only beeps.
 * These two are the link not being what it looked like, which is the one thing
 * a fresh link does fix.
 */
const RELINK_BLOCKS: ReadonlySet<string> = new Set(["notConnected", "noVitals"]);

export type Brewer = {
    phase: BrewPhase;
    error: string | null;
    /** The link itself, for a recorder that needs the raw notification stream. */
    machine: Machine;
    /** Retry re-arms ownership; a refusal retires only the app's unsent attempt. */
    brew: (recipe: Recipe, onPreflightRetry?: () => void,
           onRefusal?: (error: BrewRefusal) => void) => Promise<void>;
    /**
     * Commit a recipe that was uploaded but held back, because the user has
     * auto-start off. Only meaningful in the `readyToStart` phase.
     */
    startBrew: () => Promise<void>;
    /** Native write failures still resolve with `error`; notify the request owner too. */
    pauseBrew: (onFailure?: () => void) => Promise<void>;
    resumeBrew: () => Promise<void>;
    cancelBrew: () => Promise<void>;
    /**
     * Whether offering a switch to PRO mode would be a reasonable thing to do.
     * Only true after a send went nowhere on a machine that says it is in EASY,
     * and only once — the app never changes a machine's mode without asking.
     */
    canOfferProMode: () => boolean;
    switchToProAndRetry: (recipe: Recipe,
                          onRefusal?: (error: BrewRefusal) => void) => Promise<void>;
};

/**
 * One brew, as React state.
 *
 * The phase lives on the `Machine`, not here: the link outlives the route, and
 * a copy in component state would go stale the moment the user navigated away
 * and back. This subscribes rather than owns.
 */
export function useBrew(injected?: Machine): Brewer {
    const {machine, connect, remembered, machines, keepMachineInUse} = useMachine(injected);
    const [bypassTempEncoding] = useSetting("bypassTempEncoding");
    const [autoStart] = useSetting("machineAutoStart");
    const [phase, setPhase] = useState<BrewPhase>(machine.phase);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => machine.onPhase(setPhase), [machine]);
    useEffect(() => {
        // `useSetting` widens the stored union to `string`, so it is narrowed
        // back to the encoding the machine expects on the way in.
        try {
            machine.setBypassTempEncoding(bypassTempEncoding as BypassTempEncoding);
            machine.setAutoStart(autoStart);
        } catch (error) {
            if (!(error instanceof SlotOperationError) && !(error instanceof ControlOperationError)) throw error;
            notify({tone: "error", message: error.message});
        }
    }, [machine, bypassTempEncoding, autoStart]);

    /**
     * @param shown The machine in use when BREW was pressed: the one the
     *   editor's chip and the home panel name. Captured once per press, so a
     *   relink cannot move it.
     * @param saved The saved machines at that moment, for names.
     */
    async function checkMachine(shown: string, saved: SavedMachine[]): Promise<void> {
        // The hard guarantee. With several machines saved, the connect picks
        // by scan, and when the machine on screen is out of range it can land
        // on another. Nothing has been sent yet, and nothing is: the recipe
        // goes only to the machine the user was looking at, and the machine on
        // screen is put back as the machine in use, so the chip goes on naming
        // it rather than the one that happened to answer.
        const linked = machine.linkedDeviceId;
        if (saved.length >= 2 && shown !== "" && linked !== null && linked !== shown) {
            const name = (id: string) => {
                const index = saved.findIndex((entry) => entry.id === id);
                return index < 0 ? "another machine" : machineLabel(saved[index], index);
            };
            machine.note(`brew refused — connected to ${linked}, but the screen named ${shown}`);
            await keepMachineInUse(shown, linked);
            throw new WrongMachineError(
                `Found ${name(linked)}, not ${name(shown)}, so nothing was sent. `
                + `Check ${name(shown)} is on and nearby, or pick ${name(linked)}, then press BREW again.`
            );
        }
        // With one machine saved the id is not a reliable check: the stale-id
        // rescan brings the machine back under a new id, but it takes whatever
        // xBloom answers first, which in a cafe is somebody else's. The serial
        // is the check there, once both sides of it are known.
        const known = saved.length === 1 ? saved[0].serial.trim() : "";
        const heard = machine.info?.serial.trim() ?? "";
        if (known !== "" && heard !== "" && heard !== known && linked !== null) {
            machine.note(`brew refused — serial ${heard} is not the saved machine's ${known}`);
            await keepMachineInUse(shown, linked);
            throw new WrongMachineError(
                `This xBloom is not your saved machine (serial ending ${known.slice(-4)}), `
                + `so nothing was sent. Check yours is on and nearby, then press BREW again.`
            );
        }
    }

    async function attempt(recipe: Recipe, shown: string, saved: SavedMachine[]): Promise<void> {
        // Lazy connect: this is the first moment the user has actually
        // reached for the machine, and it is the beep they are expecting.
        if (!machine.isConnected()) await connect();
        await checkMachine(shown, saved);
        // A refused ambient update is applied only on an explicit new brew.
        machine.setBypassTempEncoding(bypassTempEncoding as BypassTempEncoding);
        machine.setAutoStart(autoStart);
        await machine.brew(recipe, () => checkMachine(shown, saved));
    }

    /**
     * Whether dropping the link and trying once more could plausibly help.
     *
     * #199: "at brew time, it often takes a few tries to connect and brew,
     * even when the machine is awake and already connected". Nobody has a
     * reliable repro, but every report shares a shape -- the second or third
     * press works, with nothing changed in between. A link iOS still believes
     * in but the machine has let go of looks exactly like that, and the user's
     * own retry is only doing what this does.
     *
     * Deliberately narrow. Anything the machine actually refused is left
     * alone, because its answer will not change, and a brew that got as far as
     * being sent is never retried: that would be a second dose.
     */
    function worthRelinking(e: unknown): boolean {
        // A radio that is off is a fact about the phone, and a permission the
        // user declined is a fact about their answer. Neither changes on a
        // second attempt, and `openLink` deliberately keeps the permission
        // check outside its own retrying so nobody is asked twice.
        if (e instanceof RadioUnavailableError) return false;
        // Ownership and target refusals cannot be repaired by taking a new link.
        if (isBrewRefusal(e)) return false;
        if (e instanceof BrewUploadError) return false;
        if (e instanceof BrewOwnershipError) return false;
        if (e instanceof BluetoothPermissionError) return false;
        const phase = machine.phase;
        // Every other failed phase is left alone, including `rejected`. The
        // transport writes without response, so a write that threw does not
        // prove the frame missed the machine -- the recipe may have landed and
        // be grinding -- and a resend there is a second dose. Only the two
        // pre-flight blocks above are known to have sent nothing at all.
        if (phase.name === "failed") {
            return phase.reason === "blocked" && RELINK_BLOCKS.has(phase.block ?? "");
        }
        // Nothing was refused and nothing failed, so the attempt died before
        // the machine was reached at all: the connect threw. That is the link.
        return !isActiveBrewPhase(phase);
    }

    async function brew(recipe: Recipe, onPreflightRetry?: () => void,
                        onRefusal?: (error: BrewRefusal) => void): Promise<void> {
        setError(null);
        // What the screen named when BREW was pressed. See `attempt`.
        const shown = remembered;
        const saved = machines;
        try {
            await attempt(recipe, shown, saved);
            return;
        } catch (e) {
            if (!worthRelinking(e)) {
                setError((e as Error).message);
                if (isBrewRefusal(e)) onRefusal?.(e);
                return;
            }
        }
        try {
            // A fresh link, not the same one asked twice. `connect` is a
            // no-op while the transport still believes it is up, which is the
            // state this exists to escape.
            await machine.disconnect();
            onPreflightRetry?.();
            await attempt(recipe, shown, saved);
        } catch (e) {
            setError((e as Error).message);
            if (isBrewRefusal(e)) onRefusal?.(e);
        }
    }

    /** Commit a recipe that was uploaded and held back. See `machineAutoStart`. */
    async function startBrew(): Promise<void> {
        setError(null);
        try {
            await machine.startBrew();
        } catch (e) {
            setError((e as Error).message);
        }
    }

    async function pauseBrew(onFailure?: () => void): Promise<void> {
        setError(null);
        try {
            await machine.pauseBrew();
        } catch (e) {
            setError((e as Error).message);
            onFailure?.();
        }
    }

    async function resumeBrew(): Promise<void> {
        setError(null);
        try {
            await machine.resumeBrew();
        } catch (e) {
            setError((e as Error).message);
        }
    }

    async function cancelBrew(): Promise<void> {
        try {
            await machine.cancelBrew();
        } catch (e) {
            setError((e as Error).message);
        }
    }

    // Read through to the machine rather than cached: `canOfferProMode` turns on
    // the moment the acknowledgement timer fires, which arrives as a phase change
    // that has already re-rendered this hook's consumers.
    function canOfferProMode(): boolean {
        return machine.canOfferProMode();
    }

    async function switchToProAndRetry(recipe: Recipe,
                                      onRefusal?: (error: BrewRefusal) => void): Promise<void> {
        setError(null);
        // The same rule as BREW: the retry goes to the machine on screen, or
        // nowhere. It sends a recipe, so it gets the same check.
        const shown = remembered;
        const saved = machines;
        try {
            machine.setBypassTempEncoding(bypassTempEncoding as BypassTempEncoding);
            machine.setAutoStart(autoStart);
            await machine.switchToProAndRetry(recipe, () => checkMachine(shown, saved));
        } catch (e) {
            setError((e as Error).message);
            if (isBrewRefusal(e)) onRefusal?.(e);
        }
    }

    return {phase, error, machine, brew, startBrew, pauseBrew, resumeBrew, cancelBrew,
            canOfferProMode, switchToProAndRetry};
}

export default useBrew;
