import {useLayoutEffect, useRef, useState} from "react";
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
function moving(snapshot: ControlSnapshot): boolean {
    return (snapshot.tool === "grind" || snapshot.tool === "pour")
        && ["starting", "running", "stopping", "unknown"].includes(snapshot.phase);
}

/**
 * The focused route hosts the returned prompt in XbrwSheet and applies covered
 * to both accessibilityElementsHidden and Android's no-hide-descendants.
 * Dismissing cancels departure, never an already dispatched Stop.
 */
export function useMachineToolNavigation(
    identity: ControlIdentity, injected?: MachineControls, mode: "tool" | "setting" = "tool"
) {
    const {deviceId, serial} = identity;
    const {controls, snapshot} = useMachineControls(injected);
    const navigation = useNavigation();
    const focused = useIsFocused();
    const [state, setState] = useState<Prompt | null>(null);
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

    function stay(request: Departure): void {
        if (pending.current?.request !== request) return;
        request.cancel.abort();
        pending.current = null;
        setState(null);
    }

    async function leave(request: Departure): Promise<void> {
        if (!current(request) || pending.current!.busy) return;
        pending.current!.busy = true;
        setState({request, busy: true, error: null});
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
            if (moving(controls.getSnapshot())) await controls.stop();
            // A recovery-only Stop closes its lease on terminal proof; an
            // ordinary tool still requires its separate qualified exit.
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
            setState({request, busy: false, error: error instanceof Error ? error.message : "Could not safely leave the tool."});
        }
    }

    function requestDeparture(navigate: () => void): void {
        if (!currentView()) return;
        if (pending.current && current(pending.current.request, pending.current.closing)) return;
        const actual = controls.getSnapshot();
        if (actual.phase === "closed") {
            navigate();
            return;
        }
        let used = false;
        const request: Departure = {
            owner: actual.identity, deviceId, serial, cancel: new AbortController(),
            exit: () => {
                if (used) return;
                used = true;
                navigate();
            }
        };
        pending.current = {request, busy: false, closing: false};
        setState({request, busy: false, error: actual.error});
        if (actual.phase === "ready") void leave(request);
    }

    // Keep the original action, including native-stack's visited-route marker.
    usePreventRemove(focused && snapshot.phase !== "closed", ({data}) => {
        requestDeparture(() => navigation.dispatch(data.action));
    });

    const visible = state !== null && focused && !state.request.cancel.signal.aborted
        && state.request.deviceId === deviceId && state.request.serial === serial
        && (state.request.owner === snapshot.identity || (state.busy && snapshot.phase === "closed"));
    const covered = visible;
    const navigationBlocked = covered || (focused && ["entering", "leaving", "applying"].includes(snapshot.phase));
    useLiveBrewBarGuard(focused, {covered: navigationBlocked, requestNavigation: requestDeparture});
    const prompt = visible ? {
        open: true,
        busy: state.busy || snapshot.phase === "applying",
        error: state.error ?? snapshot.error,
        requiresReconciliation: mode === "setting" && snapshot.tool === null && snapshot.phase === "unknown",
        requiresStop: moving(snapshot),
        stopAndLeave: () => leave(state.request),
        stay: () => stay(state.request),
        onOpenChange: (open: boolean) => { if (!open) stay(state.request); }
    } : null;
    return {covered, navigationBlocked, prompt, requestDeparture};
}
