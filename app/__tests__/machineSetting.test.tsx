import React from "react";
import {Text} from "react-native";
import {act, fireEvent, screen, waitFor} from "@testing-library/react-native";
import {renderWithProviders, SHEET_PRESS_TIMEOUT} from "@/test-utils/render";
import MachineSettingScreen from "@/app/machineSetting";
import type MachineControls from "@/library/machine/MachineControls";
import type {SavedMachine} from "@/library/machine/savedMachines";
import {sharedSettings} from "@/hooks/useSetting";
import {machineSettingsFixture, settingIdentity, settingReadings} from "@/test-utils/machineSettings";
import {flushControls} from "@/hooks/__tests__/machineControlFixture";
import {machineInfoFrame} from "@/library/machine/__tests__/FakeTransport";
import {performLiveBrewBarAction, requestLiveBrewBarNavigation, useLiveBrewBarCovered} from "@/hooks/useLiveBrewBarGuard";
import {openLink} from "@/hooks/useMachine";

jest.mock("react-native-ble-manager", () => ({__esModule: true, default: {}}));
jest.mock("@/components/XbrwToast", () => ({notify: jest.fn()}));
jest.mock("@/hooks/useSetting", () => jest.requireActual("@/test-utils/settingsMock").settingsMock());
jest.mock("@/hooks/useSavedMachines", () => ({useSavedMachines: () => ({machines: mockMachines})}));
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
let mockParams: {machineId?: string | string[]; setting?: string | string[]};
let mockMachines: SavedMachine[];
let mockRatingOpen: boolean;
const mockBack = jest.fn();
const mockDispatch = jest.fn();
const saved: SavedMachine = {
    id: settingIdentity.deviceId, serial: settingIdentity.serial, label: "Kitchen", model: "studio",
    modelString: "synthetic", advertisedName: "Test machine"
};
const owners: MachineControls[] = [];
async function fixture(production = false) {
    const store = {
        rememberedId: () => "not-this-machine", rememberId: jest.fn(),
        recordMachine: jest.fn(() => false), recordSerial: jest.fn()
    };
    const s = await machineSettingsFixture({production, reconnect: (target, check) =>
        openLink(s.machine, store, async () => ({granted: true}), {target, check, delays: [0]})});
    owners.push(s.controls);
    return {...s, store};
}
async function press(label: string) {
    await fireEvent.press(screen.getByRole("button", {name: label}));
    await act(flushControls);
}
async function prepare(setting = "brightness") {
    const s = await fixture();
    mockParams.setting = setting;
    const view = await renderWithProviders(<MachineSettingScreen controls={s.controls}/>);
    await press("Read current value");
    return {...s, view};
}
beforeEach(() => {
    mockParams = {machineId: settingIdentity.deviceId, setting: "brightness"};
    mockMachines = [{...saved}];
    mockRatingOpen = false;
    mockBack.mockClear();
    mockDispatch.mockClear();
});
afterEach(() => { owners.splice(0).forEach(owner => owner.dispose()); });

function BarCoverage() {
    const covered = useLiveBrewBarCovered();
    return <Text>{covered ? "bar covered" : "bar available"}</Text>;
}

it.each([true, false])("covers the %s-valid host for a global rating sheet without covering the bar", async valid => {
    const s = await fixture(true);
    if (!valid) mockParams.setting = "invalid";
    const contentId = valid ? "machine-setting-content" : "machine-setting-invalid";
    const tree = () => <><MachineSettingScreen controls={s.controls}/><BarCoverage/></>;
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
    expect(s.planned).toEqual([]);
});

