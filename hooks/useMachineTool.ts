import {useState} from "react";
import {useMachineToolSupport} from "@/hooks/useMachineToolSupport";
import type MachineControls from "@/library/machine/MachineControls";
import {
    validateGrindRequest, validatePourRequest,
    type ControlIdentity, type ControlSnapshot, type GrindRequest, type PourRequest, type ToolId
} from "@/library/machine/controlModel";

/** Draft lifetime is the identity/tool-keyed route, never the shared owner. */
export function useMachineTool(identity: ControlIdentity, tool: ToolId, controls: MachineControls, snapshot: ControlSnapshot) {
    const support = useMachineToolSupport(controls, identity, tool);
    const [grindDraft, setGrind] = useState<GrindRequest | null>(null);
    const [pourDraft, setPour] = useState<PourRequest | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const bound = support.bound;
    const owns = snapshot.identity?.deviceId === identity.deviceId
        && snapshot.identity.serial === identity.serial && snapshot.tool === tool;
    const phase = owns ? snapshot.phase : "closed";
    const grind = grindDraft ?? (bound ? snapshot.grindRequest : null);
    const pour = pourDraft ?? (bound ? snapshot.pourRequest : null);
    const unavailable = support.unavailable ?? (!bound ? phase === "closed"
        ? "Open the tool before choosing a request." : "Reconcile the exact named machine before continuing." : null);

    async function perform(action: () => Promise<void>): Promise<void> {
        setError(null);
        setBusy(true);
        try {
            await action();
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : "The machine control failed.");
        }
        setBusy(false);
    }

    function requireBound(): void {
        if (!controls.describeTool(identity, tool).bound) {
            throw new Error("This tool no longer owns the exact named machine. No command was sent.");
        }
    }

    function chooseProposal(): void {
        void perform(async () => {
            const current = controls.describeTool(identity, tool);
            if (current.unavailable !== null || !current.bound) {
                throw new Error(current.unavailable ?? "The tool is not ready.");
            }
            if (tool === "grind" && current.grind) {
                const request = {grindSize: current.grind.grindSize.min, rpm: current.grind.rpm.min};
                validateGrindRequest(request, current.grind);
                setGrind(request);
            } else if (tool === "pour" && current.pour) {
                const policy = current.pour;
                const common = {
                    temperatureC: policy.temperatureC.min,
                    flowMlPerSecond: policy.flowMlPerSecond.min,
                    pattern: policy.patterns[0]
                };
                const request: PourRequest = policy.modes[0] === "target"
                    ? {...common, mode: "target", volumeMl: policy.volumeMl?.min ?? NaN}
                    : {...common, mode: "continuous"};
                validatePourRequest(request, policy);
                setPour(request);
            }
        });
    }

    function changeMode(mode: PourRequest["mode"]): void {
        void perform(async () => {
            requireBound();
            const request = pourDraft ?? controls.getSnapshot().pourRequest;
            const policy = controls.describeTool(identity, tool).pour;
            if (!request || !policy) throw new Error("Choose a pour request first.");
            const next: PourRequest = mode === "target"
                ? {...request, mode, volumeMl: request.mode === "target"
                    ? request.volumeMl : policy.volumeMl?.min ?? NaN}
                : {temperatureC: request.temperatureC, flowMlPerSecond: request.flowMlPerSecond,
                    pattern: request.pattern, mode};
            validatePourRequest(next, policy);
            setPour(next);
        });
    }

    function start(): void {
        void perform(async () => {
            requireBound();
            if (tool === "grind") {
                const request = grindDraft ?? controls.getSnapshot().grindRequest;
                if (!request) throw new Error("Choose a grind request first.");
                await controls.startGrind(request);
            } else if (tool === "pour") {
                const request = pourDraft ?? controls.getSnapshot().pourRequest;
                if (!request) throw new Error("Choose a pour request first.");
                await controls.startPour(request);
            }
        });
    }

    function open(): void {
        void perform(async () => {
            const current = controls.describeTool(identity, tool);
            if (current.unavailable) throw new Error(current.unavailable);
            await controls.open(identity, tool);
        });
    }

    function recover(): void {
        void perform(async () => {
            if (!controls.describeTool(identity, tool).recoverable) {
                throw new Error("Reconciliation requires this exact connected machine and tool.");
            }
            await controls.recover();
        });
    }

    return {
        support, owns, phase, bound, unavailable, error, busy, grind, pour,
        setGrind, setPour, chooseProposal, changeMode, start, open, recover,
        reconnect: () => { void perform(() => controls.reconnectTool(identity, tool)); },
        stop: () => { void perform(async () => { requireBound(); await controls.stop(); }); },
        tare: () => { void perform(async () => { requireBound(); await controls.tare(); }); }
    };
}
