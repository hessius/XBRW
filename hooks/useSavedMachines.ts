import {sharedSettings, useSetting} from "@/hooks/useSetting";
import {asMachineModel, type MachineModel} from "@/library/machine/machineModel";
import {
    makeDefaultMachine,
    moveSavedMachine,
    resolveSavedMachines,
    updateSavedMachine,
    type SavedMachine
} from "@/library/machine/savedMachines";
import {loadSavedMachines, saveSavedMachines} from "@/library/machine/savedMachineSettings";
import type {Settings} from "@/library/Settings";

export type SavedMachineList = {
    /** In the order the link tries them in, highest first. */
    machines: SavedMachine[];
    /** The active machine's id, or "" when none is saved. */
    activeId: string;
    rename: (id: string, label: string) => void;
    setModel: (id: string, model: MachineModel) => void;
    /** Mark a machine with one of `machineColours`, by index. */
    setColour: (id: string, colour: number) => void;
    makeDefault: (id: string) => void;
    move: (id: string, by: -1 | 1) => void;
};

/**
 * The saved machines, as state, with the edits that do not touch the radio.
 *
 * Subscribes to all five keys the list is made from, because the active
 * machine's model and readings live in the older keys and a correction
 * landing on `machineModel` must repaint a row that shows it.
 *
 * Choosing, adding and forgetting are not here. They move or drop the link,
 * so they live with the link, in `useMachine`.
 */
export function useSavedMachines(settings?: Settings): SavedMachineList {
    const [raw] = useSetting("savedMachines", settings);
    const [deviceId] = useSetting("machineDeviceId", settings);
    const [model] = useSetting("machineModel", settings);
    const [modelString] = useSetting("machineModelString", settings);
    const [name] = useSetting("machineName", settings);
    const machines = resolveSavedMachines(raw, {
        deviceId, model: asMachineModel(model), modelString, name
    });

    // Each edit re-reads the store rather than closing over `machines`, so two
    // edits in one tick cannot each write a list missing the other's change.
    // The shared store is reached for here rather than at render, so a
    // screen that only draws the list never opens it.
    function edit(change: (current: SavedMachine[]) => SavedMachine[]): void {
        const store = settings ?? sharedSettings();
        saveSavedMachines(store, change(loadSavedMachines(store)));
    }

    return {
        machines,
        activeId: deviceId,
        rename: (id, label) => edit((current) => updateSavedMachine(current, id, {label})),
        setModel: (id, next) => edit((current) => updateSavedMachine(current, id, {model: next})),
        setColour: (id, colour) => edit((current) => updateSavedMachine(current, id, {colour})),
        makeDefault: (id) => edit((current) => makeDefaultMachine(current, id)),
        move: (id, by) => edit((current) => moveSavedMachine(current, id, by))
    };
}

export default useSavedMachines;
