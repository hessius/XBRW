import React from "react";
import {act, fireEvent, screen, waitFor, within} from "@testing-library/react-native";
import MachineHomeScreen from "@/app/machineHome";
import MachinePanel from "@/components/MachinePanel";
import {palette} from "@/constants/colors";
import {useSavedMachines as mockUseSavedMachines} from "@/hooks/useSavedMachines";
import {sharedSettings} from "@/hooks/useSetting";
import {notify} from "@/components/XbrwToast";
import {activateSavedMachine} from "@/library/machine/savedMachineSettings";
import {serialiseSavedMachines, type SavedMachine} from "@/library/machine/savedMachines";
import type MachineControls from "@/library/machine/MachineControls";
import type Machine from "@/library/machine/Machine";
import {machineInfoFrame} from "@/library/machine/__tests__/FakeTransport";
import {machineSettingsFixture, settingIdentity} from "@/test-utils/machineSettings";
import {renderWithProviders, SHEET_PRESS_TIMEOUT} from "@/test-utils/render";

jest.mock("react-native-ble-manager", () => ({__esModule: true, default: {}}));
jest.mock("@/components/XbrwToast", () => ({notify: jest.fn()}));
jest.mock("@/hooks/useSetting", () => jest.requireActual("@/test-utils/settingsMock").settingsMock());
jest.mock("expo-router", () => ({useLocalSearchParams: () => mockParams}));
jest.mock("@/hooks/steadyRouter", () => ({
    __esModule: true, default: {push: (...args: unknown[]) => mockPush(...args), back: () => mockBack()}
}));
jest.mock("@/hooks/useLiveBrew", () => ({useLiveBrew: () => ({ratingNoteOpen: mockRatingOpen})}));
jest.mock("@/hooks/useMachine", () => ({
    ...jest.requireActual("@/hooks/useMachine"),
    useMachine: () => {
        const {machines, activeId} = mockUseSavedMachines();
        return {
            machine: mockMachine, machines, remembered: activeId, status: mockStatus,
            changeBlocker: mockBlocker, choose: mockChoose, forgetMachine: mockForget
        };
    }
}));

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockChoose = jest.fn(async (id: string) => {
    activateSavedMachine(sharedSettings(), id);
});
const mockForget = jest.fn(async (_id: string) => true);
let mockParams: {machineId?: string | string[]};
let mockMachine: Machine;
let mockStatus: "connected" | "disconnected" | "connecting";
let mockBlocker: string | null;
let mockRatingOpen: boolean;
const kitchen: SavedMachine = {
    id: settingIdentity.deviceId, serial: settingIdentity.serial, label: "Kitchen", model: "studio",
    modelString: "test", advertisedName: "Test machine"
};
const work: SavedMachine = {
    id: "work", serial: "J20-work", label: "Work", model: "original",
    modelString: "", advertisedName: "", colour: 2
};
const owners: MachineControls[] = [];

function save(entries = [kitchen, work], activeId = kitchen.id) {
    const settings = sharedSettings();
    settings.set("machineDeviceId", activeId);
    settings.set("machineName", "");
    settings.set("machineModelString", "");
    settings.set("savedMachines", serialiseSavedMachines(entries));
}
async function prepare() {
    const s = await machineSettingsFixture({production: true});
    owners.push(s.controls);
    mockMachine = s.machine;
    return s;
}
async function press(name: string | RegExp) {
    await fireEvent.press(screen.getByRole("button", {name}));
}
beforeEach(() => {
    mockParams = {machineId: kitchen.id};
    mockStatus = "connected";
    mockBlocker = null;
    mockRatingOpen = false;
    mockPush.mockClear();
    mockBack.mockClear();
    mockChoose.mockClear();
    mockForget.mockClear();
    jest.mocked(notify).mockClear();
    save();
});
afterEach(() => { owners.splice(0).forEach(owner => owner.dispose()); });

it.each([{}, {machineId: ""}, {machineId: "unknown"}, {machineId: [kitchen.id]}])(
    "rejects invalid machine routes with an explicit Back and no operations: %j", async params => {
        const s = await prepare();
        mockParams = params;
        const mutation = jest.spyOn(sharedSettings(), "set");
        await renderWithProviders(<MachineHomeScreen controls={s.controls}/>);
        expect(screen.getByText(/Invalid machine link/)).toBeTruthy();
        await press("Back");
        expect(mockBack).toHaveBeenCalledTimes(1);
        expect(mockChoose).not.toHaveBeenCalled();
        expect(s.radio.sent).toEqual([]);
        expect(mutation).not.toHaveBeenCalled();
        mutation.mockRestore();
    }
);