it.each([
    {}, {machineId: settingIdentity.deviceId}, {setting: "brightness"}, {machineId: "unknown", setting: "brightness"},
    {machineId: [settingIdentity.deviceId], setting: "brightness"}, {machineId: settingIdentity.deviceId, setting: ["brightness"]},
    {machineId: settingIdentity.deviceId, setting: "toString"}
])("rejects malformed or unknown route params with no settings reads or frames: %j", async params => {
    const s = await fixture();
    mockParams = params;
    await renderWithProviders(<MachineSettingScreen controls={s.controls}/>);
    expect(screen.getByText(/Invalid machine setting link/)).toBeTruthy();
    await press("Back");
    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(s.planned).toEqual([]);
    expect(s.radio.sent).toEqual([]);
});

it("keeps an unopened proposal empty; changing a unit proposal and Back sends nothing and never changes app preferences", async () => {
    const s = await fixture();
    mockParams.setting = "temperatureUnit";
    const preferences = sharedSettings();
    const before = preferences.get("temperatureUnit");
    const savePreference = jest.spyOn(preferences, "set");
    const view = await renderWithProviders(<MachineSettingScreen controls={s.controls}/>);
    expect(screen.getByText("Proposal · Unavailable")).toBeTruthy();
    expect(screen.getByRole("button", {name: "°C"})).not.toBeSelected();
    await press("°F");
    expect(screen.getByText("Proposal · °F")).toBeTruthy();
    expect(screen.getByRole("button", {name: "Apply"})).toBeDisabled();
    await press("Back");
    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(s.radio.sent).toEqual([]);
    await view.unmount();
    await renderWithProviders(<MachineSettingScreen controls={s.controls}/>);
    expect(screen.getByText("Proposal · Unavailable")).toBeTruthy();
    expect(preferences.get("temperatureUnit")).toBe(before);
    expect(savePreference).not.toHaveBeenCalled();
    savePreference.mockRestore();
});

it("reads current without mutation, keeps numeric proposals separate, and applies exactly one typed transaction", async () => {
    const s = await prepare();
    expect(screen.getByLabelText("Brightness current: 2 test-level")).toBeTruthy();
    expect(screen.getByText("Proposal · Unavailable")).toBeTruthy();
    expect(s.planned.map(p => p.command.kind)).toEqual(["inspect"]);
    await press("Use current value as proposal");
    await fireEvent.press(screen.getByLabelText("Increase Brightness"));
    expect(screen.getByText("Proposal · 3 test-level")).toBeTruthy();
    expect(screen.getByLabelText("Brightness current: 2 test-level")).toBeTruthy();
    expect(s.planned).toHaveLength(1);
    const apply = jest.spyOn(s.controls, "applySetting");
    await press("Apply");
    expect(apply).toHaveBeenCalledTimes(1);
    expect(apply).toHaveBeenCalledWith(settingIdentity, "brightness", 3);
    expect(s.planned.map(p => p.command.kind)).toEqual(["inspect", "inspect", "setting"]);
    expect(screen.getByLabelText("Brightness current: 3 test-level")).toBeTruthy();
    expect(screen.getByText(/Applied · confirmed/)).toBeTruthy();
});

it.each(["temperatureUnit", "weightUnit", "waterSource", "pourRadius", "vibrationAmplitude"])(
    "renders %s with qualified choices or raw bounds without guessing tuning units", async setting => {
        const s = await prepare(setting);
        const preferences = sharedSettings();
        const before = preferences.get("temperatureUnit");
        const savePreference = jest.spyOn(preferences, "set");
        if (setting === "temperatureUnit") await press("°F");
        if (setting === "weightUnit") await press("oz");
        if (setting === "waterSource") {
            await press("Plumbed supply");
            expect(screen.getByText(/actual connected water line/)).toBeTruthy();
        }
        if (setting === "pourRadius" || setting === "vibrationAmplitude") {
            expect(screen.getByText(/No physical unit has been qualified/)).toBeTruthy();
            await press("Use current value as proposal");
            await fireEvent.press(screen.getByLabelText(`Increase ${setting === "pourRadius" ? "Pour radius" : "Vibration amplitude"}`));
        }
        await press("Apply");
        expect(s.planned.filter(p => p.command.kind === "setting")).toHaveLength(1);
        expect(s.planned.find(p => p.command.kind === "setting")?.command).toMatchObject({kind: "setting", id: setting});
        expect(screen.getByText(/Applied · confirmed/)).toBeTruthy();
        expect(preferences.get("temperatureUnit")).toBe(before);
        expect(savePreference).not.toHaveBeenCalled();
        savePreference.mockRestore();
    }
);

