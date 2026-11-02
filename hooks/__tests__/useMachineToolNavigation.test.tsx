import React from "react";
import {View} from "react-native";
import {Button, Text, YStack} from "tamagui";
import {act, fireEvent, renderHook, screen, waitFor} from "@testing-library/react-native";
import {renderWithProviders, SHEET_PRESS_TIMEOUT} from "@/test-utils/render";
import XbrwSheet from "@/components/XbrwSheet";
import {useMachineToolNavigation} from "@/hooks/useMachineToolNavigation";
import {requestLiveBrewBarNavigation, performLiveBrewBarAction} from "@/hooks/useLiveBrewBarGuard";
import type MachineControls from "@/library/machine/MachineControls";
import type {ControlIdentity} from "@/library/machine/controlModel";
import {controlFixture, flushControls, identity, type Planned} from "./machineControlFixture";

jest.mock("react-native-ble-manager", () => ({__esModule: true, default: {}}));
jest.mock("@/components/XbrwToast", () => ({notify: jest.fn()}));
jest.mock("expo-router", () => ({useNavigation: () => ({dispatch: mockDispatch})}));
jest.mock("expo-router/react-navigation", () => ({
    useIsFocused: () => mockFocused,
    usePreventRemove: (prevent: boolean, callback: Prevention) => { mockPrevention = {prevent, callback}; }
}));
type Action = {type: string; payload?: {count: number}; source?: string};
type Prevention = (event: {data: {action: Action}}) => void;
let mockPrevention: {prevent: boolean; callback: Prevention};
let mockFocused = true;
const mockDispatch = jest.fn();
function back(action: Action = {type: "GO_BACK"}) {
    if (mockPrevention.prevent) mockPrevention.callback({data: {action}});
    else mockDispatch(action);
}
beforeEach(() => {
    mockFocused = true;
    mockDispatch.mockClear();
});

function Host({controls, target = identity}: {controls: MachineControls; target?: ControlIdentity}) {
    const guard = useMachineToolNavigation(target, controls);
    const prompt = guard.prompt;
    return <>
        <View testID="tool-content" accessibilityElementsHidden={guard.covered}
              importantForAccessibility={guard.covered ? "no-hide-descendants" : "auto"}>
            <Button onPress={() => back()}>Back</Button>
        </View>
        {prompt && <XbrwSheet open={prompt.open} onOpenChange={prompt.onOpenChange} title="Leave tool?">
            <YStack>
                <Text>{prompt.error ?? "Stop the machine before leaving."}</Text>
                <Button accessibilityLabel="Stop and leave" disabled={prompt.busy} onPress={() => { void prompt.stopAndLeave(); }}>
                    Stop and leave
                </Button>
                <Button accessibilityLabel="Stay" onPress={prompt.stay}>Stay</Button>
            </YStack>
        </XbrwSheet>}
    </>;
}
async function moving() {
    const s = await controlFixture();
    await s.controls.open(identity, "grind");
    await s.controls.startGrind({grindSize: 5, rpm: 150});
    return s;
}
async function press(label: string, assertion: () => void) {
    await waitFor(async () => {
        await fireEvent.press(screen.getByRole("button", {name: label}));
        assertion();
    }, {timeout: SHEET_PRESS_TIMEOUT});
}

it("replays the exact original native action once only after terminal proof and qualified exit", async () => {
    const s = await moving();
    let stop: Planned | undefined;
    let exit: Planned | undefined;
    s.respond(item => {
        if (item.command.kind === "stop") stop = item;
        if (item.command.kind === "exit") exit = item;
    });
    await renderWithProviders(<Host controls={s.controls}/>);
    const action = {type: "POP", payload: {count: 2}, source: "original-native-marker"};
    await act(async () => { back(action); back({type: "GO_BACK"}); });
    expect(screen.getByTestId("tool-content", {includeHiddenElements: true}))
        .toHaveProp("importantForAccessibility", "no-hide-descendants");
    const barAction = jest.fn();
    performLiveBrewBarAction(barAction);
    expect(barAction).not.toHaveBeenCalled();
    await press("Stop and leave", () => expect(s.controls.getSnapshot().phase).toBe("stopping"));
    await act(flushControls);
    expect(s.planned.filter(p => p.command.kind === "stop")).toHaveLength(1);
    expect(mockDispatch).not.toHaveBeenCalled();
    await act(async () => {
        s.feedback(stop!, {kind: "terminal"});
        await flushControls();
    });
    expect(exit).toBeDefined();
    expect(mockDispatch).not.toHaveBeenCalled();
    await act(async () => { s.feedback(exit!, {kind: "closed"}); await flushControls(); });
    expect(mockDispatch).toHaveBeenCalledTimes(1);
    expect(mockDispatch.mock.calls[0][0]).toBe(action);
    s.controls.dispose();
});

