import React from "react";
import {Text} from "react-native";
import {act, fireEvent, screen, waitFor} from "@testing-library/react-native";
import {renderWithProviders, SHEET_PRESS_TIMEOUT} from "@/test-utils/render";
import MachineToolScreen from "@/app/machineTool";
import Machine from "@/library/machine/Machine";
import MachineControls from "@/library/machine/MachineControls";
import {ControlRecoveryStore} from "@/library/machine/controlRecovery";
import type {ControlCapabilityProfile} from "@/library/machine/controlCapabilities";
import type {ControlCommand, ControlFeedback, ControlTokens} from "@/library/machine/controlProtocol";
import type {SavedMachine} from "@/library/machine/savedMachines";
import {buildType1, MACHINE_STATE} from "@/library/machine/protocol";
import {FakeTransport, machineInfoFrame} from "@/library/machine/__tests__/FakeTransport";
import {notification, status} from "@/library/machine/__tests__/protocolFixtures";
import {flushControls} from "@/hooks/__tests__/machineControlFixture";
import {openLink} from "@/hooks/useMachine";
import {performLiveBrewBarAction, requestLiveBrewBarNavigation, useLiveBrewBarCovered} from "@/hooks/useLiveBrewBarGuard";
import type {BluetoothPermissionResult} from "@/library/machine/Transport";

jest.mock("react-native-ble-manager", () => ({__esModule: true, default: {}}));
jest.mock("@/components/XbrwToast", () => ({notify: jest.fn()}));
jest.mock("@/hooks/useSetting", () => jest.requireActual("@/test-utils/settingsMock").settingsMock());
jest.mock("@/hooks/useSavedMachines", () => ({
    useSavedMachines: () => ({machines: mockMachines})
}));
jest.mock("@/hooks/useLiveBrew", () => ({useLiveBrew: () => ({ratingNoteOpen: mockRatingOpen})}));
jest.mock("@/hooks/steadyRouter", () => ({__esModule: true, default: {back: () => mockBack()}}));
jest.mock("expo-router", () => ({
    useLocalSearchParams: () => mockParams,
    useNavigation: () => ({dispatch: mockDispatch})
}));
jest.mock("expo-router/react-navigation", () => ({
    useIsFocused: () => true,
    usePreventRemove: (prevent: boolean, callback: Prevention) => { mockPrevention = {prevent, callback}; }
}));

type Prevention = (event: {data: {action: {type: string}}}) => void;
let mockPrevention: {prevent: boolean; callback: Prevention};
let mockParams: {machineId?: string | string[]; tool?: string | string[]};
let mockMachines: SavedMachine[];
let mockRatingOpen: boolean;
const mockBack = jest.fn();
const mockDispatch = jest.fn();
const identity = {deviceId: "route-test", serial: "route-serial"};
const saved: SavedMachine = {
    id: identity.deviceId, serial: identity.serial, label: "Kitchen", model: "studio",
    modelString: "synthetic", advertisedName: "Test machine"
};
const owners: MachineControls[] = [];

