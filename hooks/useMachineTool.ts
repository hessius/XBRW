import {useEffect, useRef, useState} from "react";
import {useMachineToolSupport} from "@/hooks/useMachineToolSupport";
import type MachineControls from "@/library/machine/MachineControls";
import {
    validateGrindRequest, validatePourRequest,
    type ControlIdentity, type ControlSnapshot, type GrindPolicy, type GrindRequest, type Pattern, type PourPolicy, type PourRequest, type ToolId
} from "@/library/machine/controlModel";

function seedGrindRequest(policy: GrindPolicy | null, dialSize: number | null): GrindRequest | null {
    if (!policy) return null;
    if (dialSize !== null) {
        try {
            const candidate = {grindSize: dialSize, rpm: policy.rpm.min};
            validateGrindRequest(candidate, policy);
            return candidate;
        } catch { /* Fall back to policy min when reported dial is outside policy. */ }
    }
    try {
        const fallback = {grindSize: policy.grindSize.min, rpm: policy.rpm.min};
        validateGrindRequest(fallback, policy);
        return fallback;
    } catch {
        return null;
    }
}

function seedPourRequest(policy: PourPolicy | null): PourRequest | null {
    if (!policy) return null;
    try {
        const common = {
            temperatureC: policy.temperatureC.min,
            flowMlPerSecond: policy.flowMlPerSecond.min,
            pattern: policy.patterns[0]
        };
        const request: PourRequest = policy.modes[0] === "target"
            ? {...common, mode: "target", volumeMl: policy.volumeMl?.min ?? NaN}
            : {...common, mode: "continuous"};
        validatePourRequest(request, policy);
        return request;
    } catch {
        return null;
    }
}

