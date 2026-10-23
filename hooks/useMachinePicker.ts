import {useEffect, useState} from "react";

import {MODEL_NAMES, type MachineSurveyState} from "@/components/MachinePickerSheet";
import {notify} from "@/components/XbrwToast";
import {
    chooseMachine,
    latestSurvey,
    machineChangeBlocker,
    sharedMachine,
    surveyMachines
} from "@/hooks/useMachine";
import {useSavedMachines} from "@/hooks/useSavedMachines";
import {sharedSettings} from "@/hooks/useSetting";
import type {MachineColour} from "@/constants/colors";
import {useAppearance} from "@/hooks/useAppearance";
import {machineColourOf, machineLabel, type SavedMachine} from "@/library/machine/savedMachines";
import type Machine from "@/library/machine/Machine";
import type {Settings} from "@/library/Settings";

/** How old a survey may be and still be shown while a fresh one runs. */
const SURVEY_SHOWN_MS = 60_000;

export type MachinePicker = {
    /** Two or more machines saved. Below that there is nothing to pick. */
    available: boolean;
    /** What the active machine is called, for the chip and the panel row. */
    label: string;
    /** The active machine's model as it is said on screen, or "" with none. */
    model: string;
    /** Display colour, already resolved for chrome. Uses the green identity with none. */
    colour: MachineColour;
    open: boolean;
    setOpen: (open: boolean) => void;
    /** Open the sheet and look around. */
    show: () => void;
    rescan: () => void;
    machines: SavedMachine[];
    activeId: string;
    connected: boolean;
    survey: MachineSurveyState;
    blocker: string | null;
    choose: (id: string) => void;
};

/**
 * The machine picker's state, shared by the editor's chip and the home
 * screen's machine panel so that both open the same sheet the same way.
 *
 * Reaches for the shared machine only when the sheet is opened or a machine is
 * picked: drawing a recipe must not build the Bluetooth manager, for the
 * reason `startMachineLink` gives.
 *
 * Opening looks around: a short scan (`SURVEY_SECONDS`) to mark which saved
 * machines are nearby right now. Not while a brew owns the link, because the
 * rows are locked then anyway and a scan alongside a live brew is radio
 * traffic nobody asked for. A survey from the last minute is shown while the
 * new one runs, so the sheet does not open empty.
 */
export function useMachinePicker(settings?: Settings): MachinePicker {
    const appearance = useAppearance();
    const {machines, activeId} = useSavedMachines(settings);
    const [open, setOpen] = useState(false);
    const [pickerMachine, setPickerMachine] = useState<Machine | null>(null);
    const [connected, setConnected] = useState(false);
    const [blocker, setBlocker] = useState<string | null>(null);
    const [survey, setSurvey] = useState<MachineSurveyState>(
        {heard: null, looking: false, error: null}
    );
    const activeIndex = machines.findIndex((machine) => machine.id === activeId);

    useEffect(() => {
        if (!open || pickerMachine === null) return;
        const update = () => {
            setConnected(pickerMachine.isConnected());
            setBlocker(machineChangeBlocker(pickerMachine, activeId));
        };
        const offLink = pickerMachine.onLink(update);
        const offPhase = pickerMachine.onPhase(update);
        return () => { offLink(); offPhase(); };
    }, [open, pickerMachine, activeId]);

    function look(): void {
        const machine = sharedMachine();
        const reason = machineChangeBlocker(machine, activeId);
        if (reason !== null) {
            setBlocker(reason);
            return;
        }
        setSurvey((previous) => ({...previous, looking: true, error: null}));
        surveyMachines(machine).then(
            (found) => setSurvey({heard: found.map((entry) => entry.id), looking: false, error: null}),
            (error: unknown) => setSurvey((previous) => ({
                ...previous,
                looking: false,
                error: error instanceof Error ? error.message : String(error)
            }))
        );
    }

    function show(): void {
        const machine = sharedMachine();
        setPickerMachine(machine);
        const reason = machineChangeBlocker(machine, activeId);
        const recent = latestSurvey();
        setConnected(machine.isConnected());
        setBlocker(reason);
        setSurvey({
            heard: recent !== null && Date.now() - recent.at < SURVEY_SHOWN_MS
                ? recent.heard.map((entry) => entry.id)
                : null,
            looking: false,
            error: null
        });
        setOpen(true);
        if (reason === null) look();
    }

    function choose(id: string): void {
        const index = machines.findIndex((machine) => machine.id === id);
        const name = index < 0 ? "the machine" : machineLabel(machines[index], index);
        // Said at once, because the sheet has closed and a connect can take
        // several seconds: without it the tap looks like it did nothing.
        notify({tone: "info", message: `Connecting to ${name}…`});
        chooseMachine(sharedMachine(), settings ?? sharedSettings(), id).then(
            () => notify({tone: "success", message: `Connected to ${name}`}),
            (error: unknown) => notify({
                tone: "error",
                message: `${error instanceof Error ? error.message : String(error)} `
                    + "Open the machine list to rescan, or pick another machine."
            })
        );
    }

    return {
        available: machines.length >= 2,
        label: activeIndex < 0 ? "" : machineLabel(machines[activeIndex], activeIndex),
        model: activeIndex < 0 ? "" : MODEL_NAMES[machines[activeIndex].model],
        colour: appearance.machineColour(machineColourOf(activeIndex < 0 ? {} : machines[activeIndex])),
        open, setOpen, show,
        rescan: () => { if (blocker === null) look(); },
        machines, activeId, connected, survey, blocker, choose
    };
}

export default useMachinePicker;