it("retains proposal and owner on missing readback; qualified reconciliation is not an optimistic success or Stop", async () => {
    const s = await prepare("temperatureUnit");
    await press("°F");
    s.respond(item => { if (item.command.kind !== "setting") s.accept(item); });
    await press("Apply");
    await waitFor(() => expect(s.controls.getSnapshot().phase).toBe("unknown"));
    expect(screen.getByText("Proposal · °F")).toBeTruthy();
    expect(screen.getByText("Qualified control response missing.")).toBeTruthy();
    expect(screen.queryByText(/Applied · confirmed/)).toBeNull();
    expect(s.machine.controlBlocker).not.toBeNull();
    expect(s.recovery.snapshot.marker).toBeNull();
    await press("Reconcile connected machine");
    expect(s.controls.getSnapshot().phase).toBe("closed");
    expect(screen.getByText("Proposal · °F")).toBeTruthy();
    expect(screen.queryByText(/Applied · confirmed/)).toBeNull();
    s.respond(s.accept);
    await press("Apply");
    expect(screen.getByText(/Applied · confirmed/)).toBeTruthy();
    expect(s.planned.some(p => p.command.kind === "stop")).toBe(false);
});

it("does not claim success for mismatched readback and keeps Back guarded until qualified reconciliation", async () => {
    const s = await prepare("temperatureUnit");
    await press("°F");
    s.respond(item => s.feedback(item, {kind: "settings", readings: settingReadings}));
    await press("Apply");
    expect(s.controls.getSnapshot().phase).toBe("unknown");
    expect(screen.getByText("Control readback does not match the proposal.")).toBeTruthy();
    expect(screen.queryByText(/Applied · confirmed/)).toBeNull();
    await press("Back");
    expect(mockBack).not.toHaveBeenCalled();
    expect(screen.getByTestId("machine-setting-content", {includeHiddenElements: true})).toHaveProp("accessibilityElementsHidden", true);
    expect(screen.getByTestId("machine-setting-content", {includeHiddenElements: true})).toHaveProp("importantForAccessibility", "no-hide-descendants");
    expect(screen.queryByRole("button", {name: "Stop and leave"})).toBeNull();
    await waitFor(async () => {
        await fireEvent.press(screen.getByRole("button", {name: "Reconcile and leave"}));
        await act(flushControls);
        expect(mockBack).toHaveBeenCalledTimes(1);
    }, {timeout: SHEET_PRESS_TIMEOUT});
    expect(s.machine.controlBlocker).toBeNull();
    expect(s.planned.some(p => p.command.kind === "stop")).toBe(false);
});

it("blocks repeated Apply and native departure during the in-flight setting; releases only after its outcome", async () => {
    const s = await prepare("temperatureUnit");
    await press("°F");
    s.respond(item => { if (item.command.kind !== "setting") s.accept(item); });
    await press("Apply");
    expect(s.controls.getSnapshot().phase).toBe("applying");
    await expect(s.controls.applySetting(settingIdentity, "temperatureUnit", "F")).rejects.toThrow("closed control session");
    expect(screen.getByRole("button", {name: "Apply", includeHiddenElements: true})).toBeDisabled();
    const transaction = s.planned.findLast(p => p.command.kind === "setting")!;
    expect(mockPrevention.prevent).toBe(true);
    await act(async () => mockPrevention.callback({data: {action: {type: "GO_BACK"}}}));
    expect(screen.getByRole("button", {name: "Waiting for confirmation…"})).toBeDisabled();
    expect(mockDispatch).not.toHaveBeenCalled();
    expect(s.machine.controlBlocker).not.toBeNull();
    await act(async () => { s.accept(transaction); await flushControls(); });
    expect(s.controls.getSnapshot().phase).toBe("closed");
    expect(s.planned.filter(p => p.command.kind === "setting")).toHaveLength(1);
    await waitFor(async () => {
        await fireEvent.press(screen.getByRole("button", {name: "Leave"}));
        await act(flushControls);
        expect(mockDispatch).toHaveBeenCalledTimes(1);
    }, {timeout: SHEET_PRESS_TIMEOUT});
});

