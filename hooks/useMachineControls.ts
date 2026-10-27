import {useSyncExternalStore} from "react";
import {sharedMachineControls} from "@/hooks/useMachine";
import type MachineControls from "@/library/machine/MachineControls";

/** Route subscriptions do not own the controller or its lease. */
export function useMachineControls(injected?: MachineControls) {
    const controls = injected ?? sharedMachineControls();
    const snapshot = useSyncExternalStore(controls.subscribe, controls.getSnapshot, controls.getSnapshot);
    return {controls, snapshot};
}