// Synthetic scope, protocol and limits only: none qualify a real machine.
function profile(scale = true): ControlCapabilityProfile {
    return {
        id: "route-only", models: ["test"], firmwares: ["test"], serials: [identity.serial], scale,
        grind: {grindSize: {min: 1, max: 10, step: 1}, rpm: {min: 100, max: 200, step: 10}},
        pour: {
            temperatureC: {min: 40, max: 90, step: 1}, flowMlPerSecond: {min: 1, max: 4, step: 1},
            volumeMl: {min: 10, max: 100, step: 10}, modes: ["target", "continuous"],
            patterns: ["centered", "circular", "spiral"]
        },
        settings: {}
    };
}
type Sent = {command: ControlCommand; tokens: ControlTokens};
class Radio extends FakeTransport {
    get connectedDeviceId() { return this.connectedTo; }
}
async function fixture(options: {production?: boolean; scale?: boolean} = {}) {
    const radio = new Radio();
    radio.infoReply = machineInfoFrame({serial: identity.serial, model: "test", firmware: "test"});
    let raw = "";
    const recovery = new ControlRecoveryStore({read: () => raw, write: next => { raw = next; }});
    const machine = new Machine(radio, {frameGapMs: 0});
    machine.installControlRecovery(recovery);
    await machine.connect(identity.deviceId);
    radio.emit(status(MACHINE_STATE.IDLE));
    const sent: Sent[] = [];
    const responses = new Map<number, ControlFeedback>();
    let next = 0;
    const store = {
        rememberedId: () => "another-selected-machine",
        rememberId: jest.fn(), recordMachine: jest.fn(() => false), recordSerial: jest.fn()
    };
    const permission = jest.fn(async (): Promise<BluetoothPermissionResult> => ({granted: true}));
    const reconnect = jest.fn((target: string, check: () => void) =>
        openLink(machine, store, permission, {target, check, delays: [0]}));
    function feedback(item: Sent, value: ControlFeedback["value"]) {
        const key = ++next;
        responses.set(key, {...item.tokens, value});
        radio.emit(notification(0xFE, 0xFE, [key & 255, key >> 8]));
    }
    const controls = new MachineControls(machine, {reconnect, ...(options.production ? {} : {qualifications: [{
        profile: profile(options.scale),
        protocol: {
            actualWaterSource: () => "tank",
            plan: (command, tokens) => {
                sent.push({command, tokens});
                if (command.kind === "inspect") return {frame: null, refreshInfo: true, deadlineMs: 100};
                return {frame: buildType1(60001, [tokens.session, tokens.transaction]), deadlineMs: 100};
            },
            decode: frame => frame[3] === 0xFE && frame[4] === 0xFE
                ? responses.get(frame[10] | frame[11] << 8) ?? null : null
        }
    }]})});
    owners.push(controls);
    const accept = (item: Sent) => {
        switch (item.command.kind) {
            case "enter": feedback(item, {kind: "ready"}); break;
            case "exit": feedback(item, {kind: "closed"}); break;
            case "grind": case "pour": feedback(item, {kind: "running"}); break;
            case "stop": feedback(item, {kind: "terminal"}); break;
            case "tare": feedback(item, {kind: "tared"}); break;
            case "inspect": feedback(item, {kind: "active"}); break;
        }
    };
    let respond = accept;
    radio.syntheticWrite = frame => {
        const code = frame[3] | frame[4] << 8;
        const item = sent[sent.length - 1];
        if (code === 60001 || (code === 8100 && item?.command.kind === "inspect")) respond(item);
    };
    return {controls, radio, machine, recovery, sent, feedback, accept, reconnect, store, permission,
        respond: (handler: typeof respond) => { respond = handler; }};
}
beforeEach(() => {
    mockParams = {machineId: identity.deviceId, tool: "grind"};
    mockMachines = [{...saved}];
    mockRatingOpen = false;
    mockBack.mockClear();
    mockDispatch.mockClear();
});
afterEach(() => { owners.splice(0).forEach(owner => owner.dispose()); });

async function press(label: string) {
    await fireEvent.press(screen.getByRole("button", {name: label}));
    await act(flushControls);
}
async function prepare(tool: "grind" | "scale" | "pour" = "grind") {
    const s = await fixture();
    mockParams.tool = tool;
    const view = await renderWithProviders(<MachineToolScreen controls={s.controls}/>);
    await press("Open tool");
    await waitFor(() => expect(s.controls.getSnapshot().phase).toBe("ready"));
    return {...s, view};
}

function BarCoverage() {
    const covered = useLiveBrewBarCovered();
    return <Text>{covered ? "bar covered" : "bar available"}</Text>;
}

it.each([true, false])("covers the %s-valid host for a global rating sheet, without covering the bar itself", async valid => {
    const s = await fixture({production: true});
    if (!valid) mockParams.tool = "invalid";
    const contentId = valid ? "machine-tool-content" : "machine-tool-invalid";
    const tree = () => <><MachineToolScreen controls={s.controls}/><BarCoverage/></>;
    const view = await renderWithProviders(tree());
    expect(screen.getByRole("button", {name: "Back"})).toBeVisible();
    mockRatingOpen = true;
    await view.rerender(tree());
    expect(screen.getByTestId(contentId, {includeHiddenElements: true})).toHaveProp("accessibilityElementsHidden", true);
    expect(screen.getByTestId(contentId, {includeHiddenElements: true})).toHaveProp("importantForAccessibility", "no-hide-descendants");
    expect(screen.queryByRole("button", {name: "Back"})).toBeNull();
    expect(screen.getByText("bar available")).toBeTruthy();
    mockRatingOpen = false;
    await view.rerender(tree());
    expect(screen.getByTestId(contentId)).toHaveProp("accessibilityElementsHidden", false);
    expect(screen.getByTestId(contentId)).toHaveProp("importantForAccessibility", "auto");
    await press("Back");
    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(s.sent).toEqual([]);
});

