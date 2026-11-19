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

function SettingHost({controls, target = identity}: {controls: MachineControls; target?: ControlIdentity}) {
    const guard = useMachineToolNavigation(target, controls, "setting");
    const prompt = guard.prompt;
    return <>
        <View testID="setting-content" accessibilityElementsHidden={guard.covered}
              importantForAccessibility={guard.covered ? "no-hide-descendants" : "auto"}>
            <Button onPress={() => back()}>Back</Button>
        </View>
        {prompt && <XbrwSheet open={prompt.open} onOpenChange={prompt.onOpenChange} title="Leave setting?">
            <YStack>
                <Text>{prompt.error ?? "Stop before leaving."}</Text>
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

describe("mode: tool", () => {
    it("leaves an idle ready tool immediately without modal confirmation while closing BLE in background", async () => {
        const s = await controlFixture();
        await s.controls.open(identity, "scale");
        let exit!: Planned;
        let releaseExit!: () => void;
        s.respond(item => {
            if (item.command.kind === "exit") {
                exit = item;
                void new Promise<void>(resolve => { releaseExit = resolve; }).then(() => s.feedback(exit, {kind: "closed"}));
            }
        });
        const onBlocked = jest.fn();
        const hook = await renderHook(() => useMachineToolNavigation(identity, s.controls, "tool", {onBlocked}));
        const navigate = jest.fn();

        await act(async () => {
            requestLiveBrewBarNavigation(navigate);
        });
        // Immediate navigation with zero prompt sheet while exit is in flight in background.
        expect(navigate).toHaveBeenCalledTimes(1);
        expect(hook.result.current.prompt).toBeNull();
        expect(hook.result.current.blockedCount).toBe(0);
        expect(onBlocked).not.toHaveBeenCalled();
        expect(mockPrevention.prevent).toBe(false);
        expect(s.controls.getSnapshot().phase).toBe("leaving");
        expect(s.planned.map(p => p.command.kind)).toEqual(["enter", "exit"]);

        await act(async () => {
            releaseExit();
            await flushControls();
        });
        expect(s.controls.getSnapshot().phase).toBe("closed");
        s.controls.dispose();
    });

    it("records honest uncertainty without sending motor Stop if background passive exit fails", async () => {
        const s = await controlFixture();
        await s.controls.open(identity, "scale");
        s.respond(() => {});
        const hook = await renderHook(() => useMachineToolNavigation(identity, s.controls, "tool"));
        const navigate = jest.fn();
        await act(async () => { hook.result.current.requestDeparture(navigate); });
        expect(navigate).toHaveBeenCalledTimes(1);
        await waitFor(() => expect(s.controls.getSnapshot().phase).toBe("unknown"));
        expect(s.planned.map(p => p.command.kind)).toEqual(["enter", "exit"]);
        expect(s.machine.controlBlocker).not.toBeNull();
        s.controls.dispose();
    });

    it.each(["starting", "running", "stopping", "unknown"] as const)(
        "blocks %s departure with horizontal refusal count instead of opening a sheet or navigating",
        async (phase) => {
            const s = await controlFixture();
            await s.controls.open(identity, "grind");
            s.respond(item => {
                if ((phase === "running" || phase === "stopping" || phase === "unknown") && item.command.kind === "grind") {
                    s.accept(item);
                } else if (phase === "unknown" && item.command.kind === "inspect") {
                    s.feedback(item, {kind: "active"});
                }
            });
            if (phase === "starting") {
                void s.controls.startGrind({grindSize: 5, rpm: 150}).catch(() => {});
                await flushControls();
            } else if (phase === "running") {
                await s.controls.startGrind({grindSize: 5, rpm: 150});
            } else if (phase === "stopping") {
                await s.controls.startGrind({grindSize: 5, rpm: 150});
                void s.controls.stop().catch(() => {});
                await flushControls();
            } else {
                await s.controls.startGrind({grindSize: 5, rpm: 150});
                await s.machine.disconnect();
                await s.machine.connect(identity.deviceId);
                await s.controls.recover();
            }
            expect(s.controls.getSnapshot().phase).toBe(phase);

            const onBlocked = jest.fn();
            const hook = await renderHook(() => useMachineToolNavigation(identity, s.controls, "tool", {onBlocked}));
            expect(mockPrevention.prevent).toBe(true);

            await act(async () => { back(); });
            expect(mockDispatch).not.toHaveBeenCalled();
            expect(hook.result.current.prompt).toBeNull();
            expect(hook.result.current.blockedCount).toBe(1);
            expect(onBlocked).toHaveBeenCalledTimes(1);

            const navigate = jest.fn();
            await act(async () => { hook.result.current.requestDeparture(navigate); });
            expect(navigate).not.toHaveBeenCalled();
            expect(hook.result.current.blockedCount).toBe(2);
            expect(s.planned.filter(p => p.command.kind === "exit")).toHaveLength(0);
            s.controls.dispose();
        }
    );

    it("refuses another machine's identity even when phase appears ready and leaves disconnected unknown only via explicit escape", async () => {
        const sReady = await controlFixture();
        await sReady.controls.open(identity, "grind");
        expect(sReady.controls.getSnapshot().phase).toBe("ready");
        const hook = await renderHook(() => useMachineToolNavigation({...identity, serial: "other"}, sReady.controls, "tool"));
        const navigate = jest.fn();
        await act(async () => { hook.result.current.requestDeparture(navigate); });
        expect(navigate).not.toHaveBeenCalled();
        expect(hook.result.current.blockedCount).toBe(1);
        expect(hook.result.current.blockedReason).toMatch(/reconcile|machine|identity/i);
        sReady.controls.dispose();

        // Now test disconnected unknown from a moving run -> permits explicit escape while preserving recovery marker
        const s = await moving();
        await act(async () => { s.radio.drop(); });
        const ownerHook = await renderHook(() => useMachineToolNavigation(identity, s.controls, "tool"));
        const leave = jest.fn();
        await act(async () => { ownerHook.result.current.leaveWhileDisconnected(leave); });
        await waitFor(() => expect(leave).toHaveBeenCalledTimes(1));
        expect(s.recovery.snapshot.marker).not.toBeNull();
        expect(s.planned.filter(p => p.command.kind === "exit")).toHaveLength(0);
        s.controls.dispose();
    });

    it("ignores stale departure handlers after a forced remount even when the controller is now closed", async () => {
        const s = await controlFixture();
        const first = await renderHook(() => useMachineToolNavigation(identity, s.controls, "tool"));
        const stale = first.result.current.requestDeparture;
        await first.unmount();
        await renderHook(() => useMachineToolNavigation(identity, s.controls, "tool"));
        const navigate = jest.fn();
        await act(async () => { stale(navigate); });
        expect(navigate).not.toHaveBeenCalled();
        s.controls.dispose();
    });
});

describe("mode: setting", () => {
    it("replays the exact original native action only after resolving in-flight setting recovery", async () => {
        const s = await controlFixture();
        let inspect: Planned | undefined;
        s.respond(item => {
            if (item.command.kind === "inspect") inspect = item;
        });
        await expect(s.controls.applySetting(identity, "brightness", 3)).rejects.toThrow(/missing/i);
        expect(s.controls.getSnapshot().phase).toBe("unknown");

        let inspected = false;
        s.respond(item => {
            if (item.command.kind === "inspect") {
                inspect = item;
                inspected = true;
                s.feedback(item, {
                    kind: "settings",
                    readings: {
                        temperatureUnit: null, weightUnit: null, brightness: 3,
                        waterSource: null, pourRadius: null, vibrationAmplitude: null
                    }
                });
            }
        });
        await renderWithProviders(<SettingHost controls={s.controls}/>);
        const action = {type: "POP", payload: {count: 2}, source: "original-native-marker"};
        await act(async () => { back(action); back({type: "GO_BACK"}); });
        expect(screen.getByTestId("setting-content", {includeHiddenElements: true}))
            .toHaveProp("importantForAccessibility", "no-hide-descendants");
        const barAction = jest.fn();
        performLiveBrewBarAction(barAction);
        expect(barAction).not.toHaveBeenCalled();

        await press("Stop and leave", () => expect(inspected).toBe(true));
        await act(flushControls);
        expect(mockDispatch).toHaveBeenCalledTimes(1);
        expect(mockDispatch.mock.calls[0][0]).toBe(action);
        void inspect;
        s.controls.dispose();
    });

    it("refuses closing a different tool from settings and Stay cancels departure", async () => {
        const s = await moving();
        const hook = await renderHook(() => useMachineToolNavigation(identity, s.controls, "setting"));
        await act(async () => { back(); });
        await act(async () => { await hook.result.current.prompt!.stopAndLeave(); });
        expect(hook.result.current.prompt?.error).toMatch(/different tool owns/i);
        await act(async () => { hook.result.current.prompt!.stay(); });
        expect(hook.result.current.prompt).toBeNull();
        expect(mockDispatch).not.toHaveBeenCalled();
        s.controls.dispose();
    });
});
