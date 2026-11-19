import {useEffect, useLayoutEffect, useRef, useState} from "react";
import {useNavigation} from "expo-router";
import {useIsFocused, usePreventRemove} from "expo-router/react-navigation";
import {useLiveBrewBarGuard} from "@/hooks/useLiveBrewBarGuard";
import {useMachineControls} from "@/hooks/useMachineControls";
import type MachineControls from "@/library/machine/MachineControls";
import type {ControlIdentity, ControlSnapshot} from "@/library/machine/controlModel";

type Departure = {
    owner: ControlIdentity | null;
    deviceId: string;
    serial: string | null;
    cancel: AbortController;
    exit: () => void;
};
type Prompt = {request: Departure; busy: boolean; error: string | null};
export type NavigationOptions = {
    onBlocked?: (reason: string) => void;
};

function moving(snapshot: ControlSnapshot, controls: MachineControls): boolean {
    if (snapshot.tool !== "grind" && snapshot.tool !== "pour") return false;
    if (snapshot.phase === "starting" || snapshot.phase === "running" || snapshot.phase === "stopping") return true;
    return snapshot.phase === "unknown"
        && snapshot.identity !== null
        && controls.describeTool(snapshot.identity, snapshot.tool).stopUnavailable
            !== "No moving operation is reserved. Reconcile this machine before continuing.";
}

function toolBlockReason(
    identity: ControlIdentity,
    actual: ControlSnapshot,
    controls: MachineControls
): string {
    if (actual.identity !== null
        && (actual.identity.deviceId !== identity.deviceId || actual.identity.serial !== identity.serial)) {
        return "Another machine controls the connection.";
    }
    if (moving(actual, controls)) {
        const label = actual.tool === "pour" ? "pour" : actual.tool === "grind" ? "grind" : "operation";
        return actual.phase === "stopping" ? `Stopping ${label}…` : `Stop ${label} before leaving.`;
    }
    if (actual.phase === "applying") return "Wait for scale tare to finish.";
    if (actual.phase === "entering") return "Wait for tool to finish opening.";
    if (actual.tool !== null && controls.describeTool(identity, actual.tool).reconnectable) {
        return "Machine disconnected — reconnect to inspect or use Leave screen below.";
    }
    return "Reconcile the machine before leaving.";
}

/**
 * Tool departure exits immediately in the background when idle and blocks active runs
 * in-place via `blockedCount` / `onBlocked` (paired with a horizontal head-shake UI cue).
 * `mode === "setting"` preserves explicit synchronous recovery/confirmation prompts.
 */