it.each(["grind", "pour"] as const)("reconnects a foreground-dropped %s only to inspect and Stop, without AppState changes", async tool => {
    const s = await prepare(tool);
    await press("Choose editable proposal");
    await press("Start");
    const marker = s.recovery.snapshot.marker;
    const connect = jest.spyOn(s.machine, "connect");
    await act(async () => s.radio.drop());
    expect(s.controls.getSnapshot().phase).toBe("unknown");
    expect(screen.getByRole("button", {name: "Stop"})).toBeDisabled();
    expect(mockPrevention.prevent).toBe(true);
    await press("Reconnect named machine");
    expect(connect).toHaveBeenCalledTimes(1);
    expect(connect).toHaveBeenCalledWith(identity.deviceId);
    expect(s.radio.scans).toEqual([]);
    expect(s.store.rememberId).not.toHaveBeenCalled();
    expect(s.store.recordMachine).not.toHaveBeenCalled();
    expect(s.store.recordSerial).not.toHaveBeenCalled();
    expect(s.recovery.snapshot.marker).toBe(marker);
    expect(s.controls.getSnapshot().phase).toBe("unknown");
    expect(screen.getByRole("button", {name: "Stop"})).toBeEnabled();
    expect(screen.queryByRole("button", {name: "Start"})).toBeNull();
    expect(s.sent.map(item => item.command.kind)).toEqual(["enter", tool, "inspect"]);
    await press("Back");
    expect(mockBack).not.toHaveBeenCalled();
    await waitFor(async () => {
        await fireEvent.press(screen.getByRole("button", {name: "Stop and leave"}));
        expect(mockBack).toHaveBeenCalledTimes(1);
    }, {timeout: SHEET_PRESS_TIMEOUT});
    expect(s.controls.getSnapshot().phase).toBe("closed");
    expect(s.recovery.snapshot.marker).toBeNull();
    expect(s.sent.map(item => item.command.kind)).toEqual(["enter", tool, "inspect", "stop"]);
});

it("closes foreground recovery only on qualified terminal inspection, not on the reconnected link", async () => {
    const s = await prepare();
    await press("Choose editable proposal");
    await press("Start");
    await act(async () => s.radio.drop());
    s.respond(item => {
        if (item.command.kind === "inspect") s.feedback(item, {kind: "terminal"});
        else s.accept(item);
    });
    await press("Reconnect named machine");
    expect(s.controls.getSnapshot().phase).toBe("closed");
    expect(s.recovery.snapshot.marker).toBeNull();
    expect(s.sent.map(item => item.command.kind)).toEqual(["enter", "grind", "inspect"]);
    expect(mockPrevention.prevent).toBe(false);
});

it.each(["enter", "ready", "tare"] as const)("reconnects a foreground-dropped Scale during %s without replay or motor markers", async operation => {
    const s = await fixture();
    mockParams.tool = "scale";
    s.respond(() => {});
    await renderWithProviders(<><MachineToolScreen controls={s.controls}/><BarCoverage/></>);
    if (operation !== "enter") {
        s.respond(s.accept);
        await press("Open tool");
        if (operation === "tare") {
            s.respond(() => {});
            await press("Tare");
        }
    } else await press("Open tool");
    expect(screen.getByRole("button", {name: "Back"})).toBeVisible();
    expect(screen.getByTestId("machine-tool-content")).toHaveProp("accessibilityElementsHidden", false);
    expect(screen.getByTestId("machine-tool-content")).toHaveProp("importantForAccessibility", "auto");
    expect(screen.getByText(operation === "ready" ? "bar available" : "bar covered")).toBeTruthy();
    if (operation !== "ready") {
        const navigate = jest.fn();
        performLiveBrewBarAction(navigate);
        requestLiveBrewBarNavigation(navigate);
        expect(navigate).not.toHaveBeenCalled();
        expect(mockPrevention.prevent).toBe(true);
    }
    if (operation === "tare") expect(screen.getByText("Taring…")).toBeTruthy();
    if (operation === "enter") expect(screen.getByText("Opening tool…")).toBeTruthy();
    const before = s.sent.map(item => item.command.kind);
    await act(async () => s.radio.drop());
    expect(s.controls.getSnapshot().phase).toBe("unknown");
    expect(s.machine.controlBlocker).not.toBeNull();
    expect(s.recovery.snapshot.marker).toBeNull();
    s.respond(item => {
        expect(item.command).toEqual({kind: "inspect", tool: "scale", recovery: true});
        expect(s.machine.controlBlocker).not.toBeNull();
        s.feedback(item, {kind: "closed"});
    });
    await press("Reconnect named machine");
    expect(s.sent.map(item => item.command.kind)).toEqual([...before, "inspect"]);
    expect(s.controls.getSnapshot().phase).toBe("closed");
    expect(s.machine.controlBlocker).toBeNull();
    expect(s.recovery.snapshot.marker).toBeNull();
    expect(s.store.rememberId).not.toHaveBeenCalled();
});