/** Draft lifetime is the identity/tool-keyed route, never the shared owner. */
export function useMachineTool(identity: ControlIdentity, tool: ToolId, controls: MachineControls, snapshot: ControlSnapshot) {
    const support = useMachineToolSupport(controls, identity, tool);
    const [grindDraft, setGrind] = useState<GrindRequest | null>(null);
    const [pourDraft, setPour] = useState<PourRequest | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [liveTempError, setLiveTempError] = useState<string | null>(null);
    const [livePatternError, setLivePatternError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const liveTempEpoch = useRef(0);
    const livePatternEpoch = useRef(0);
    const autoOpenedFor = useRef<string | null>(null);
    const mounted = useRef(true);
    const mountAbort = useRef<AbortController | null>(null);
    useEffect(() => {
        mounted.current = true;
        mountAbort.current = new AbortController();
        const tempEpoch = liveTempEpoch;
        const patternEpoch = livePatternEpoch;
        const abortController = mountAbort.current;
        return () => {
            mounted.current = false;
            abortController.abort();
            tempEpoch.current++;
            patternEpoch.current++;
        };
    }, []);
    const bound = support.bound;
    const owns = snapshot.identity?.deviceId === identity.deviceId
        && snapshot.identity.serial === identity.serial && snapshot.tool === tool;
    const phase = owns ? snapshot.phase : "closed";
    const dialSize = bound && tool === "grind" ? controls.dialGrindSizeFor(identity) : null;
    const seededGrind = bound && tool === "grind" ? seedGrindRequest(support.grind, dialSize) : null;
    const seededPour = bound && tool === "pour" ? seedPourRequest(support.pour) : null;
    const grind = grindDraft ?? (bound ? snapshot.grindRequest ?? seededGrind : null);
    const pour = pourDraft ?? (bound ? snapshot.pourRequest ?? seededPour : null);
    const unavailable = support.unavailable ?? (!bound
        ? phase === "closed"
            ? (error !== null && !busy ? "Tool could not be opened." : "Opening tool…")
            : "Reconcile the exact named machine before continuing."
        : null);

    async function perform(action: () => Promise<void>): Promise<void> {
        setError(null);
        setBusy(true);
        try {
            await action();
        } catch (cause) {
            if (mounted.current) {
                setError(cause instanceof Error ? cause.message : "The machine control failed.");
            }
        }
        if (mounted.current) setBusy(false);
    }

    function open(): void {
        liveTempEpoch.current++;
        livePatternEpoch.current++;
        setLiveTempError(null);
        setLivePatternError(null);
        void perform(async () => {
            const current = controls.describeTool(identity, tool);
            if (current.unavailable) throw new Error(current.unavailable);
            await controls.open(identity, tool, mountAbort.current?.signal);
        });
    }

    useEffect(() => {
        const routeKey = `${identity.deviceId}\0${identity.serial ?? ""}\0${tool}`;
        if (autoOpenedFor.current === routeKey) return;
        if (phase !== "closed" || owns || support.unavailable !== null) return;
        autoOpenedFor.current = routeKey;
        const target = {deviceId: identity.deviceId, serial: identity.serial};
        const signal = mountAbort.current?.signal;
        void (async () => {
            try {
                const current = controls.describeTool(target, tool);
                if (current.unavailable) throw new Error(current.unavailable);
                await controls.open(target, tool, signal);
            } catch (cause) {
                if (mounted.current && !signal?.aborted) {
                    setError(cause instanceof Error ? cause.message : "The machine control failed.");
                }
            }
        })();
    }, [controls, identity.deviceId, identity.serial, owns, phase, support.unavailable, tool]);

    function requireBound(): void {
        if (!controls.describeTool(identity, tool).bound) {
            throw new Error("This tool no longer owns the exact named machine. No command was sent.");
        }
    }

    function changeMode(mode: PourRequest["mode"]): void {
        void perform(async () => {
            requireBound();
            const request = pourDraft ?? controls.getSnapshot().pourRequest ?? seededPour;
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
        liveTempEpoch.current++;
        livePatternEpoch.current++;
        setLiveTempError(null);
        setLivePatternError(null);
        void perform(async () => {
            requireBound();
            if (tool === "grind") {
                const request = grindDraft ?? controls.getSnapshot().grindRequest ?? seededGrind;
                if (!request) throw new Error("Choose a grind request first.");
                await controls.startGrind(request);
            } else if (tool === "pour") {
                const request = pourDraft ?? controls.getSnapshot().pourRequest ?? seededPour;
                if (!request) throw new Error("Choose a pour request first.");
                await controls.startPour(request);
            }
        });
    }

    function recover(): void {
        void perform(async () => {
            if (!controls.describeTool(identity, tool).recoverable) {
                throw new Error("Reconciliation requires this exact connected machine and tool.");
            }
            await controls.recover();
            if (mounted.current && controls.getSnapshot().phase === "closed"
                && controls.describeTool(identity, tool).unavailable === null) {
                await controls.open(identity, tool, mountAbort.current?.signal);
            }
        });
    }

    function setLiveTemperature(celsius: number): void {
        const epoch = ++liveTempEpoch.current;
        setLiveTempError(null);
        void controls.setTemperature(celsius).catch((cause) => {
            if (liveTempEpoch.current === epoch) {
                setLiveTempError(cause instanceof Error ? cause.message : "Failed to update temperature.");
            }
        });
    }

    function setLivePattern(pattern: Pattern): void {
        const epoch = ++livePatternEpoch.current;
        setLivePatternError(null);
        void controls.setPattern(pattern).catch((cause) => {
            if (livePatternEpoch.current === epoch) {
                setLivePatternError(cause instanceof Error ? cause.message : "Failed to update pattern.");
            }
        });
    }

    return {
        support, owns, phase, bound, unavailable, error, liveTempError, livePatternError, busy, grind, pour,
        setGrind, setPour, changeMode, start, open, recover,
        setLiveTemperature, setLivePattern,
        reconnect: () => { void perform(() => controls.reconnectTool(identity, tool)); },
        stop: () => { void perform(async () => { requireBound(); await controls.stop(); }); },
        tare: () => { void perform(async () => { requireBound(); await controls.tare(); }); }
    };
}