it.each(["read", "apply"] as const)("keeps %s accessible while busy and reconnects only to inspect the retained setting", async operation => {
    const s = await fixture();
    mockParams.setting = "temperatureUnit";
    await renderWithProviders(<><MachineSettingScreen controls={s.controls}/><BarCoverage/></>);
    await press("°F");
    if (operation === "apply") await press("Read current value");
    s.respond(item => {
        if (operation === "apply" && item.command.kind !== "setting") s.accept(item);
    });
    await press(operation === "read" ? "Read current value" : "Apply");
    expect(screen.getByRole("button", {name: "Back"})).toBeVisible();
    expect(screen.getByText("Waiting for qualified machine readback…")).toBeTruthy();
    expect(screen.getByTestId("machine-setting-content")).toHaveProp("accessibilityElementsHidden", false);
    expect(screen.getByTestId("machine-setting-content")).toHaveProp("importantForAccessibility", "auto");
    expect(screen.getByText("bar covered")).toBeTruthy();
    const navigate = jest.fn();
    performLiveBrewBarAction(navigate);
    requestLiveBrewBarNavigation(navigate);
    expect(navigate).not.toHaveBeenCalled();
    expect(mockPrevention.prevent).toBe(true);
    await act(async () => s.radio.drop());
    expect(s.controls.getSnapshot().phase).toBe("unknown");
    const before = s.planned.map(item => item.command.kind);
    s.respond(item => {
        if (item.command.kind !== "inspect" || !item.command.recovery) return;
        expect(item.command).toEqual({kind: "inspect", tool: null, recovery: true});
        expect(s.machine.controlBlocker).not.toBeNull();
        s.accept(item);
    });
    await press("Back");
    expect(mockBack).not.toHaveBeenCalled();
    await waitFor(async () => {
        await fireEvent.press(screen.getByRole("button", {name: "Stay"}));
        expect(screen.getByRole("button", {name: "Reconnect named machine"})).toBeEnabled();
    }, {timeout: SHEET_PRESS_TIMEOUT});
    await waitFor(async () => {
        const reconnect = screen.queryByRole("button", {name: "Reconnect named machine"});
        if (reconnect) await fireEvent.press(reconnect);
        await act(flushControls);
        expect(s.controls.getSnapshot()).toMatchObject({phase: "closed", error: null});
    }, {timeout: SHEET_PRESS_TIMEOUT});
    expect(screen.getByText("Proposal · °F")).toBeTruthy();
    expect(screen.queryByText(/Applied · confirmed/)).toBeNull();
    expect(s.planned.map(item => item.command.kind)).toEqual([...before, "inspect"]);
    expect(s.controls.getSnapshot().phase).toBe("closed");
    expect(s.machine.controlBlocker).toBeNull();
    expect(s.recovery.snapshot.marker).toBeNull();
    expect(s.store.rememberId).not.toHaveBeenCalled();
    expect(s.store.recordMachine).not.toHaveBeenCalled();
    expect(s.store.recordSerial).not.toHaveBeenCalled();
});