it.each(["failure", "device", "serial"] as const)("keeps a nonmoving Scale lease on reconnect %s", async mismatch => {
    const s = await prepare("scale");
    await act(async () => s.radio.drop());
    if (mismatch === "failure") s.radio.failConnect = new Error("Scale radio unavailable.");
    else if (mismatch === "serial") s.radio.infoReply = machineInfoFrame({serial: "wrong", model: "test", firmware: "test"});
    else jest.spyOn(s.radio, "connect").mockImplementationOnce(async () => { s.radio.connectedTo = "wrong"; });
    await press("Reconnect named machine");
    expect(screen.getByText(mismatch === "failure" ? "Scale radio unavailable."
        : "Reconnect requires the exact connected device and saved serial.")).toBeTruthy();
    expect(s.sent.map(item => item.command.kind)).toEqual(["enter"]);
    expect(s.controls.getSnapshot().phase).toBe("unknown");
    expect(s.machine.controlBlocker).not.toBeNull();
    expect(s.recovery.snapshot.marker).toBeNull();
});

it("keeps a failed reconnect guarded and retryable on the owning route", async () => {
    const s = await prepare();
    await press("Choose editable proposal");
    await press("Start");
    await act(async () => s.radio.drop());
    const marker = s.recovery.snapshot.marker;
    s.radio.failConnect = new Error("Radio unavailable for this machine.");
    await press("Reconnect named machine");
    expect(screen.getByText("Radio unavailable for this machine.")).toBeTruthy();
    expect(s.recovery.snapshot.marker).toBe(marker);
    expect(s.sent.map(item => item.command.kind)).toEqual(["enter", "grind"]);
    await press("Back");
    await waitFor(async () => {
        await fireEvent.press(screen.getByRole("button", {name: "Stop and leave"}));
        expect(screen.getByText("The control context needs reconciliation.")).toBeTruthy();
    }, {timeout: SHEET_PRESS_TIMEOUT});
    expect(mockBack).not.toHaveBeenCalled();
    expect(s.recovery.snapshot.marker).toBe(marker);
    await waitFor(async () => {
        await fireEvent.press(screen.getByRole("button", {name: "Stay"}));
        expect(screen.getByRole("button", {name: "Reconnect named machine"})).toBeEnabled();
    }, {timeout: SHEET_PRESS_TIMEOUT});
    s.radio.failConnect = null;
    await press("Reconnect named machine");
    expect(screen.getByRole("button", {name: "Stop"})).toBeEnabled();
    expect(s.recovery.snapshot.marker).toBe(marker);
});

it.each(["device", "serial", "tool"] as const)("rejects an owned reconnect for the wrong %s without connecting or sending", async mismatch => {
    const s = await prepare();
    await press("Choose editable proposal");
    await press("Start");
    await act(async () => s.radio.drop());
    const connect = jest.spyOn(s.machine, "connect");
    const marker = s.recovery.snapshot.marker;
    await expect(s.controls.reconnectTool({
        deviceId: mismatch === "device" ? "another-device" : identity.deviceId,
        serial: mismatch === "serial" ? "another-serial" : identity.serial
    }, mismatch === "tool" ? "pour" : "grind")).rejects.toThrow("exact retained tool owner");
    expect(connect).not.toHaveBeenCalled();
    expect(s.sent.map(item => item.command.kind)).toEqual(["enter", "grind"]);
    expect(s.recovery.snapshot.marker).toBe(marker);
});

