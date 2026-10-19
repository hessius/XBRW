import type {Settings} from "@/library/Settings";

import {asMachineModel, modelFromSerial} from "./machineModel";
import {
    addSavedMachine,
    replaceSavedMachineId,
    resolveSavedMachines,
    serialiseSavedMachines,
    type SavedMachine
} from "./savedMachines";

/**
 * The saved-machine list as it lives in the settings store.
 *
 * The list rules are in `savedMachines.ts`; this file is only the bridge to
 * the store, and it exists so that every write goes through one rule: **the
 * four older keys describe the active machine, and the list describes the
 * rest.** `machineDeviceId`, `machineModel`, `machineModelString` and
 * `machineName` are read by importers, the editor, Easy Mode and the backup,
 * none of which needed to learn about a list to keep working.
 */
type Store = Pick<Settings, "get" | "set">;

/** The list as the app should see it, active machine laid over its entry. */
export function loadSavedMachines(settings: Store): SavedMachine[] {
    return resolveSavedMachines(settings.get("savedMachines"), {
        deviceId: settings.get("machineDeviceId"),
        model: asMachineModel(settings.get("machineModel")),
        modelString: settings.get("machineModelString"),
        name: settings.get("machineName")
    });
}

/**
 * Write the list, and push the active machine's model back to the key that owns it.
 *
 * The push is what makes editing the active machine's model in its detail
 * sheet behave exactly like the "Your xBloom" row always has: importers read
 * `machineModel`, and they must follow the machine the user is standing at.
 * Readings are not pushed. They are evidence, written only by a connect.
 */
export function saveSavedMachines(settings: Store, machines: readonly SavedMachine[]): void {
    settings.set("savedMachines", serialiseSavedMachines(machines));
    const activeId = settings.get("machineDeviceId");
    const active = machines.find((machine) => machine.id === activeId);
    if (active !== undefined && settings.get("machineModel") !== active.model) {
        settings.set("machineModel", active.model);
    }
}

/**
 * Make a saved machine the active one, carrying its model and readings with it.
 *
 * The list is saved first, from the overlaid view, so the machine being
 * switched away from keeps the model and readings it had while it was
 * active. Then the four keys take on the incoming machine's. This is the
 * model-switching rule in one place: a Work Original selected at work turns
 * every importer to the Original, and Home turns them back.
 *
 * An id the list does not name is not activated. Callers that have just found
 * a new machine use `rememberMachine`, which decides whether it is new.
 */
export function activateSavedMachine(settings: Store, id: string): boolean {
    const machines = loadSavedMachines(settings);
    const incoming = machines.find((machine) => machine.id === id);
    if (incoming === undefined) return false;
    settings.set("savedMachines", serialiseSavedMachines(machines));
    setActiveKeys(settings, incoming);
    return true;
}

/** The four keys, from one entry. Only after the list has been saved. */
function setActiveKeys(settings: Store, entry: SavedMachine): void {
    settings.set("machineDeviceId", entry.id);
    settings.set("machineModel", entry.model);
    settings.set("machineModelString", entry.modelString);
    settings.set("machineName", entry.advertisedName);
}

/**
 * Save a newly added machine at the end of the order and make it active.
 *
 * Separate from `rememberMachine` on purpose. Adding is the one path that
 * connects to a machine the list does not name while another is saved, and
 * `rememberMachine` would read that as the stale-id case and rename the
 * user's existing machine's identifier out from under it.
 */
export function addAndActivateMachine(settings: Store, entry: SavedMachine): void {
    const machines = addSavedMachine(loadSavedMachines(settings), entry);
    settings.set("savedMachines", serialiseSavedMachines(machines));
    activateSavedMachine(settings, entry.id);
}

/**
 * Remember a machine the link has just connected to.
 *
 * Three cases, and the middle one is why this is not simply "add":
 *
 * 1. Already saved. It becomes the active machine.
 * 2. The only saved machine came back under a new identifier, which is the
 *    stale-id fallback `attemptLink` has always had. Same machine, new id: it
 *    keeps its name and place. Only ever reached with one machine saved,
 *    because with two or more the link never connects to anything it did not
 *    pick from the list (see `openLink`).
 * 3. Anything else is a first pairing. It is added at the end of the order
 *    with the model the user has already chosen, so somebody pairing for the
 *    first time sees exactly what they saw before this list existed.
 */
