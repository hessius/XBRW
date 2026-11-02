import {act, renderHook} from "@testing-library/react-native";
import {useMachineControls} from "@/hooks/useMachineControls";
import {holdLinkAcrossAppState} from "@/hooks/useMachine";
import {controlFixture, flushControls, identity} from "./machineControlFixture";
import {status} from "@/library/machine/__tests__/protocolFixtures";
import {MACHINE_STATE} from "@/library/machine/protocol";

jest.mock("react-native-ble-manager", () => ({__esModule: true, default: {}}));
jest.mock("@/components/XbrwToast", () => ({notify: jest.fn()}));

it("shares cached snapshots across subscribers without releasing or replaying Start on remount", async () => {
    const s = await controlFixture();
    const first = await renderHook(() => useMachineControls(s.controls));
    const second = await renderHook(() => useMachineControls(s.controls));
    expect(first.result.current.controls).toBe(second.result.current.controls);
    expect(first.result.current.snapshot).toBe(second.result.current.snapshot);
    await act(async () => {
        await s.controls.open(identity, "grind");
        await s.controls.startGrind({grindSize: 5, rpm: 150});
    });
    const running = first.result.current.snapshot;
    expect(second.result.current.snapshot).toBe(running);
    await first.unmount();
    await second.unmount();
    expect(s.machine.controlBlocker).not.toBeNull();
    const again = await renderHook(() => useMachineControls(s.controls));
    expect(again.result.current.snapshot).toBe(running);
    expect(s.planned.map(p => p.command.kind)).toEqual(["enter", "grind"]);
    await again.unmount();
    s.controls.dispose();
});

it("retains an owned background control and reconciles its exact identity on foreground without Start", async () => {
    const s = await controlFixture();
    await s.controls.open(identity, "grind");
    await s.controls.startGrind({grindSize: 5, rpm: 150});
    let change: (state: string) => void = () => {};
    const reconnect = jest.fn(async (_target?: string) => {});
    const off = holdLinkAcrossAppState(s.machine, reconnect, {
        controls: s.controls,
        appState: {currentState: "active", addEventListener: (_type, handler) => {
            change = handler;
            return {remove: () => {}};
        }}
    });
    change("background");
    expect(s.machine.isConnected()).toBe(true);
    s.radio.drop();
    change("active");
    await flushControls();
    expect(reconnect).toHaveBeenCalledWith(identity.deviceId);
    expect(s.planned.filter(p => p.command.kind === "grind")).toHaveLength(1);
    expect(s.recovery.snapshot.marker).not.toBeNull();
    off();
    s.controls.dispose();
});

it("permanently detaches a reset controller without releasing its uncertain lease or clearing recovery", async () => {
    const s = await controlFixture();
    await s.controls.open(identity, "grind");
    await s.controls.startGrind({grindSize: 5, rpm: 150});
    const listener = jest.fn();
    s.controls.subscribe(listener);
    const start = s.planned[1];
    s.controls.dispose();
    const calls = listener.mock.calls.length;
    s.feedback(start, {kind: "terminal"});
    expect(s.recovery.snapshot.marker).not.toBeNull();
    expect(s.machine.controlBlocker).not.toBeNull();
    expect(s.controls.getSnapshot().phase).toBe("unknown");
    expect(listener).toHaveBeenCalledTimes(calls);
    await expect(s.controls.open(identity, "grind")).rejects.toThrow();
});