it.each(["device", "serial"] as const)("never inspects or stops a reconnect reporting the wrong %s", async mismatch => {
    const s = await prepare();
    await press("Choose editable proposal");
    await press("Start");
    await act(async () => s.radio.drop());
    const marker = s.recovery.snapshot.marker;
    if (mismatch === "serial") {
        s.radio.infoReply = machineInfoFrame({serial: "another-serial", model: "test", firmware: "test"});
    } else {
        jest.spyOn(s.radio, "connect").mockImplementationOnce(async () => { s.radio.connectedTo = "another-device"; });
    }
    await press("Reconnect named machine");
    expect(screen.getByText("Reconnect requires the exact connected device and saved serial.")).toBeTruthy();
    expect(s.sent.map(item => item.command.kind)).toEqual(["enter", "grind"]);
    expect(s.radio.scans).toEqual([]);
    expect(s.recovery.snapshot.marker).toBe(marker);
    expect(mockPrevention.prevent).toBe(true);
    expect(screen.getByRole("button", {name: "Stop"})).toBeDisabled();
    expect(screen.queryByRole("button", {name: "Start"})).toBeNull();
});

it("coalesces repeated reconnects and waits for a cancelled native Start write before connecting", async () => {
    const s = await prepare();
    await press("Choose editable proposal");
    let settle!: () => void;
    const nativeWrite = new Promise<void>(resolve => { settle = resolve; });
    s.radio.syntheticWrite = async frame => {
        if ((frame[3] | frame[4] << 8) === 60001 && s.sent.at(-1)?.command.kind === "grind") {
            await nativeWrite;
        } else if ((frame[3] | frame[4] << 8) === 8100 && s.sent.at(-1)?.command.kind === "inspect") {
            s.feedback(s.sent.at(-1)!, {kind: "active"});
        }
    };
    await press("Start");
    await act(async () => s.radio.drop());
    const marker = s.recovery.snapshot.marker;
    const connect = jest.spyOn(s.machine, "connect");
    const first = s.controls.reconnectTool(identity, "grind");
    const repeated = s.controls.reconnectTool(identity, "grind");
    expect(repeated).toBe(first);
    await act(flushControls);
    expect(connect).not.toHaveBeenCalled();
    expect(s.recovery.snapshot.marker).toBe(marker);
    await act(async () => { settle(); await first; });
    expect(connect).toHaveBeenCalledTimes(1);
    expect(connect).toHaveBeenCalledWith(identity.deviceId);
    expect(s.sent.map(item => item.command.kind)).toEqual(["enter", "grind", "inspect"]);
    expect(s.recovery.snapshot.marker).toBe(marker);
});

it("waits for a cancelled native Tare before nonmoving reconnect and rejects stale proof", async () => {
    const s = await prepare("scale");
    let settle!: () => void;
    const nativeWrite = new Promise<void>(resolve => { settle = resolve; });
    s.radio.syntheticWrite = async frame => {
        const code = frame[3] | frame[4] << 8;
        if (code === 60001 && s.sent.at(-1)?.command.kind === "tare") await nativeWrite;
    };
    await press("Tare");
    const tare = s.sent.at(-1)!;
    await act(async () => s.radio.drop());
    const connect = jest.spyOn(s.machine, "connect");
    const reconnect = s.controls.reconnectTool(identity, "scale");
    expect(s.controls.reconnectTool(identity, "scale")).toBe(reconnect);
    await act(flushControls);
    expect(connect).not.toHaveBeenCalled();
    s.radio.syntheticWrite = frame => {
        if ((frame[3] | frame[4] << 8) === 8100 && s.sent.at(-1)?.command.kind === "inspect") {
            s.feedback(tare, {kind: "closed"});
            expect(s.machine.controlBlocker).not.toBeNull();
            expect(s.controls.getSnapshot().phase).toBe("unknown");
            s.feedback(s.sent.at(-1)!, {kind: "closed"});
        }
    };
    await act(async () => { settle(); await reconnect; });
    expect(connect).toHaveBeenCalledTimes(1);
    expect(s.sent.map(item => item.command.kind)).toEqual(["enter", "tare", "inspect"]);
    expect(s.controls.getSnapshot().phase).toBe("closed");
    expect(s.machine.controlBlocker).toBeNull();
    expect(s.recovery.snapshot.marker).toBeNull();
});