it("keeps a failed Stop on screen with an explicit error and permits a deliberate retry", async () => {
    const s = await moving();
    s.respond(() => {});
    await renderWithProviders(<Host controls={s.controls}/>);
    await act(async () => { back(); });
    await press("Stop and leave", () => expect(s.controls.getSnapshot().phase).toBe("stopping"));
    await waitFor(() => expect(screen.getByText("Qualified control response missing.")).toBeTruthy());
    expect(mockDispatch).not.toHaveBeenCalled();
    expect(s.recovery.snapshot.marker).not.toBeNull();
    s.respond(s.accept);
    await press("Stop and leave", () => expect(s.planned.filter(p => p.command.kind === "stop")).toHaveLength(2));
    await waitFor(() => expect(mockDispatch).toHaveBeenCalledTimes(1));
    s.controls.dispose();
});

it("Stay cancels replay, not an already pending Stop", async () => {
    const s = await moving();
    let stop: Planned | undefined;
    s.respond(item => { if (item.command.kind === "stop") stop = item; });
    const hook = await renderHook(() => useMachineToolNavigation(identity, s.controls));
    await act(async () => { back(); });
    await act(async () => {
        void hook.result.current.prompt!.stopAndLeave();
        await flushControls();
    });
    await act(async () => { hook.result.current.prompt!.stay(); });
    await act(async () => { s.feedback(stop!, {kind: "terminal"}); await flushControls(); });
    expect(s.controls.getSnapshot().phase).toBe("ready");
    expect(s.planned.filter(p => p.command.kind === "exit")).toHaveLength(0);
    expect(mockDispatch).not.toHaveBeenCalled();
    expect(hook.result.current.prompt).toBeNull();
    s.controls.dispose();
});

it("cancels stale prompts on identity change, blur and forced unmount", async () => {
    for (const change of ["identity", "blur", "unmount"] as const) {
        const s = await moving();
        let stop: Planned | undefined;
        s.respond(item => { if (item.command.kind === "stop") stop = item; });
        const hook = await renderHook(({target}: {target: ControlIdentity}) => useMachineToolNavigation(target, s.controls), {
            initialProps: {target: identity as ControlIdentity}
        });
        await act(async () => { back(); });
        const old = hook.result.current.prompt!;
        await act(async () => { void old.stopAndLeave(); await flushControls(); });
        if (change === "identity") await hook.rerender({target: {...identity, deviceId: "other"}});
        if (change === "blur") {
            mockFocused = false;
            await hook.rerender({target: identity});
        }
        if (change === "unmount") await hook.unmount();
        await act(async () => { s.feedback(stop!, {kind: "terminal"}); await flushControls(); });
        expect(mockDispatch).not.toHaveBeenCalled();
        expect(s.planned.filter(p => p.command.kind === "exit")).toHaveLength(0);
        await act(async () => { void old.stopAndLeave(); await flushControls(); });
        expect(s.planned.filter(p => p.command.kind === "stop")).toHaveLength(1);
        await hook.unmount();
        mockFocused = true;
        s.controls.dispose();
    }
});

it("guards brew-bar navigation and closes a ready tool without sending Stop", async () => {
    const s = await controlFixture();
    await s.controls.open(identity, "scale");
    let exit: Planned | undefined;
    s.respond(item => { if (item.command.kind === "exit") exit = item; });
    const hook = await renderHook(() => useMachineToolNavigation(identity, s.controls));
    const navigate = jest.fn();
    await act(async () => { requestLiveBrewBarNavigation(navigate); await flushControls(); });
    expect(navigate).not.toHaveBeenCalled();
    expect(s.planned.map(p => p.command.kind)).toEqual(["enter", "exit"]);
    await act(async () => { s.feedback(exit!, {kind: "closed"}); await flushControls(); });
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(hook.result.current.prompt).toBeNull();
    s.controls.dispose();
});

it("does not Stop or navigate another machine's owned operation", async () => {
    const s = await moving();
    const hook = await renderHook(() => useMachineToolNavigation({...identity, serial: "other"}, s.controls));
    await act(async () => { back(); });
    await act(async () => { await hook.result.current.prompt!.stopAndLeave(); });
    expect(hook.result.current.prompt?.error).toMatch(/identity|machine/i);
    expect(s.planned.map(p => p.command.kind)).toEqual(["enter", "grind"]);
    expect(mockDispatch).not.toHaveBeenCalled();
    s.controls.dispose();
});

it("recovered moving sessions may depart only after their qualified terminal closes recovery ownership", async () => {
    const s = await moving();
    await s.machine.disconnect();
    await s.machine.connect(identity.deviceId);
    await s.controls.recover();
    expect(s.controls.getSnapshot().phase).toBe("unknown");
    const hook = await renderHook(() => useMachineToolNavigation(identity, s.controls));
    const navigate = jest.fn();
    await act(async () => { requestLiveBrewBarNavigation(navigate); });
    await act(async () => { await hook.result.current.prompt!.stopAndLeave(); });
    expect(s.recovery.snapshot.marker).toBeNull();
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(s.planned.map(p => p.command.kind)).toEqual(["enter", "grind", "inspect", "stop"]);
    s.controls.dispose();
});