it.each(["grind", "scale"] as const)("reconciles an owned %s on foreground before accepting any new writes", async tool => {
    const s = await controlFixture();
    await s.controls.open(identity, tool);
    if (tool === "grind") await s.controls.startGrind({grindSize: 5, rpm: 150});
    let change: (state: string) => void = () => {};
    const reconnect = jest.fn(async (target?: string) => {
        await s.machine.connect(target!);
        s.radio.emit(status(MACHINE_STATE.IDLE));
    });
    const off = holdLinkAcrossAppState(s.machine, reconnect, {
        controls: s.controls,
        appState: {currentState: "active", addEventListener: (_type, handler) => {
            change = handler;
            return {remove: () => {}};
        }}
    });
    s.respond(item => {
        if (item.command.kind === "inspect") s.feedback(item, {kind: tool === "grind" ? "active" : "closed"});
        else s.accept(item);
    });
    change("background");
    expect(s.controls.getSnapshot().phase).toBe("unknown");
    expect(s.machine.isConnected()).toBe(true);
    if (tool === "scale") {
        await expect(s.controls.tare()).rejects.toThrow();
    } else await expect(s.controls.startGrind({grindSize: 5, rpm: 150})).rejects.toThrow();
    s.radio.drop();
    change("active");
    await flushControls();
    expect(reconnect).toHaveBeenCalledWith(identity.deviceId);
    expect(s.planned.map(p => p.command.kind)).toEqual(tool === "grind"
        ? ["enter", "grind", "inspect"] : ["enter", "inspect"]);
    expect(s.controls.getSnapshot().phase).toBe(tool === "grind" ? "unknown" : "closed");
    if (tool === "grind") expect(s.recovery.snapshot.marker).not.toBeNull();
    else expect(s.machine.controlBlocker).toBeNull();
    off();
    s.controls.dispose();
});

it("keeps ordinary no-owner reconnect behavior after a completed setting retains its reading identity", async () => {
    const s = await controlFixture();
    await s.controls.applySetting(identity, "brightness", 3);
    expect(s.controls.getSnapshot()).toMatchObject({phase: "closed", identity});
    let change: (state: string) => void = () => {};
    const reconnect = jest.fn(async (_target?: string) => {});
    const off = holdLinkAcrossAppState(s.machine, reconnect, {
        controls: s.controls,
        appState: {currentState: "active", addEventListener: (_type, handler) => {
            change = handler;
            return {remove: () => {}};
        }}
    });
    change("background");
    await flushControls();
    change("active");
    await flushControls();
    expect(reconnect).toHaveBeenCalledWith();
    off();
    s.controls.dispose();
});

it("retains a persisted motor reservation even before the controller has attached a route session", async () => {
    const s = await controlFixture();
    s.recovery.reserve({version: 1, ...identity, tool: "grind"});
    let change: (state: string) => void = () => {};
    const reconnect = jest.fn(async (target?: string) => { await s.machine.connect(target!); });
    const off = holdLinkAcrossAppState(s.machine, reconnect, {
        controls: s.controls,
        appState: {currentState: "active", addEventListener: (_type, handler) => {
            change = handler;
            return {remove: () => {}};
        }}
    });
    expect(s.controls.getSnapshot().phase).toBe("closed");
    change("background");
    await flushControls();
    expect(s.machine.isConnected()).toBe(true);
    s.radio.drop();
    change("active");
    await flushControls();
    expect(reconnect).toHaveBeenCalledWith(identity.deviceId);
    expect(s.planned.map(p => p.command.kind)).toEqual(["inspect"]);
    expect(s.controls.getSnapshot().phase).toBe("unknown");
    expect(s.recovery.snapshot.marker).not.toBeNull();
    off();
    s.controls.dispose();
});

it("reconciles a stale surviving Scale link through inspection without weakening normal acquisition", async () => {
    const s = await controlFixture();
    await s.controls.open(identity, "scale");
    let change: (state: string) => void = () => {};
    const reconnect = jest.fn(async (_target?: string) => {});
    const off = holdLinkAcrossAppState(s.machine, reconnect, {
        controls: s.controls,
        appState: {currentState: "active", addEventListener: (_type, handler) => {
            change = handler;
            return {remove: () => {}};
        }}
    });
    s.respond(item => {
        if (item.command.kind === "inspect") s.feedback(item, {kind: "closed"});
        else s.accept(item);
    });
    jest.useFakeTimers();
    try {
        change("background");
        await jest.advanceTimersByTimeAsync(16_000);
        expect(s.machine.isConnected()).toBe(true);
        change("active");
        await flushControls();
        expect(s.planned.map(p => p.command.kind)).toEqual(["enter", "inspect"]);
        expect(s.controls.getSnapshot().phase).toBe("closed");
        expect(s.machine.controlBlocker).toBeNull();
        expect(s.recovery.snapshot.marker).toBeNull();
        expect(reconnect).not.toHaveBeenCalled();
        await expect(s.controls.open(identity, "scale")).rejects.toThrow(/fresh known normal/i);
    } finally {
        off();
        s.controls.dispose();
        jest.useRealTimers();
    }
});