export function rememberMachine(settings: Store, id: string): void {
    const previous = settings.get("machineDeviceId");
    let machines = loadSavedMachines(settings);
    if (machines.some((machine) => machine.id === id)) {
        activateSavedMachine(settings, id);
        return;
    }
    if (previous !== "" && machines.length === 1 && machines[0].id === previous) {
        machines = replaceSavedMachineId(machines, previous, id);
        settings.set("savedMachines", serialiseSavedMachines(machines));
        settings.set("machineDeviceId", id);
        return;
    }
    machines = addSavedMachine(machines, {
        id,
        label: "",
        model: asMachineModel(settings.get("machineModel")),
        modelString: "",
        advertisedName: "",
        serial: ""
    });
    settings.set("savedMachines", serialiseSavedMachines(machines));
    activateSavedMachine(settings, id);
}

/**
 * Keep the serial a machine reported against its saved entry, and set the
 * entry's model from it when the serial names one.
 *
 * The model follows the serial because the serial is the machine saying what
 * it is (`modelFromSerial`), and a hand-picked model that disagrees with it
 * would fetch every import for the wrong grind scale. It goes through
 * `saveSavedMachines`, so for the machine in use it lands in `machineModel`,
 * the key the importers read. A serial that names no model changes nothing.
 *
 * Written only when something differs, so the reconnect after every trip to
 * another app does not rewrite the list for nothing.
 */
export function recordSerial(settings: Store, id: string, serial: string): void {
    const trimmed = serial.trim();
    if (trimmed === "") return;
    const machines = loadSavedMachines(settings);
    const entry = machines.find((machine) => machine.id === id);
    if (entry === undefined) return;
    // Never re-pointed. A machine's serial does not change, so a different
    // one under this entry means the id now names a different machine (the
    // stale-id rescan takes whatever xBloom answers first). Keeping the
    // serial the entry already had is what lets the brew guard notice, and
    // the model is read from that kept serial, the entry's own machine.
    const kept = entry.serial !== "" ? entry.serial : trimmed;
    const model = modelFromSerial(kept) ?? entry.model;
    if (kept === entry.serial && model === entry.model) return;
    saveSavedMachines(settings, machines.map((machine) =>
        machine.id === id ? {...machine, serial: kept, model} : machine));
}

/**
 * Put the machine on screen back as the machine in use, after a brew refused
 * to follow the link somewhere else.
 *
 * The connect that landed elsewhere has already made that machine active
 * (with several saved), or renamed the only saved entry's id to it (the
 * stale-id rescan). Either way the screen would now name a machine the user
 * never chose. This undoes it, so the chip and the panel go on naming the
 * machine the user was looking at.
 */
export function restoreMachineInUse(settings: Store, shown: string, linked: string): void {
    const machines = loadSavedMachines(settings);
    if (machines.some((machine) => machine.id === shown)) {
        activateSavedMachine(settings, shown);
        return;
    }
    if (machines.some((machine) => machine.id === linked)) {
        settings.set("savedMachines", serialiseSavedMachines(replaceSavedMachineId(machines, linked, shown)));
        settings.set("machineDeviceId", shown);
    }
}

/**
 * Take a machine off the list.
 *
 * Forgetting the active machine hands the job to the new default, with its
 * model, rather than leaving the phone with no machine while others are
 * saved: an empty `machineDeviceId` takes BREW off every recipe in the
 * editor. Forgetting the last machine clears the keys the way unpairing
 * always has, readings included, so they cannot stand as evidence about
 * whatever is paired next.
 *
 * Returns the id that is now active, or "" for none.
 */
export function forgetSavedMachine(settings: Store, id: string): string {
    const machines = loadSavedMachines(settings).filter((machine) => machine.id !== id);
    const activeId = settings.get("machineDeviceId");
    settings.set("savedMachines", serialiseSavedMachines(machines));
    if (activeId !== id) return activeId;
    if (machines.length === 0) {
        settings.set("machineDeviceId", "");
        settings.set("machineModelString", "");
        settings.set("machineName", "");
        return "";
    }
    // Not `activateSavedMachine`: that reads the list through the overlay,
    // and the overlay would put the machine just removed straight back,
    // because the keys still name it.
    setActiveKeys(settings, machines[0]);
    return machines[0].id;
}