it("rejects a superseding connection generation without inspecting or clearing recovery", async () => {
    const s = await prepare();
    await press("Choose editable proposal");
    await press("Start");
    await act(async () => s.radio.drop());
    const marker = s.recovery.snapshot.marker;
    let settle!: () => void;
    const nativeConnect = new Promise<void>(resolve => { settle = resolve; });
    const connect = s.radio.connect.bind(s.radio);
    jest.spyOn(s.radio, "connect").mockImplementationOnce(async target => {
        await nativeConnect;
        await connect(target);
    });
    const reconnect = s.controls.reconnectTool(identity, "grind");
    const rejected = expect(reconnect).rejects.toThrow("superseded");
    await act(flushControls);
    await act(async () => {
        await s.machine.connect(identity.deviceId);
        settle();
        await rejected;
    });
    expect(s.sent.map(item => item.command.kind)).toEqual(["enter", "grind"]);
    expect(s.recovery.snapshot.marker).toBe(marker);
});

it.each(["permission", "connection"] as const)("rejects disposal during reconnect %s without qualified control sends", async stage => {
    const s = await prepare();
    await press("Choose editable proposal");
    await press("Start");
    await act(async () => s.radio.drop());
    const marker = s.recovery.snapshot.marker;
    let settle!: () => void;
    const pending = new Promise<void>(resolve => { settle = resolve; });
    if (stage === "permission") {
        s.permission.mockImplementationOnce(async () => { await pending; return {granted: true}; });
    } else {
        const connect = s.radio.connect.bind(s.radio);
        jest.spyOn(s.radio, "connect").mockImplementationOnce(async target => {
            await pending;
            await connect(target);
        });
    }
    const connect = jest.spyOn(s.machine, "connect");
    const reconnect = s.controls.reconnectTool(identity, "grind");
    const rejected = expect(reconnect).rejects.toThrow("exact retained tool owner");
    await act(flushControls);
    s.controls.dispose();
    await act(async () => { settle(); await rejected; });
    expect(connect).toHaveBeenCalledTimes(stage === "permission" ? 0 : 1);
    expect(s.sent.map(item => item.command.kind)).toEqual(["enter", "grind"]);
    expect(s.recovery.snapshot.marker).toBe(marker);
});

it("never reconnects around a malformed persisted recovery marker", async () => {
    const machine = new Machine(new Radio(), {frameGapMs: 0});
    const recovery = new ControlRecoveryStore({read: () => "{\"version\":99}", write: jest.fn()});
    machine.installControlRecovery(recovery);
    const reconnect = jest.fn();
    const controls = new MachineControls(machine, {reconnect});
    owners.push(controls);
    await expect(controls.reconnectTool(identity, "grind")).rejects.toThrow("exact retained tool owner");
    expect(reconnect).not.toHaveBeenCalled();
    expect(recovery.snapshot.error).not.toBeNull();
});

it.each([
    {}, {machineId: identity.deviceId}, {tool: "grind"}, {machineId: "unknown", tool: "grind"},
    {machineId: [identity.deviceId], tool: "grind"}, {machineId: identity.deviceId, tool: ["grind"]},
    {machineId: identity.deviceId, tool: "settings"}
])("rejects malformed or unknown route params without opening a controller: %j", async params => {
    const s = await fixture();
    mockParams = params;
    const open = jest.spyOn(s.controls, "open");
    await renderWithProviders(<MachineToolScreen controls={s.controls}/>);
    expect(screen.getByText(/Invalid machine tool link/)).toBeTruthy();
    expect(open).not.toHaveBeenCalled();
    expect(s.sent).toEqual([]);
    expect(s.recovery.snapshot.marker).toBeNull();
    await press("Back");
    expect(mockBack).toHaveBeenCalledTimes(1);
});