it("retains a failed passive-scale exit without ever sending a motor Stop", async () => {
    const s = await controlFixture();
    await s.controls.open(identity, "scale");
    s.respond(() => {});
    const hook = await renderHook(() => useMachineToolNavigation(identity, s.controls));
    const navigate = jest.fn();
    await act(async () => { hook.result.current.requestDeparture(navigate); });
    await waitFor(() => expect(hook.result.current.prompt?.error).toMatch(/response missing/i));
    expect(s.planned.map(p => p.command.kind)).toEqual(["enter", "exit"]);
    expect(s.machine.controlBlocker).not.toBeNull();
    expect(navigate).not.toHaveBeenCalled();
    s.controls.dispose();
});

it("deduplicates confirmation taps and never treats ready feedback or native write acceptance as Stop proof", async () => {
    const s = await moving();
    s.respond(item => { if (item.command.kind === "stop") s.feedback(item, {kind: "ready"}); });
    const hook = await renderHook(() => useMachineToolNavigation(identity, s.controls));
    await act(async () => { back(); });
    await act(async () => {
        const prompt = hook.result.current.prompt!;
        await Promise.all([prompt.stopAndLeave(), prompt.stopAndLeave()]);
    });
    expect(s.planned.filter(p => p.command.kind === "stop")).toHaveLength(1);
    expect(s.planned.filter(p => p.command.kind === "exit")).toHaveLength(0);
    expect(s.recovery.snapshot.marker).not.toBeNull();
    expect(hook.result.current.prompt?.error).toMatch(/contradictory/i);
    expect(mockDispatch).not.toHaveBeenCalled();
    s.controls.dispose();
});

it("ignores stale departure handlers after a forced remount even when the controller is now closed", async () => {
    const s = await controlFixture();
    const first = await renderHook(() => useMachineToolNavigation(identity, s.controls));
    const stale = first.result.current.requestDeparture;
    await first.unmount();
    await renderHook(() => useMachineToolNavigation(identity, s.controls));
    const navigate = jest.fn();
    await act(async () => { stale(navigate); });
    expect(navigate).not.toHaveBeenCalled();
    s.controls.dispose();
});

it("sheet dismissal cancels a departure without issuing Stop or releasing the tool", async () => {
    const s = await moving();
    await renderWithProviders(<Host controls={s.controls}/>);
    await act(async () => { back(); });
    await press("Close", () => expect(screen.getByTestId("tool-content")).toHaveProp("importantForAccessibility", "auto"));
    expect(s.planned.map(p => p.command.kind)).toEqual(["enter", "grind"]);
    expect(s.machine.controlBlocker).not.toBeNull();
    expect(mockDispatch).not.toHaveBeenCalled();
    s.controls.dispose();
});

it.each(["starting", "stopping"] as const)("awaits the owned %s operation rather than duplicating Start or Stop", async phase => {
    const s = await controlFixture();
    await s.controls.open(identity, "grind");
    let stop: Planned | undefined;
    s.respond(item => {
        if (item.command.kind === "stop") stop = item;
        if (item.command.kind === "exit") s.accept(item);
        if (item.command.kind === "grind" && phase === "stopping") s.accept(item);
    });
    const start = s.controls.startGrind({grindSize: 5, rpm: 150}).catch(() => {});
    await flushControls();
    let pendingStop: Promise<void> | undefined;
    if (phase === "stopping") {
        await start;
        pendingStop = s.controls.stop();
        await flushControls();
    }
    expect(s.controls.getSnapshot().phase).toBe(phase);
    const hook = await renderHook(() => useMachineToolNavigation(identity, s.controls));
    await act(async () => { back(); });
    await act(async () => { void hook.result.current.prompt!.stopAndLeave(); await flushControls(); });
    expect(s.planned.filter(p => p.command.kind === "stop")).toHaveLength(1);
    expect(mockDispatch).not.toHaveBeenCalled();
    await act(async () => {
        s.feedback(stop!, {kind: "terminal"});
        await start;
        await pendingStop;
        await flushControls();
    });
    expect(mockDispatch).toHaveBeenCalledTimes(1);
    expect(s.planned.map(p => p.command.kind)).toEqual(["enter", "grind", "stop", "exit"]);
    s.controls.dispose();
});

it.each(["entry", "apply"] as const)("fails visibly safe after %s uncertainty without creating motor proof", async operation => {
    const s = await controlFixture();
    s.respond(() => {});
    if (operation === "entry") await expect(s.controls.open(identity, "grind")).rejects.toThrow(/missing/i);
    else await expect(s.controls.applySetting(identity, "brightness", 3)).rejects.toThrow(/missing/i);
    const hook = await renderHook(() => useMachineToolNavigation(identity, s.controls));
    await act(async () => { back(); });
    await act(async () => { await hook.result.current.prompt!.stopAndLeave(); });
    expect(hook.result.current.prompt?.error).toMatch(/cannot close|no owned moving/i);
    expect(s.machine.controlBlocker).not.toBeNull();
    expect(s.recovery.snapshot.marker).toBeNull();
    expect(s.planned.map(p => p.command.kind)).toEqual([operation === "entry" ? "enter" : "inspect"]);
    expect(mockDispatch).not.toHaveBeenCalled();
    s.controls.dispose();
});