it.each(["failure", "device", "serial"] as const)("retains the setting proposal and lease after reconnect %s", async mismatch => {
    const s = await prepare("temperatureUnit");
    await press("°F");
    s.respond(() => {});
    await press("Apply");
    await act(async () => s.radio.drop());
    const before = s.planned.length;
    if (mismatch === "failure") s.radio.failConnect = new Error("Setting radio unavailable.");
    else if (mismatch === "serial") s.radio.infoReply = machineInfoFrame({serial: "wrong", model: "test", firmware: "test"});
    else jest.spyOn(s.radio, "connect").mockImplementationOnce(async () => { s.radio.connectedTo = "wrong"; });
    await press("Reconnect named machine");
    expect(screen.getByText(mismatch === "failure" ? "Setting radio unavailable."
        : "Reconnect requires the exact connected device and saved serial.")).toBeTruthy();
    expect(screen.getByText("Proposal · °F")).toBeTruthy();
    expect(s.controls.getSnapshot().phase).toBe("unknown");
    expect(s.machine.controlBlocker).not.toBeNull();
    expect(s.recovery.snapshot.marker).toBeNull();
    expect(s.planned).toHaveLength(before);
});

it("does not retarget an in-flight proposal when the saved route serial changes", async () => {
    const s = await prepare("temperatureUnit");
    await press("°F");
    s.respond(item => { if (item.command.kind !== "setting") s.accept(item); });
    await press("Apply");
    mockMachines = [{...saved, serial: "new-serial"}];
    await s.view.rerender(<MachineSettingScreen controls={s.controls}/>);
    expect(screen.getByText("Proposal · Unavailable", {includeHiddenElements: true})).toBeTruthy();
    expect(s.controls.getSnapshot().identity).toEqual(settingIdentity);
    await act(async () => s.radio.emit(machineInfoFrame({serial: "new-serial", model: "test", firmware: "test"})));
    await waitFor(() => expect(s.controls.getSnapshot().phase).toBe("unknown"));
    expect(s.controls.getSnapshot().identity).toEqual(settingIdentity);
    expect(s.machine.controlBlocker).not.toBeNull();
    expect(screen.queryByText(/Applied · confirmed/)).toBeNull();
    expect(s.planned.filter(p => p.command.kind === "setting")).toHaveLength(1);
    expect(s.recovery.snapshot.marker).toBeNull();
});

it("labels disconnected readings last-known and isolates readings after route serial or device changes", async () => {
    const s = await prepare("temperatureUnit");
    const connect = jest.spyOn(s.machine, "connect");
    await act(async () => s.radio.drop());
    expect(screen.getByLabelText("Temperature unit last-known: °C")).toBeTruthy();
    expect(screen.getByRole("button", {name: "Read current value"})).toBeDisabled();
    mockMachines = [{...saved, serial: "other"}];
    await s.view.rerender(<MachineSettingScreen controls={s.controls}/>);
    expect(screen.queryByLabelText("Temperature unit last-known: °C")).toBeNull();
    expect(screen.getByLabelText("Temperature unit unavailable: Unavailable")).toBeTruthy();
    mockMachines = [{...saved, id: "another"}];
    mockParams.machineId = "another";
    await s.view.rerender(<MachineSettingScreen controls={s.controls}/>);
    expect(screen.getByLabelText("Temperature unit unavailable: Unavailable")).toBeTruthy();
    expect(connect).not.toHaveBeenCalled();
});

it("does not use ordinary short info or app preferences as actual settings on unqualified production scopes", async () => {
    const s = await fixture(true);
    const view = await renderWithProviders(<MachineSettingScreen controls={s.controls}/>);
    expect(screen.getByLabelText("Brightness unavailable: Unavailable")).toBeTruthy();
    expect(screen.getByRole("button", {name: "Read current value"})).toBeDisabled();
    await act(async () => s.radio.emit(machineInfoFrame({serial: "wrong", model: "test", firmware: "test"})));
    await view.rerender(<MachineSettingScreen controls={s.controls}/>);
    expect(screen.getByRole("button", {name: "Apply"})).toBeDisabled();
    expect(s.planned).toEqual([]);
});
