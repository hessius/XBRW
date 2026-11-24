import {act, renderHook, waitFor} from "@testing-library/react-native";
import {useMachineControls} from "@/hooks/useMachineControls";
import {useMachineTool} from "@/hooks/useMachineTool";
import {controlFixture, flushControls, identity, type Planned} from "./machineControlFixture";

jest.mock("react-native-ble-manager", () => ({__esModule: true, default: {}}));
jest.mock("@/components/XbrwToast", () => ({notify: jest.fn()}));

it("shares uncommitted grind drafts between views and pre-seeds during entering without flash", async () => {
    const s = await controlFixture();
    let releaseEnter!: () => void;
    s.respond((item: Planned) => {
        if (item.command.kind === "enter") {
            void new Promise<void>((resolve) => { releaseEnter = resolve; }).then(() => s.accept(item));
            return;
        }
        s.accept(item);
    });

    const inline = await renderHook(() => {
        const {controls, snapshot} = useMachineControls(s.controls);
        return useMachineTool(identity, "grind", controls, snapshot);
    });

    await waitFor(() => expect(inline.result.current.uiPhase).toBe("entering"));
    expect(inline.result.current.unavailable).toBeNull();
    expect(inline.result.current.grind).toEqual({grindSize: 1, rpm: 100});

    await act(async () => {
        releaseEnter();
        await flushControls();
    });
    expect(inline.result.current.phase).toBe("ready");

    await act(async () => {
        inline.result.current.setGrind({grindSize: 7, rpm: 140});
    });

    const full = await renderHook(() => {
        const {controls, snapshot} = useMachineControls(s.controls);
        return useMachineTool(identity, "grind", controls, snapshot);
    });
    expect(full.result.current.grind).toEqual({grindSize: 7, rpm: 140});

    await act(async () => {
        await full.result.current.setGrind({grindSize: 8, rpm: 160});
    });
    expect(inline.result.current.grind).toEqual({grindSize: 8, rpm: 160});

    // Different machine identity never inherits prior machine drafts.
    const other = await renderHook(() => {
        const {controls, snapshot} = useMachineControls(s.controls);
        return useMachineTool({deviceId: "other-id", serial: "other-serial"}, "grind", controls, snapshot);
    });
    expect(other.result.current.grind).toBeNull();
    s.controls.dispose();
});

it("records genuine in-session scale samples up to 12 points and clears on exit", async () => {
    const s = await controlFixture();
    let token: Planned | undefined;
    s.respond((item) => {
        if (item.command.kind === "enter") token = item;
        s.accept(item);
    });
    const hook = await renderHook(() => {
        const {controls, snapshot} = useMachineControls(s.controls);
        return useMachineTool(identity, "scale", controls, snapshot);
    });
    await waitFor(() => expect(hook.result.current.phase).toBe("ready"));
    expect(hook.result.current.scaleSamples).toEqual([]);

    for (let i = 1; i <= 14; i += 1) {
        await act(async () => {
            s.feedback(token!, {kind: "cup", grams: i * 1.1});
            await flushControls();
        });
    }
    expect(hook.result.current.scaleSamples).toHaveLength(12);
    expect(hook.result.current.scaleSamples[0]).toBe(3.3);
    expect(hook.result.current.scaleSamples[11]).toBe(15.4);

    await act(async () => {
        await s.controls.close();
        await flushControls();
    });
    expect(hook.result.current.scaleSamples).toEqual([]);
    s.controls.dispose();
});