it("uses identical explicit destinations from the home panel and machine page, even offline and unsupported", async () => {
    const s = await prepare();
    mockStatus = "disconnected";
    const panel = await renderWithProviders(<MachinePanel open status="disconnected" accent={palette.success}
        vitals={null} now={0} onRefreshWater={async () => false} onConnect={jest.fn()}
        machineId={kitchen.id}/>);
    for (const tool of ["Grind", "Scale", "Pour"]) await press(tool);
    const destinations = mockPush.mock.calls.map(args => args[0]);
    expect(destinations).toEqual(["grind", "scale", "pour"].map(tool => ({
        pathname: "/machineTool", params: {machineId: kitchen.id, tool}
    })));
    await panel.unmount();
    mockPush.mockClear();
    await renderWithProviders(<MachineHomeScreen controls={s.controls}/>);
    for (const tool of ["Grind", "Scale", "Pour"]) await press(tool);
    expect(mockPush.mock.calls.map(args => args[0])).toEqual(destinations);
    expect(screen.getAllByText("Unavailable · missing qualified readback")).toHaveLength(6);
    expect(mockChoose).not.toHaveBeenCalled();
    expect(s.radio.sent).toEqual([]);
});

it("shows the named saved machine, never a different connected machine's identity, and routes all settings explicitly", async () => {
    const s = await prepare();
    mockParams = {machineId: work.id};
    const mutation = jest.spyOn(sharedSettings(), "set");
    const connect = jest.spyOn(s.machine, "connect");
    await renderWithProviders(<MachineHomeScreen controls={s.controls}/>);
    expect(screen.getByText("Work")).toBeTruthy();
    expect(screen.getByText("Reported model: Unavailable")).toBeTruthy();
    expect(screen.getByText("Firmware: Unavailable")).toBeTruthy();
    expect(screen.queryByText(/Firmware: test/)).toBeNull();
    expect(screen.getByRole("button", {name: /^Easy Mode slots/})).toBeDisabled();
    for (const [label, setting] of [
        ["Temperature unit", "temperatureUnit"], ["Weight unit", "weightUnit"],
        ["Brightness", "brightness"], ["Water source", "waterSource"],
        ["Pour radius", "pourRadius"], ["Vibration amplitude", "vibrationAmplitude"]
    ]) {
        await press(new RegExp(`^${label}:`));
        expect(mockPush).toHaveBeenLastCalledWith({
            pathname: "/machineSetting", params: {machineId: work.id, setting}
        });
    }
    expect(screen.getAllByText("Machine settings")).toHaveLength(1);
    expect(screen.getAllByText("Tuning")).toHaveLength(1);
    expect(mockChoose).not.toHaveBeenCalled();
    expect(connect).not.toHaveBeenCalled();
    expect(s.radio.sent).toEqual([]);
    expect(mutation).not.toHaveBeenCalled();
    mutation.mockRestore();
});

it("shows reported facts only for the exact saved identity, not a reused Bluetooth id", async () => {
    const s = await prepare();
    const view = await renderWithProviders(<MachineHomeScreen controls={s.controls}/>);
    expect(screen.getByText("Reported model: test")).toBeTruthy();
    expect(screen.getByText("Firmware: test")).toBeTruthy();
    await act(async () => s.radio.emit(machineInfoFrame({serial: "another-serial", model: "other", firmware: "other"})));
    await view.rerender(<MachineHomeScreen controls={s.controls}/>);
    expect(screen.getByText("Reported model: Unavailable")).toBeTruthy();
    expect(screen.getByText("Firmware: Unavailable")).toBeTruthy();
    expect(screen.getByRole("button", {name: /^Easy Mode slots/})).toBeDisabled();
});

it.each([
    "A brew is running.", "The running brew has lost contact.", "An Easy Mode slot operation is active."
])("retains the active machine when activation is blocked: %s", async blocker => {
    const s = await prepare();
    mockParams = {machineId: work.id};
    mockBlocker = blocker;
    await renderWithProviders(<MachineHomeScreen controls={s.controls}/>);
    expect(screen.getByRole("button", {name: /^Use this machine now/})).toBeDisabled();
    await press(/^Use this machine now/);
    expect(mockChoose).not.toHaveBeenCalled();
    expect(sharedSettings().get("machineDeviceId")).toBe(kitchen.id);
    expect(s.radio.sent).toEqual([]);
});

