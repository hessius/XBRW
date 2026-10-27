import React from "react";
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

jest.mock("react-native-ble-manager", () => ({__esModule: true, default: {}}));
jest.mock("@/components/XbrwToast", () => ({notify: jest.fn()}));
jest.mock("@/hooks/useSetting", () => jest.requireActual("@/test-utils/settingsMock").settingsMock());
jest.mock("@/hooks/useSavedMachines", () => ({
    useSavedMachines: () => ({machines: mockMachines})
}));
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
    function feedback(item: Sent, value: ControlFeedback["value"]) {
        const key = ++next;
        responses.set(key, {...item.tokens, value});
        radio.emit(notification(0xFE, 0xFE, [key & 255, key >> 8]));
    }
    const controls = new MachineControls(machine, options.production ? {} : {qualifications: [{
        profile: profile(options.scale),
        protocol: {
            actualWaterSource: () => "tank",
            plan: (command, tokens) => {
                sent.push({command, tokens});
                return {frame: buildType1(60001, [tokens.session, tokens.transaction]), deadlineMs: 100};
            },
            decode: frame => frame[3] === 0xFE && frame[4] === 0xFE
                ? responses.get(frame[10] | frame[11] << 8) ?? null : null
        }
    }]});
    owners.push(controls);
    const accept = (item: Sent) => {
        switch (item.command.kind) {
            case "enter": feedback(item, {kind: "ready"}); break;
            case "exit": feedback(item, {kind: "closed"}); break;
            case "grind": case "pour": feedback(item, {kind: "running"}); break;
            case "stop": feedback(item, {kind: "terminal"}); break;
            case "tare": feedback(item, {kind: "tared"}); break;
        }
    };
    let respond = accept;
    radio.syntheticWrite = frame => {
        if ((frame[3] | frame[4] << 8) === 60001) respond(sent[sent.length - 1]);
    };
    return {controls, radio, machine, recovery, sent, feedback, accept,
        respond: (handler: typeof respond) => { respond = handler; }};
}
beforeEach(() => {
    mockParams = {machineId: identity.deviceId, tool: "grind"};
    mockMachines = [{...saved}];
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
