import {useEffect, useRef, useState, useSyncExternalStore} from "react";
import {useMachineToolSupport} from "@/hooks/useMachineToolSupport";
import type MachineControls from "@/library/machine/MachineControls";
import {draftStoreFor} from "@/library/machine/controlDrafts";
import {
    validateGrindRequest, validatePourRequest,
    type ControlIdentity, type ControlPhase, type ControlSnapshot, type GrindPolicy, type GrindRequest,
    type Pattern, type PourPolicy, type PourRequest, type ToolId
} from "@/library/machine/controlModel";

const EMPTY_SAMPLES: readonly number[] = Object.freeze([]);

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

type KeyedError = {key: string; message: string};

export function useMachineTool(identity: ControlIdentity, tool: ToolId, controls: MachineControls, snapshot: ControlSnapshot) {
    const support = useMachineToolSupport(controls, identity, tool);
    const store = draftStoreFor(controls);
    const draftState = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
    const routeKey = `${identity.deviceId}\0${identity.serial ?? ""}\0${tool}`;
    const identityKey = `${identity.deviceId}\0${identity.serial ?? ""}`;
    const [errorState, setErrorState] = useState<KeyedError | null>(null);
    const [liveTempErrorState, setLiveTempErrorState] = useState<KeyedError | null>(null);
    const [livePatternErrorState, setLivePatternErrorState] = useState<KeyedError | null>(null);
    const [busyState, setBusyState] = useState<string | null>(null);
    const liveTempEpoch = useRef(0);
    const livePatternEpoch = useRef(0);
    const autoOpenedFor = useRef<string | null>(null);
    const mounted = useRef(true);
    const latestKey = useRef(routeKey);
    const mountAbort = useRef<AbortController | null>(null);

    latestKey.current = routeKey;

    useEffect(() => {
        mounted.current = true;
        const controller = new AbortController();
        mountAbort.current = controller;
        const tempEpoch = liveTempEpoch;
        const patternEpoch = livePatternEpoch;
        return () => {
            mounted.current = false;
            controller.abort();
            tempEpoch.current++;
            patternEpoch.current++;
        };
    }, [routeKey]);

    const error = errorState?.key === routeKey ? errorState.message : null;
    const liveTempError = liveTempErrorState?.key === routeKey ? liveTempErrorState.message : null;
    const livePatternError = livePatternErrorState?.key === routeKey ? livePatternErrorState.message : null;
    const busy = busyState === routeKey;

    const bound = support.bound;
    const owns = snapshot.identity?.deviceId === identity.deviceId
        && snapshot.identity.serial === identity.serial && snapshot.tool === tool;
    const phase: ControlPhase = owns ? snapshot.phase : "closed";
    const openingInProgress = !owns
        && support.unavailable === null
        && error === null
        && (snapshot.phase === "closed" || snapshot.phase === "leaving");
    const uiPhase: ControlPhase = owns ? snapshot.phase : openingInProgress ? "entering" : "closed";

    const grindDraft = draftState.identityKey === identityKey ? draftState.grind : null;
    const pourDraft = draftState.identityKey === identityKey ? draftState.pour : null;

    // Pre-seed qualified candidate requests while opening (`support.unavailable === null`) so
    // parameter controls stay mounted across `entering -> ready` without a plain-text flash.
    const canPreSeed = support.unavailable === null;
    const dialSize = canPreSeed && tool === "grind" ? controls.dialGrindSizeFor(identity) : null;
    const seededGrind = canPreSeed && tool === "grind" ? seedGrindRequest(support.grind, dialSize) : null;
    const seededPour = canPreSeed && tool === "pour" ? seedPourRequest(support.pour) : null;
    const grind = tool === "grind"
        ? grindDraft ?? (bound ? snapshot.grindRequest ?? seededGrind : seededGrind)
        : null;
    const pour = tool === "pour"
        ? pourDraft ?? (bound ? snapshot.pourRequest ?? seededPour : seededPour)
        : null;
    const scaleSamples = owns && tool === "scale" && draftState.scaleIdentityKey === identityKey
        ? draftState.scaleSamples
        : EMPTY_SAMPLES;

    const unavailable = support.unavailable ?? (!bound
        ? uiPhase === "entering"
            ? null
            : phase === "closed"
                ? (error !== null && !busy ? "Tool could not be opened." : null)
                : "Reconcile the exact named machine before continuing."
        : null);

    async function perform(action: () => Promise<void>): Promise<void> {
        const activeKey = routeKey;
        setErrorState(null);
        setBusyState(activeKey);
        try {
            await action();
        } catch (cause) {
            if (mounted.current && latestKey.current === activeKey) {
                setErrorState({
                    key: activeKey,
                    message: cause instanceof Error ? cause.message : "The machine control failed."
                });
            }
        }
        if (mounted.current && latestKey.current === activeKey) {
            setBusyState(null);
        }
    }

    function open(): void {
        liveTempEpoch.current++;
        livePatternEpoch.current++;
        setLiveTempErrorState(null);
        setLivePatternErrorState(null);
        void perform(async () => {
            const current = controls.describeTool(identity, tool);
            if (current.unavailable) throw new Error(current.unavailable);
            await controls.open(identity, tool, mountAbort.current?.signal);
        });
    }

    useEffect(() => {
        const targetKey = `${identity.deviceId}\0${identity.serial ?? ""}\0${tool}`;
        if (autoOpenedFor.current === targetKey) return;
        if (phase !== "closed" || owns || support.unavailable !== null) return;
        autoOpenedFor.current = targetKey;
        const target = {deviceId: identity.deviceId, serial: identity.serial};
        const signal = mountAbort.current?.signal;
        void (async () => {
            try {
                const current = controls.describeTool(target, tool);
                if (current.unavailable) throw new Error(current.unavailable);
                await controls.open(target, tool, signal);
            } catch (cause) {
                if (mounted.current && latestKey.current === targetKey && !signal?.aborted) {
                    setErrorState({
                        key: targetKey,
                        message: cause instanceof Error ? cause.message : "The machine control failed."
                    });
                }
            }
        })();
    }, [controls, identity.deviceId, identity.serial, owns, phase, support.unavailable, tool]);

    function requireBound(): void {
        if (!controls.describeTool(identity, tool).bound) {
            throw new Error("This tool no longer owns the exact named machine. No command was sent.");
        }
    }

    function setGrind(request: GrindRequest): void {
        store.setGrind(identity, request);
    }

    function setPour(request: PourRequest): void {
        store.setPour(identity, request);
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
            store.setPour(identity, next);
        });
    }

    function start(): void {
        liveTempEpoch.current++;
        livePatternEpoch.current++;
        setLiveTempErrorState(null);
        setLivePatternErrorState(null);
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
        const activeKey = routeKey;
        const epoch = ++liveTempEpoch.current;
        setLiveTempErrorState(null);
        void controls.setTemperature(celsius).catch((cause) => {
            if (liveTempEpoch.current === epoch && latestKey.current === activeKey) {
                setLiveTempErrorState({
                    key: activeKey,
                    message: cause instanceof Error ? cause.message : "Failed to update temperature."
                });
            }
        });
    }

    function setLivePattern(pattern: Pattern): void {
        const activeKey = routeKey;
        const epoch = ++livePatternEpoch.current;
        setLivePatternErrorState(null);
        void controls.setPattern(pattern).catch((cause) => {
            if (livePatternEpoch.current === epoch && latestKey.current === activeKey) {
                setLivePatternErrorState({
                    key: activeKey,
                    message: cause instanceof Error ? cause.message : "Failed to update pattern."
                });
            }
        });
    }

    return {
        support, owns, phase, uiPhase, bound, unavailable, error, liveTempError, livePatternError, busy,
        grind, pour, scaleSamples,
        setGrind, setPour, changeMode, start, open, recover,
        setLiveTemperature, setLivePattern,
        reconnect: () => { void perform(() => controls.reconnectTool(identity, tool)); },
        stop: () => { void perform(async () => { requireBound(); await controls.stop(); }); },
        tare: () => { void perform(async () => { requireBound(); await controls.tare(); }); }
    };
}