it("activates only on explicit request using the existing chooser, and reports failures", async () => {
    const s = await prepare();
    mockParams = {machineId: work.id};
    await renderWithProviders(<MachineHomeScreen controls={s.controls}/>);
    expect(sharedSettings().get("machineDeviceId")).toBe(kitchen.id);
    mockChoose.mockImplementationOnce(async id => {
        activateSavedMachine(sharedSettings(), id);
        throw new Error("Not nearby");
    });
    await press(/^Use this machine now/);
    await waitFor(() => expect(notify).toHaveBeenCalledWith({
        tone: "error", message: expect.stringContaining("Not nearby")
    }));
    // The existing chooser keeps an explicit selection even if its radio
    // connection fails, so a retry still targets the requested machine.
    expect(sharedSettings().get("machineDeviceId")).toBe(work.id);
    await press(/^Use this machine now/);
    await waitFor(() => expect(sharedSettings().get("machineDeviceId")).toBe(work.id));
    expect(mockChoose.mock.calls).toEqual([[work.id], [work.id]]);
    expect(sharedSettings().get("machineModel")).toBe("original");
});

it("reuses Manage, name, colour, order and Forget sheets, hiding the whole host for both dialogs", async () => {
    const s = await prepare();
    mockParams = {machineId: work.id};
    await renderWithProviders(<MachineHomeScreen controls={s.controls}/>);
    await press(/^Manage machine/);
    await waitFor(async () => {
        expect(screen.getByLabelText("Machine name")).toBeVisible();
        await fireEvent.changeText(screen.getByLabelText("Machine name"), "Office");
    }, {timeout: SHEET_PRESS_TIMEOUT});
    await fireEvent(screen.getByLabelText("Machine name"), "endEditing");
    expect(screen.getByTestId("machine-home-content", {includeHiddenElements: true}).props)
        .toMatchObject({accessibilityElementsHidden: true, importantForAccessibility: "no-hide-descendants"});
    await press(/^Try this one first/);
    expect(JSON.parse(sharedSettings().get("savedMachines"))[0].id).toBe(work.id);
    await fireEvent.press(screen.getByRole("radio", {name: "Blue"}));
    await waitFor(async () => {
        const forget = screen.queryByRole("button", {name: /^Forget this machine/});
        if (forget) await fireEvent.press(forget);
        expect(screen.getByTestId("forget-machine-keep")).toBeVisible();
    }, {timeout: SHEET_PRESS_TIMEOUT});
    expect(screen.getByTestId("machine-home-content", {includeHiddenElements: true}).props)
        .toMatchObject({accessibilityElementsHidden: true, importantForAccessibility: "no-hide-descendants"});
    await fireEvent.press(screen.getByTestId("forget-machine-keep"));
    await waitFor(() => expect(screen.getByRole("button", {name: /^Manage machine/})).toBeVisible(),
        {timeout: SHEET_PRESS_TIMEOUT});
    expect(mockForget).not.toHaveBeenCalled();
    expect(within(screen.getByTestId("machine-home-content")).getByText("Office")).toBeTruthy();
});

it("sends Forget only after confirmation and covers the page for the global rating dialog too", async () => {
    const s = await prepare();
    const view = await renderWithProviders(<MachineHomeScreen controls={s.controls}/>);
    await press(/^Manage machine/);
    await waitFor(async () => {
        const forget = screen.queryByRole("button", {name: /^Forget this machine/});
        if (forget) await fireEvent.press(forget);
        expect(screen.getByTestId("forget-machine-confirm")).toBeVisible();
    }, {timeout: SHEET_PRESS_TIMEOUT});
    expect(mockForget).not.toHaveBeenCalled();
    await waitFor(async () => {
        await fireEvent.press(screen.getByTestId("forget-machine-confirm"));
        expect(mockForget).toHaveBeenCalledWith(kitchen.id);
    }, {timeout: SHEET_PRESS_TIMEOUT});
    await waitFor(() => expect(screen.getByRole("button", {name: /^Manage machine/})).toBeVisible(),
        {timeout: SHEET_PRESS_TIMEOUT});
    mockRatingOpen = true;
    await view.rerender(<MachineHomeScreen controls={s.controls}/>);
    expect(screen.getByTestId("machine-home-content", {includeHiddenElements: true}).props)
        .toMatchObject({accessibilityElementsHidden: true, importantForAccessibility: "no-hide-descendants"});
});

it("opens the existing Easy Mode only for the selected machine, including a one-machine offline library", async () => {
    const s = await prepare();
    await s.machine.disconnect();
    mockStatus = "disconnected";
    save([kitchen]);
    await renderWithProviders(<MachineHomeScreen controls={s.controls}/>);
    await press(/^Easy Mode slots/);
    expect(mockPush).toHaveBeenCalledWith("/easyMode");
    expect(mockChoose).not.toHaveBeenCalled();
});

it("does not turn a no-saved-machine link into a nearby-machine lookup", async () => {
    const s = await prepare();
    save([], "");
    await renderWithProviders(<MachineHomeScreen controls={s.controls}/>);
    expect(screen.getByText(/Invalid machine link/)).toBeTruthy();
    expect(mockChoose).not.toHaveBeenCalled();
    expect(s.radio.sent).toEqual([]);
});
