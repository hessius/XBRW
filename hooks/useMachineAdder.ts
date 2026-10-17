import {useState} from "react";

import {addMachine, findUnsavedMachines, sharedMachine} from "@/hooks/useMachine";
import {sharedSettings} from "@/hooks/useSetting";
import type {FoundMachine} from "@/library/machine/Transport";
import type {Settings} from "@/library/Settings";

export type MachineAdder = {
    open: boolean;
    /** Open the sheet and look for machines that are not saved. */
    start: () => void;
    close: () => void;
    looking: boolean;
    /** The unsaved machines heard, nearest-sounding first. Null until a look ends. */
    found: FoundMachine[] | null;
    /** The id being connected to, while it is. */
    adding: string | null;
    error: string | null;
    pick: (id: string) => void;
};

/**
 * Adding a machine: look, let the user pick, then connect and save.
 *
 * A hook the settings screen holds rather than state inside the sheet, so the
 * scan starts from the tap that asked for it rather than from an effect, and
 * so the screen can hide itself from a screen reader while the sheet is up.
 *
 * Never picks for the user. With one unsaved machine in range the list has
 * one row, and that row still has to be tapped: in a cafe the one machine
 * that answered may well not be the one in front of you.
 *
 * @param onAdded Told the new machine's id, so its sheet can open for a name.
 */
export function useMachineAdder(onAdded: (id: string) => void, settings?: Settings): MachineAdder {
    const [open, setOpen] = useState(false);
    const [looking, setLooking] = useState(false);
    const [found, setFound] = useState<FoundMachine[] | null>(null);
    const [adding, setAdding] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    function look(): void {
        setLooking(true);
        setError(null);
        findUnsavedMachines(sharedMachine(), settings ?? sharedSettings()).then(
            (heard) => {
                setFound(heard);
                setLooking(false);
            },
            (failure: unknown) => {
                setFound([]);
                setError(failure instanceof Error ? failure.message : String(failure));
                setLooking(false);
            }
        );
    }

    function start(): void {
        setOpen(true);
        setFound(null);
        setAdding(null);
        look();
    }

    function pick(id: string): void {
        if (adding !== null) return;
        setAdding(id);
        setError(null);
        addMachine(sharedMachine(), settings ?? sharedSettings(), id).then(
            () => {
                setAdding(null);
                setOpen(false);
                onAdded(id);
            },
            (failure: unknown) => {
                setAdding(null);
                setError(failure instanceof Error ? failure.message : String(failure));
            }
        );
    }

    return {
        open,
        start,
        close: () => { if (adding === null) setOpen(false); },
        looking, found, adding, error, pick
    };
}

export default useMachineAdder;