it.each(["grind", "scale", "pour"] as const)("selects the qualified %s instrument without starting on entry or remount", async tool => {
    const s = await fixture();
    mockParams.tool = tool;
    let view = await renderWithProviders(<MachineToolScreen controls={s.controls}/>);
    expect(s.sent).toEqual([]);
    await press("Open tool");
    expect(s.controls.getSnapshot()).toMatchObject({phase: "ready", tool, identity});
    if (tool === "grind") expect(screen.getByLabelText("SELECTED SIZE: Unavailable")).toBeTruthy();
    if (tool === "pour") expect(screen.getByLabelText("SETPOINT: Unavailable")).toBeTruthy();
    if (tool === "scale") expect(screen.getByLabelText("WEIGHT: Unavailable")).toBeTruthy();
    await view.unmount();
    view = await renderWithProviders(<MachineToolScreen controls={s.controls}/>);
    expect(s.sent.map(item => item.command.kind)).toEqual(["enter"]);
    expect(s.recovery.snapshot.marker).toBeNull();
    await view.unmount();
    expect(s.controls.getSnapshot().phase).toBe("ready");
});

it("keeps the production registry unavailable and never infers scale from other qualified tools", async () => {
    const s = await fixture({production: true});
    const view = await renderWithProviders(<MachineToolScreen controls={s.controls}/>);
    expect(screen.getAllByText(/Controls unavailable: unqualified/).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", {name: "Open tool"})).toBeDisabled();
    expect(s.sent).toEqual([]);
    await view.unmount();
    const scale = await fixture({scale: false});
    mockParams.tool = "scale";
    await renderWithProviders(<MachineToolScreen controls={scale.controls}/>);
    expect(screen.getByRole("button", {name: "Open tool"})).toBeDisabled();
    expect(screen.getByRole("button", {name: "Tare"})).toBeDisabled();
    expect(scale.sent).toEqual([]);
});

it("requires a deliberate proposal and Start, preserving the request after Stop without restarting", async () => {
    const s = await prepare();
    expect(screen.getByRole("button", {name: "Start"})).toBeDisabled();
    await press("Choose editable proposal");
    expect(screen.getByText(/editable proposal, not the machine/)).toBeTruthy();
    await press("Start");
    expect(s.controls.getSnapshot()).toMatchObject({phase: "running", grindRequest: {grindSize: 1, rpm: 100}});
    await press("Stop");
    expect(s.controls.getSnapshot()).toMatchObject({phase: "ready", grindRequest: {grindSize: 1, rpm: 100}});
    expect(screen.getByLabelText("SELECTED SIZE: 1")).toBeTruthy();
    await s.view.unmount();
    await renderWithProviders(<MachineToolScreen controls={s.controls}/>);
    expect(screen.getByLabelText("SELECTED SIZE: 1")).toBeTruthy();
    expect(s.sent.map(item => item.command.kind)).toEqual(["enter", "grind", "stop"]);
});

it("binds Tare to the owner without optimistically replacing its last observed weight with zero", async () => {
    const s = await prepare("scale");
    await act(async () => s.feedback(s.sent[0], {kind: "cup", grams: 12}));
    await press("Tare");
    expect(s.sent.map(item => item.command.kind)).toEqual(["enter", "tare"]);
    expect(screen.getByLabelText("WEIGHT: 12 g")).toBeTruthy();
    await act(async () => s.feedback(s.sent[0], {kind: "cup", grams: 0}));
    expect(screen.getByLabelText("WEIGHT: 0 g")).toBeTruthy();
});

it("starts Pour only deliberately and never exposes live mutations from its ordinary pour policy", async () => {
    const s = await prepare("pour");
    await press("Choose editable proposal");
    await press("Start");
    expect(s.controls.getSnapshot().phase).toBe("running");
    const run = s.sent.find(item => item.command.kind === "pour")!;
    await act(async () => s.feedback(run, {kind: "dispensed", ml: 7}));
    expect(screen.getByLabelText("DISPENSED: 7 ml")).toBeTruthy();
    expect(screen.getByText("Live temperature control is not qualified.")).toBeTruthy();
    expect(screen.getByText("Live pattern control is not qualified.")).toBeTruthy();
    expect(screen.queryByLabelText("Increase Setpoint")).toBeNull();
    expect(screen.queryByRole("button", {name: "Circular"})).toBeNull();
    await act(async () => {
        s.radio.emit(machineInfoFrame({serial: identity.serial, model: "test", firmware: "test", waterEnough: 0}));
    });
    expect(screen.getByRole("button", {name: "Stop"})).toBeEnabled();
    await press("Stop");
    expect(s.sent.map(item => item.command.kind)).toEqual(["enter", "pour", "stop"]);
    expect(screen.getByLabelText("TARGET VOLUME: 10 ml")).toBeTruthy();
});

it("does not reserve, switch or connect to a different target or serial", async () => {
    const s = await fixture();
    const connect = jest.spyOn(s.machine, "connect");
    mockMachines[0].serial = "another-serial";
    const view = await renderWithProviders(<MachineToolScreen controls={s.controls}/>);
    expect(screen.getByRole("button", {name: "Open tool"})).toBeDisabled();
    expect(connect).not.toHaveBeenCalled();
    expect(s.sent).toEqual([]);
    await view.unmount();
    mockMachines = [{...saved, id: "other-device"}];
    mockParams.machineId = "other-device";
    await renderWithProviders(<MachineToolScreen controls={s.controls}/>);
    expect(screen.getByRole("button", {name: "Open tool"})).toBeDisabled();
    expect(connect).not.toHaveBeenCalled();
    expect(s.recovery.snapshot.marker).toBeNull();
});

it.each(["device", "serial", "generation"] as const)("hides stale scale telemetry and prevents Tare after a %s change", async change => {
    const s = await prepare("scale");
    await act(async () => s.feedback(s.sent[0], {kind: "cup", grams: 123}));
    expect(screen.getByLabelText("WEIGHT: 123 g")).toBeTruthy();
    const before = s.sent.length;
    await act(async () => {
        if (change === "serial") {
            s.radio.emit(machineInfoFrame({serial: "changed-id", model: "test", firmware: "test"}));
        } else {
            s.radio.drop();
            await s.machine.connect(change === "device" ? "other-device" : identity.deviceId);
            s.radio.emit(status(MACHINE_STATE.IDLE));
        }
    });
    expect(screen.queryByLabelText("WEIGHT: 123 g")).toBeNull();
    expect(screen.getByLabelText("WEIGHT: Unavailable")).toBeTruthy();
    expect(screen.getByRole("button", {name: "Tare"})).toBeDisabled();
    expect(s.sent).toHaveLength(before);
});

it("renders failed entry explicitly without treating transport completion as success", async () => {
    const s = await fixture();
    s.respond(() => {});
    await renderWithProviders(<MachineToolScreen controls={s.controls}/>);
    await press("Open tool");
    await waitFor(() => expect(screen.getAllByText("Qualified control response missing.").length).toBeGreaterThan(0));
    expect(s.controls.getSnapshot().phase).toBe("unknown");
    expect(screen.queryByRole("button", {name: "Start"})).toBeNull();
    expect(s.recovery.snapshot.marker).toBeNull();
});

it("covers the underlying content on both accessibility platforms while Stop and leave awaits proof; Stay never cancels Stop", async () => {
    const s = await prepare();
    await press("Choose editable proposal");
    await press("Start");
    let stop: Sent | undefined;
    s.respond(item => { if (item.command.kind === "stop") stop = item; });
    await press("Back");
    expect(mockBack).not.toHaveBeenCalled();
    const content = screen.getByTestId("machine-tool-content", {includeHiddenElements: true});
    expect(content).toHaveProp("accessibilityElementsHidden", true);
    expect(content).toHaveProp("importantForAccessibility", "no-hide-descendants");
    await waitFor(async () => {
        await fireEvent.press(screen.getByRole("button", {name: "Stop and leave"}));
        expect(s.controls.getSnapshot().phase).toBe("stopping");
    }, {timeout: SHEET_PRESS_TIMEOUT});
    await waitFor(async () => {
        await fireEvent.press(screen.getByRole("button", {name: "Stay"}));
        expect(screen.getByTestId("machine-tool-content")).toHaveProp("accessibilityElementsHidden", false);
    }, {timeout: SHEET_PRESS_TIMEOUT});
    await act(async () => { s.feedback(stop!, {kind: "terminal"}); await flushControls(); });
    expect(s.controls.getSnapshot().phase).toBe("ready");
    expect(mockBack).not.toHaveBeenCalled();
    expect(s.sent.filter(item => item.command.kind === "stop")).toHaveLength(1);
    expect(s.sent.filter(item => item.command.kind === "exit")).toHaveLength(0);
    expect(mockPrevention.prevent).toBe(true);
});
