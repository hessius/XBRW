import {useSyncExternalStore} from "react";
import type MachineControls from "@/library/machine/MachineControls";
import type {ControlIdentity, ToolId} from "@/library/machine/controlModel";

export function useMachineToolSupport(controls: MachineControls, identity: ControlIdentity, tool: ToolId) {
    const {deviceId, serial} = identity;
    return useSyncExternalStore(
        controls.subscribeToolSupport,
        () => controls.describeTool({deviceId, serial}, tool),
        () => controls.describeTool({deviceId, serial}, tool)
    );
}