export function useMachineToolNavigation(
    identity: ControlIdentity,
    injected?: MachineControls,
    mode: "tool" | "setting" = "tool",
    options?: NavigationOptions
) {
    const {deviceId, serial} = identity;
    const {controls, snapshot} = useMachineControls(injected);
    const navigation = useNavigation();
    const focused = useIsFocused();
    const [state, setState] = useState<Prompt | null>(null);
    const [blocked, setBlocked] = useState<{count: number; reason: string}>({count: 0, reason: ""});
    const [disconnectedExitPending, setDisconnectedExitPending] = useState(false);
    const disconnectNavigateRef = useRef<(() => void) | null>(null);
    const escapingRef = useRef(false);
    const pending = useRef<{request: Departure; busy: boolean; closing: boolean} | null>(null);
    const live = useRef({deviceId, serial, focused, controls, mounted: false});

    function currentView(): boolean {
        const view = live.current;
        return view.mounted && view.focused && view.controls === controls
            && view.deviceId === deviceId && view.serial === serial;
    }

    function current(request: Departure, allowClosed = false): boolean {
        const view = live.current;
        const actual = controls.getSnapshot();
        return pending.current?.request === request && !request.cancel.signal.aborted
            && view.mounted && view.focused && view.controls === controls
            && view.deviceId === request.deviceId && view.serial === request.serial
            && (actual.identity === request.owner || (allowClosed && actual.phase === "closed"));
    }

    useLayoutEffect(() => {
        live.current = {deviceId, serial, focused, controls, mounted: true};
        const entry = pending.current;
        if (entry && !current(entry.request, entry.closing)) {
            entry.request.cancel.abort();
            pending.current = null;
        }
    });
    useLayoutEffect(() => () => {
        live.current.mounted = false;
        pending.current?.request.cancel.abort();
        pending.current = null;
    }, []);

    useEffect(() => {
        if (!disconnectedExitPending) return;
        const navigate = disconnectNavigateRef.current;
        disconnectNavigateRef.current = null;
        if (navigate && live.current.mounted) navigate();
    }, [disconnectedExitPending]);

    useEffect(() => {
        if (mode !== "tool") return;
        const nav = navigation as {addListener?: (event: string, listener: () => void) => () => void};
        if (typeof nav.addListener !== "function") return;
        return nav.addListener("beforeRemove", () => {
            if (escapingRef.current || !currentView()) return;
            const actual = controls.getSnapshot();
            if (actual.phase === "ready"
                && actual.identity?.deviceId === deviceId
                && actual.identity?.serial === serial) {
                void controls.closeInBackground();
            }
        });
    }, [navigation, mode, controls, deviceId, serial]);

    function stay(request: Departure): void {
        if (pending.current?.request !== request) return;
        request.cancel.abort();
        pending.current = null;
        setState(null);
    }

    async function leave(request: Departure, silent = false): Promise<void> {
        if (!current(request) || pending.current!.busy) return;
        pending.current!.busy = true;
        if (!silent) setState({request, busy: true, error: null});
        try {
            if (request.owner?.deviceId !== request.deviceId || request.owner.serial !== request.serial) {
                throw new Error("The tool identity does not match the owned machine.");
            }
            if (mode === "setting" && controls.getSnapshot().tool !== null) {
                throw new Error("A different tool owns the connection. Return to that tool to close it safely.");
            }
            pending.current!.closing = true;
            if (mode === "setting" && controls.getSnapshot().phase === "unknown") {
                await controls.recover();
            }
            if (moving(controls.getSnapshot(), controls)) await controls.stop();
            if (!current(request, true)) return;
            await controls.close();
            if (!current(request, true) || controls.getSnapshot().phase !== "closed") return;
            request.cancel.abort();
            pending.current = null;
            setState(null);
            request.exit();
        } catch (error) {
            if (!current(request, true)) return;
            pending.current!.busy = false;
            pending.current!.closing = false;
            setState({
                request,
                busy: false,
                error: error instanceof Error ? error.message : "Could not safely leave the tool."
            });
        }
    }

    function requestDeparture(navigate: () => void): void {
        if (!currentView()) return;
        const actual = controls.getSnapshot();

        if (mode === "tool") {
            if (actual.phase === "closed" || actual.phase === "leaving") {
                escapingRef.current = true;
                navigate();
                return;
            }
            const sameOwner = actual.identity?.deviceId === deviceId && actual.identity?.serial === serial;
            if (actual.phase === "ready" && sameOwner) {
                escapingRef.current = true;
                void controls.closeInBackground();
                navigate();
                return;
            }
            const reason = toolBlockReason({deviceId, serial}, actual, controls);
            setBlocked(prev => ({count: prev.count + 1, reason}));
            options?.onBlocked?.(reason);
            return;
        }

        if (pending.current && current(pending.current.request, pending.current.closing)) return;
        if (actual.phase === "closed") {
            navigate();
            return;
        }
        let used = false;
        const request: Departure = {
            owner: actual.identity,
            deviceId,
            serial,
            cancel: new AbortController(),
            exit: () => {
                if (used) return;
                used = true;
                navigate();
            }
        };
        pending.current = {request, busy: false, closing: false};
        if (actual.phase === "ready") {
            void leave(request, true);
        } else {
            setState({request, busy: false, error: actual.error});
        }
    }

    function leaveWhileDisconnected(navigate: () => void): void {
        if (!currentView() || mode !== "tool") return;
        const actual = controls.getSnapshot();
        if (actual.phase !== "unknown") return;
        disconnectNavigateRef.current = navigate;
        escapingRef.current = true;
        setDisconnectedExitPending(true);
    }

    const sameOwner = snapshot.identity?.deviceId === deviceId && snapshot.identity.serial === serial;
    const toolCanDepartSilently = snapshot.phase === "closed"
        || snapshot.phase === "leaving"
        || (snapshot.phase === "ready" && sameOwner);
    const prevent = mode === "tool"
        ? (focused && !disconnectedExitPending && !toolCanDepartSilently)
        : (focused && snapshot.phase !== "closed");

    // Keep the original action, including native-stack's visited-route marker.
    usePreventRemove(prevent, ({data}) => {
        requestDeparture(() => navigation.dispatch(data.action));
    });

    const visible = mode === "setting" && state !== null && focused && !state.request.cancel.signal.aborted
        && state.request.deviceId === deviceId && state.request.serial === serial
        && (state.request.owner === snapshot.identity || (state.busy && snapshot.phase === "closed"));
    const covered = visible;
    const navigationBlocked = mode === "tool"
        ? prevent
        : (covered || (focused && ["entering", "leaving", "applying"].includes(snapshot.phase)));
    useLiveBrewBarGuard(focused, {covered: navigationBlocked, requestNavigation: requestDeparture});
    const prompt = visible ? {
        open: true,
        busy: state.busy || snapshot.phase === "applying",
        error: state.error ?? snapshot.error,
        requiresReconciliation: mode === "setting" && snapshot.tool === null && snapshot.phase === "unknown",
        requiresStop: moving(snapshot, controls),
        stopAndLeave: () => leave(state.request),
        stay: () => stay(state.request),
        onOpenChange: (open: boolean) => { if (!open) stay(state.request); }
    } : null;

    return {
        covered,
        navigationBlocked,
        prompt,
        blockedCount: blocked.count,
        blockedReason: blocked.reason,
        requestDeparture,
        leaveWhileDisconnected
    };
}
