import React from "react";
import {act, fireEvent, screen, waitFor, within} from "@testing-library/react-native";
import {renderWithProviders, SHEET_PRESS_TIMEOUT} from "@/test-utils/render";
import {coffee} from "@/library/slots/__tests__/fixtures";
import {emptySlotRecord, prepareSet, snapshotRecipe} from "@/library/slots/slotModel";
import type {SlotAttempt} from "@/hooks/useEasyModeSlots";
import {createTestDatabase} from "@/test-utils/sqlite";
import {SlotDatabase} from "@/library/slots/SlotDatabase";
import {AccessibilityInfo} from "react-native";
import EasyModeScreen from "@/app/easyMode";
import LiveBrewBar from "@/components/LiveBrewBar";
import {forgetLastMove} from "@/hooks/steadyRouter";
import {RATING_PROMPT_OPEN_LABEL} from "@/constants/brewCopy";
import type {StoredBrew} from "@/library/BrewDatabase";
import type {LiveBrewSnapshot} from "@/hooks/useLiveBrew";
import {accents} from "@/constants/colors";
import {restoreTeaSlotOriginal, writeTeaSlotProbe} from "@/library/slots/teaSlotProbe";

const mockAllRecipes = [coffee("Whole library recipe")];
let mockRecord = emptySlotRecord();
let mockParams: {recipeJSON?: string} = {};
let mockRatingNoteOpen = false;
let mockDeviceId = "one";
let mockSerial = "serial";
let mockConnected = true;
let mockBusy = false;
let mockRunning = false;
let mockAvailable = false;
let mockAttempt: SlotAttempt | null = null;
let mockFocused = true;
let mockRun: Partial<LiveBrewSnapshot> | null = null;
const mockPush = jest.fn();
const mockDismiss = jest.fn();
const mockPrompt = {
    brew: null as StoredBrew | null,
    rate: jest.fn(), annotate: jest.fn(), dismiss: jest.fn(), refresh: jest.fn()
};
const mockWrite = jest.fn();
const mockSetScaleEnabled = jest.fn();
const mockReset = jest.fn();
const mockProbe = jest.fn();
const mockLab = jest.fn();
const mockRecoveryProbe = jest.fn();
const mockClearRecovery = jest.fn();
const mockRestore = jest.fn();
const mockStopWrite = jest.fn();
const mockObserve = jest.fn();
const dev = __DEV__;
type Action = {type: string; payload?: {count: number}};
type PreventionCallback = (event: {data: {action: Action}}) => void;
let mockGuard: {prevent: boolean; callback: PreventionCallback};
const mockPreventRemove = jest.fn((prevent: boolean, callback: PreventionCallback) => {
    mockGuard = {prevent, callback};
});
function mockRemove(action: Action = {type: "GO_BACK"}, replay = false) {
    const event = {data: {action}, preventDefault: jest.fn()};
    if (mockGuard.prevent && !replay) {
        event.preventDefault();
        mockGuard.callback({data: event.data});
    }
    return event;
}
// usePreventRemove's original action carries the visited-route marker on replay.
const mockDispatch = jest.fn((action: Action) => mockRemove(action, true));
const mockNavigation = {dispatch: mockDispatch};
jest.mock("expo-router/react-navigation", () => ({
    usePreventRemove: (prevent: boolean, callback: PreventionCallback) => mockPreventRemove(prevent, callback),
    useIsFocused: () => mockFocused
}));
jest.mock("@/hooks/useLiveBrew", () => ({
    useLiveBrew: () => ({
        ratingNoteOpen: mockRatingNoteOpen, run: mockRun,
        dismiss: mockDismiss, setRatingNoteOpen: jest.fn()
    })
}));
jest.mock("@/hooks/useRatingPrompt", () => ({
    useRatingPrompt: () => mockPrompt
}));
jest.mock("expo-router", () => ({
    useLocalSearchParams: () => mockParams,
    useNavigation: () => mockNavigation,
    usePathname: () => mockFocused ? "/easyMode" : "/settings",
    router: {push: mockPush, back: () => mockRemove(), canGoBack: () => true},
    useRouter: () => ({push: mockPush, back: jest.fn()})
}));
jest.mock("@/hooks/useMachine", () => ({
    useMachine: () => ({
        remembered: mockDeviceId, status: mockConnected ? "connected" : "disconnected",
        machine: {slotIdentity: mockConnected ? {deviceId: mockDeviceId, serial: mockSerial} : null,
            info: {model: "X15", firmware: "V12.0D.500"},
            modelNumber: "X15", advertisedName: "XBLOOM",
            phase: mockBusy ? {name: "pouring"} : undefined}
    })
}));
jest.mock("@/hooks/useEasyModeSlots", () => ({
    ...jest.requireActual("@/hooks/useEasyModeSlots"),
    useEasyModeSlots: () => ({
        record: mockRecord, error: null,
        available: mockAvailable, running: mockRunning, attempt: mockAttempt,
        resetAttempt: mockReset,
        setScaleEnabled: mockSetScaleEnabled,
        assign: jest.fn(), write: mockWrite, recover: jest.fn(), cancel: jest.fn(), dismissWrite: mockStopWrite,
        writeTeaProbe: mockProbe, restoreTeaOriginal: mockRestore, observeTeaProbe: mockObserve,
        writeSlotLab: mockLab, sendRecoveryProbe: mockRecoveryProbe, clearRecoveryProbe: mockClearRecovery
    })
}));
jest.mock("@/hooks/useRecipeLibrary", () => ({
    useRecipeLibrary: () => ({allRecipes: () => mockAllRecipes})
}));

beforeEach(() => {
    mockParams = {}; mockRatingNoteOpen = false; mockRecord = emptySlotRecord();
    mockDeviceId = "one"; mockSerial = "serial"; mockConnected = true; mockBusy = false;
    mockRunning = false; mockAvailable = false; mockAttempt = null;
    mockDispatch.mockClear(); mockWrite.mockClear(); mockReset.mockClear();
    mockFocused = true; mockRun = null; mockPrompt.brew = null;
    mockPreventRemove.mockClear(); mockPush.mockClear(); mockDismiss.mockClear();
    mockPrompt.rate.mockClear(); mockPrompt.dismiss.mockClear();
    mockProbe.mockClear(); mockRestore.mockClear(); mockObserve.mockClear();
    mockLab.mockClear(); mockRecoveryProbe.mockClear(); mockClearRecovery.mockClear();
    mockStopWrite.mockClear();
    mockSetScaleEnabled.mockClear();
    Object.defineProperty(global, "__DEV__", {value: dev});
    forgetLastMove();
});
afterEach(() => { Object.defineProperty(global, "__DEV__", {value: dev}); });

function changedDrafts() {
    const saved = snapshotRecipe(mockAllRecipes[0]);
    mockRecord.drafts = [saved, saved, saved];
    mockAvailable = true;
}

it("wires per-slot scale changes to the live hook handler", async () => {
    changedDrafts();
    await renderWithProviders(<EasyModeScreen/>);
    await fireEvent(screen.getByRole("switch", {name: "Scale for slot B"}), "onCheckedChange", true);
    expect(mockSetScaleEnabled).toHaveBeenCalledWith(1, true);
    expect(mockWrite).not.toHaveBeenCalled();
});

async function departure(action?: Action) {
    let event!: ReturnType<typeof mockRemove>;
    await act(() => { event = mockRemove(action); });
    return event;
}

async function press(name: string) {
    await waitFor(async () => {
        await fireEvent.press(screen.getByRole("button", {name}));
        expect(screen.queryByRole("button", {name: "LEAVE FOR NOW"})).toBeNull();
    }, {timeout: SHEET_PRESS_TIMEOUT});
}

it("hides the whole route while the global brew-note sheet is open", async () => {
    mockRatingNoteOpen = true;
    await renderWithProviders(<EasyModeScreen/>);
    expect(screen.queryByRole("header", {name: /Easy Mode/i})).toBeNull();
    expect(screen.queryByRole("button", {name: "Change slot A recipe"})).toBeNull();
    expect(screen.queryByRole("button", {name: "Write all three slots"})).toBeNull();
    expect(screen.getByTestId("easy-mode-screen", {includeHiddenElements: true}).props
        .importantForAccessibility).toBe("no-hide-descendants");
});

it("renders the canonical route with its own header and production block", async () => {
    await renderWithProviders(<EasyModeScreen/>);
    expect(screen.getByRole("header", {name: /Easy Mode/i})).toBeOnTheScreen();
    expect(screen.getByText(/shared machine transport/i)).toBeOnTheScreen();
});

it("shows invalid incoming route data explicitly instead of seeding an invented recipe", async () => {
    mockParams = {recipeJSON: "{bad"};
    await renderWithProviders(<EasyModeScreen/>);
    expect(screen.getByText(/Incoming recipe could not be opened/i)).toBeOnTheScreen();
    expect(screen.queryByText(/Choose a slot for/i)).toBeNull();
});

it.each(["uuid", "dosage", "grindRPM", "grinder", "cupType", "bypassEnabled"])("refuses incoming recipes missing %s instead of inventing defaults", async (field) => {
    const json = JSON.parse(JSON.stringify(mockAllRecipes[0]));
    delete json[field];
    mockParams = {recipeJSON: JSON.stringify(json)};
    await renderWithProviders(<EasyModeScreen/>);
    expect(screen.getByText(/Incoming recipe could not be opened/i)).toBeOnTheScreen();
});

it("hides the route header and pinned action from screen readers while the picker is open", async () => {
    await renderWithProviders(<EasyModeScreen/>);
    await fireEvent.press(screen.getByRole("button", {name: "Change slot A recipe"}));
    expect(screen.queryByRole("header", {name: /Easy Mode/i})).toBeNull();
    expect(screen.queryByRole("button", {name: "Write all three slots"})).toBeNull();
    expect(await screen.findByRole("button", {name: "Choose Whole library recipe"})).toBeOnTheScreen();
});

it.each(["GO_BACK", "POP", "HARDWARE_BACK", "RESET"])("holds the original %s action for changed drafts and replays exactly once", async (type) => {
    changedDrafts();
    const store = new SlotDatabase(createTestDatabase());
    mockRecord.drafts.forEach((snapshot, index) => store.assign("one", index as 0 | 1 | 2, snapshot!));
    mockRecord = store.read("one");
    const before = JSON.stringify(mockRecord);
    await renderWithProviders(<EasyModeScreen/>);
    expect(mockPreventRemove).toHaveBeenLastCalledWith(true, expect.any(Function));
    const action = {type, payload: {count: 2}};
    expect((await departure(action)).preventDefault).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("Your changes are kept here. Write them when you want to use them on your machine."))
        .toBeOnTheScreen();
    expect(screen.queryByRole("header", {name: /Easy Mode/i})).toBeNull();
    expect(screen.queryByRole("button", {name: "Write all three slots"})).toBeNull();
    expect(screen.getByTestId("easy-mode-screen", {includeHiddenElements: true}).props
        .importantForAccessibility).toBe("no-hide-descendants");
    await press("LEAVE FOR NOW");
    expect(mockDispatch).toHaveBeenCalledTimes(1);
    expect(mockDispatch.mock.calls[0][0]).toBe(action);
    expect(mockDispatch.mock.results[0].value.preventDefault).not.toHaveBeenCalled();
    expect(JSON.stringify(store.read("one"))).toBe(before);
    // A dispatch that did not unmount must not permanently bypass the guard.
    expect((await departure()).preventDefault).toHaveBeenCalledTimes(1);
});

it("routes the header back through the same departure listener", async () => {
    changedDrafts();
    await renderWithProviders(<EasyModeScreen/>);
    await fireEvent.press(screen.getByRole("button", {name: "Back"}));
    expect(await screen.findByRole("button", {name: "LEAVE FOR NOW"})).toBeOnTheScreen();
});

it.each(["empty", "equal", "renamed"])("does not prompt for %s machine bytes", async (kind) => {
    if (kind !== "empty") {
        changedDrafts();
        const saved = snapshotRecipe(mockAllRecipes[0]);
        mockRecord.written = {at: 1, slots: [saved, saved, saved]};
        if (kind === "renamed") mockRecord.drafts[0] = {...saved, name: "Renamed"};
    }
    await renderWithProviders(<EasyModeScreen/>);
    expect(mockPreventRemove).toHaveBeenLastCalledWith(false, expect.any(Function));
    expect((await departure()).preventDefault).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", {name: "LEAVE FOR NOW"})).toBeNull();
});

it("allows offline departure without offering a write", async () => {
    changedDrafts(); mockConnected = false;
    await renderWithProviders(<EasyModeScreen/>);
    await departure();
    expect(await screen.findByText(/Connect to this machine before writing/)).toBeOnTheScreen();
    expect(screen.getByRole("button", {name: "WRITE TO MACHINE"})).toBeDisabled();
    await press("LEAVE FOR NOW");
    expect(mockDispatch).toHaveBeenCalledTimes(1);
    expect(mockWrite).not.toHaveBeenCalled();
});

it("drops held navigation and starts the normal write once", async () => {
    changedDrafts();
    await renderWithProviders(<EasyModeScreen/>);
    await departure();
    await press("WRITE TO MACHINE");
    expect(mockWrite).toHaveBeenCalledTimes(1);
    expect(mockDispatch).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", {name: "LEAVE FOR NOW"})).toBeNull();
});

it.each(["Stay here", "Close"])("clears the held action on %s and restores the surviving write control", async (name) => {
    changedDrafts();
    await renderWithProviders(<EasyModeScreen/>);
    await departure();
    await press(name);
    expect(mockDispatch).not.toHaveBeenCalled();
    expect(screen.getByRole("button", {name: "Write all three slots"})).toBeOnTheScreen();
    expect((await departure()).preventDefault).toHaveBeenCalledTimes(1);
});

it.each(["write", "recover", "cancel", "probe", "restore"] as const)("blocks departure throughout an active %s attempt", async (operation) => {
    changedDrafts(); mockRunning = true;
    mockAttempt = {deviceId: "one", serial: "serial", operation,
        status: operation === "cancel" ? "cancelling" : "writing"};
    await renderWithProviders(<EasyModeScreen/>);
    expect(mockPreventRemove).toHaveBeenLastCalledWith(true, expect.any(Function));
    expect((await departure()).preventDefault).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", {name: "LEAVE FOR NOW"})).toBeNull();
    expect(mockDispatch).not.toHaveBeenCalled();
});

it("does not expose LAB or new experiments alongside the global bar", async () => {
    offerRating();
    await renderWithProviders(<><EasyModeScreen/><LiveBrewBar/></>);
    expect(screen.queryByRole("button", {name: "TEA SLOT PROBE"})).toBeNull();
    expect(screen.getByRole("header", {name: /Easy Mode/i})).toBeOnTheScreen();
    expect(screen.getByRole("button", {name: "Write all three slots"})).toBeOnTheScreen();
    expect(mockPreventRemove).toHaveBeenLastCalledWith(false, expect.any(Function));
    expect(mockLab).not.toHaveBeenCalled();
});

it("new lab dispatch remains inaccessible even with changed drafts in development", async () => {
    changedDrafts();
    await renderWithProviders(<EasyModeScreen/>);
    expect(screen.queryByText("LAB")).toBeNull();
    expect(screen.queryByRole("button", {name: "WRITE STEEP TEST"})).toBeNull();
    expect(mockLab).not.toHaveBeenCalled();
    expect(mockWrite).not.toHaveBeenCalled();
    expect(mockRestore).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", {name: "WRITE STEEP TEST"})).toBeNull();
});

it("keeps retained trial restoration accessible in production and ordinary writing blocked", async () => {
    const store = new SlotDatabase(createTestDatabase());
    for (const i of [0, 1, 2] as const) store.assign("one", i, snapshotRecipe(mockAllRecipes[0]));
    const port = {available: true, acquire: async () => ({
        sendAndConfirm: async () => {}, confirmSaved: async () => {}, release: () => {}
    })};
    await writeTeaSlotProbe(store, {deviceId: "one", serial: "serial"}, port);
    mockRecord = store.read("one"); mockAvailable = true;
    Object.defineProperty(global, "__DEV__", {value: false});
    const view = await renderWithProviders(<EasyModeScreen/>);
    expect(screen.getByRole("button", {name: "Write all three slots"})).toBeDisabled();
    expect(screen.getByText("Restore the original set before writing slots.")).toBeOnTheScreen();
    expect(screen.getByText("1 STEEP · 60ML · 70C · 60S · GRIND OFF")).toBeOnTheScreen();
    expect(screen.getByText("Tea candidate stored; behavior UNTESTED.")).toBeOnTheScreen();
    expect(within(screen.getByTestId("slot-A")).queryByText("LAST WRITTEN")).toBeNull();
    expect(within(screen.getByTestId("slot-A")).queryByText("NOT WRITTEN")).toBeNull();
    expect(screen.queryByText("REMOVED FROM LIBRARY")).toBeNull();
    expect(screen.queryByText("LAB")).toBeNull();
    await fireEvent.press(screen.getByRole("button", {name: "Restore original slot set"}));
    expect(mockRestore).toHaveBeenCalledTimes(1);
    expect(mockWrite).not.toHaveBeenCalled();
    await restoreTeaSlotOriginal(store, {deviceId: "one", serial: "serial"}, port);
    mockRecord = store.read("one");
    await view.rerender(<EasyModeScreen/>);
    expect(screen.queryByRole("button", {name: "Restore original slot set"})).toBeNull();
    expect(screen.getByRole("button", {name: "Write all three slots"})).toBeEnabled();
    expect(screen.queryByRole("button", {name: "WRITE PROBE"})).toBeNull();
});

it("disables retained restoration when the connected serial differs without a pending journal", async () => {
    const store = new SlotDatabase(createTestDatabase());
    for (const i of [0, 1, 2] as const) store.assign("one", i, snapshotRecipe(mockAllRecipes[0]));
    const port = {available: true, acquire: async () => ({
        sendAndConfirm: async () => {}, confirmSaved: async () => {}, release: () => {}
    })};
    await writeTeaSlotProbe(store, {deviceId: "one", serial: "original"}, port);
    mockRecord = store.read("one");
    mockAvailable = true;
    mockSerial = "different";
    await renderWithProviders(<EasyModeScreen/>);
    expect(screen.getByRole("button", {name: "Restore original slot set"})).toBeDisabled();
    expect(mockRestore).not.toHaveBeenCalled();
});

it("does not expose trials in either build mode or after identity changes", async () => {
    Object.defineProperty(global, "__DEV__", {value: false});
    const view = await renderWithProviders(<EasyModeScreen/>);
    expect(screen.queryByRole("button", {name: "TEA SLOT PROBE"})).toBeNull();
    Object.defineProperty(global, "__DEV__", {value: true});
    await view.rerender(<EasyModeScreen/>);
    expect(screen.queryByRole("button", {name: "TEA SLOT PROBE"})).toBeNull();
    mockSerial = "changed";
    await view.rerender(<EasyModeScreen/>);
    expect(screen.queryByText(/1 steep, 60 ml, 70 C, 60 s/)).toBeNull();
    expect(mockProbe).not.toHaveBeenCalled();
});

it("keeps all slot controls hidden while the external rating note is modal", async () => {
    const view = await renderWithProviders(<EasyModeScreen/>);
    mockRatingNoteOpen = true;
    await view.rerender(<EasyModeScreen/>);
    expect(screen.queryByRole("button", {name: "WRITE PROBE"})).toBeNull();
    expect(screen.queryByText(/A: 1 steep.*B: 2 steeps.*C: 3 steeps/)).toBeNull();
    expect(screen.queryByRole("button", {name: "Write all three slots"})).toBeNull();
});

it("restores focus to help after closing its covering sheet", async () => {
    const native = jest.requireActual<typeof import("react-native")>("react-native");
    const focus = jest.spyOn(AccessibilityInfo, "setAccessibilityFocus").mockImplementation(() => {});
    const handle = jest.spyOn(native, "findNodeHandle").mockReturnValue(42);
    try {
        await renderWithProviders(<EasyModeScreen/>);
        await fireEvent.press(screen.getByRole("button", {name: "About Easy Mode"}));
        expect(await screen.findByText("Your choices are kept on this phone immediately.")).toBeOnTheScreen();
        await waitFor(async () => {
            const close = screen.queryByRole("button", {name: "Close"});
            if (close !== null) await fireEvent.press(close);
            expect(screen.getByRole("button", {name: "About Easy Mode"})).toBeOnTheScreen();
        }, {timeout: SHEET_PRESS_TIMEOUT});
        await waitFor(() => {
            expect(handle).toHaveBeenLastCalledWith(expect.objectContaining({
                props: expect.objectContaining({accessibilityLabel: "About Easy Mode"})
            }));
            expect(focus).toHaveBeenLastCalledWith(42);
        });
    } finally {
        handle.mockRestore(); focus.mockRestore();
    }
});

it("allows a stopped journal to leave unchanged with its reservation retained", async () => {
    changedDrafts();
    const store = new SlotDatabase(createTestDatabase());
    mockRecord.drafts.forEach((snapshot, index) => store.assign("one", index as 0 | 1 | 2, snapshot!));
    const saved = snapshotRecipe(mockAllRecipes[0]);
    store.begin("one", {id: "pending", serial: "serial", slots: [saved, saved, saved],
        frames: prepareSet(mockRecord.drafts), acknowledged: 0, inFlight: null, error: null});
    mockRecord = store.read("one");
    const before = JSON.stringify(mockRecord);
    await renderWithProviders(<EasyModeScreen/>);
    expect((await departure()).preventDefault).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", {name: "LEAVE FOR NOW"})).toBeNull();
    expect(screen.queryByRole("button", {name: "Write all three slots"})).toBeNull();
    expect(JSON.stringify(store.read("one"))).toBe(before);
    expect(store.read("one").journal).not.toBeNull();
});

it.each(["device", "serial"])("never replays a held action after the %s changes", async (kind) => {
    changedDrafts();
    const view = await renderWithProviders(<EasyModeScreen/>);
    await departure();
    if (kind === "device") mockDeviceId = "two";
    else mockSerial = "other";
    await view.rerender(<EasyModeScreen/>);
    expect(screen.queryByRole("button", {name: "LEAVE FOR NOW"})).toBeNull();
    expect(mockDispatch).not.toHaveBeenCalled();
    await departure({type: "POP"});
    await press("LEAVE FOR NOW");
    expect(mockDispatch).toHaveBeenCalledTimes(1);
    expect(mockDispatch).toHaveBeenCalledWith({type: "POP"});
});

it("renders actual success and resets the completed attempt, but never shows cancellation as written", async () => {
    changedDrafts();
    const saved = snapshotRecipe(mockAllRecipes[0]);
    mockRecord.written = {at: 1, slots: [saved, saved, saved]};
    mockAttempt = {deviceId: "one", serial: "serial", operation: "write", status: "success"};
    const view = await renderWithProviders(<EasyModeScreen/>);
    expect(screen.getByText("SLOTS WRITTEN")).toBeOnTheScreen();
    await waitFor(() => expect(mockReset).toHaveBeenCalledTimes(1), {timeout: 5000});
    mockAttempt = {...mockAttempt, operation: "cancel", status: "cancelled"};
    await view.rerender(<EasyModeScreen/>);
    expect(screen.queryByText("SLOTS WRITTEN")).toBeNull();
    expect(screen.getByRole("button", {name: "Write all three slots"})).toBeOnTheScreen();
});

it.each(["missing", "invalid", "busy", "unavailable"])("does not offer departure writing with %s prerequisites", async (reason) => {
    changedDrafts();
    if (reason === "missing") mockRecord.drafts[2] = null;
    if (reason === "invalid") mockRecord.drafts[2] = {...mockRecord.drafts[2]!, blob: [1]};
    if (reason === "busy") mockBusy = true;
    if (reason === "unavailable") mockAvailable = false;
    await renderWithProviders(<EasyModeScreen/>);
    await departure();
    expect(await screen.findByRole("button", {name: "WRITE TO MACHINE"})).toBeDisabled();
    await press("LEAVE FOR NOW");
    expect(mockWrite).not.toHaveBeenCalled();
    expect(mockDispatch).toHaveBeenCalledTimes(1);
});

it("keeps the first held action when another departure arrives while the question is open", async () => {
    changedDrafts();
    await renderWithProviders(<EasyModeScreen/>);
    const original = {type: "POP"};
    await departure(original);
    expect((await departure({type: "RESET"})).preventDefault).toHaveBeenCalledTimes(1);
    await press("LEAVE FOR NOW");
    expect(mockDispatch).toHaveBeenCalledTimes(1);
    expect(mockDispatch.mock.calls[0][0]).toBe(original);
});

it("hides the departure sheet too while the external rating note is modal", async () => {
    changedDrafts();
    const view = await renderWithProviders(<EasyModeScreen/>);
    await departure();
    mockRatingNoteOpen = true;
    await view.rerender(<EasyModeScreen/>);
    expect(screen.queryByRole("button", {name: "LEAVE FOR NOW"})).toBeNull();
    expect(screen.queryByRole("button", {name: "WRITE TO MACHINE"})).toBeNull();
});

it.each(["Stay here", "Close"])("restores WRITE focus after %s clears the covering modal", async (name) => {
    const native = jest.requireActual<typeof import("react-native")>("react-native");
    const focus = jest.spyOn(AccessibilityInfo, "setAccessibilityFocus").mockImplementation(() => {});
    const handle = jest.spyOn(native, "findNodeHandle").mockReturnValue(42);
    try {
        changedDrafts();
        await renderWithProviders(<EasyModeScreen/>);
        await departure();
        expect(focus).not.toHaveBeenCalled();
        await press(name);
        await waitFor(() => {
            expect(screen.queryByRole("button", {name: "LEAVE FOR NOW"})).toBeNull();
            expect(screen.getByRole("button", {name: "Write all three slots"})).toBeOnTheScreen();
            expect(handle).toHaveBeenLastCalledWith(expect.objectContaining({
                props: expect.objectContaining({accessibilityLabel: "Write all three slots"})
            }));
            expect(focus).toHaveBeenLastCalledWith(42);
        });
    } finally {
        handle.mockRestore(); focus.mockRestore();
    }
});

function GlobalPresentation({showEasy = true}: {showEasy?: boolean}) {
    return <>{showEasy && <EasyModeScreen/>}<LiveBrewBar/></>;
}

function offerRating(): void {
    mockPrompt.brew = {
        id: "rating-brew", recipeUuid: mockAllRecipes[0].uuid, recipeName: "Last brew",
        accent: accents.coffee[0], startedAt: 0, pouringAt: 1000, endedAt: 2000,
        outcome: "done", failure: null, pours: 1, waterTotal: 240, cupTotal: 230,
        heldSeconds: 0, rating: 0, note: "", pinned: false, hasStream: false, plan: []
    };
}

function globalOpen(hidden = false) {
    return screen.getByRole("button", {
        name: new RegExp(RATING_PROMPT_OPEN_LABEL), includeHiddenElements: hidden
    });
}

function expectGlobalCovered(): void {
    const host = screen.getByTestId("live-brew-bar-host", {includeHiddenElements: true});
    expect(host.props.accessibilityElementsHidden).toBe(true);
    expect(host.props.importantForAccessibility).toBe("no-hide-descendants");
    expect(host.props.pointerEvents).toBe("none");
    expect(screen.queryByRole("button", {name: new RegExp(RATING_PROMPT_OPEN_LABEL)})).toBeNull();
}

it("holds the sibling bar's record push with the same reminder and preserves persisted drafts", async () => {
    changedDrafts(); offerRating();
    const store = new SlotDatabase(createTestDatabase());
    mockRecord.drafts.forEach((snapshot, index) => store.assign("one", index as 0 | 1 | 2, snapshot!));
    mockRecord = store.read("one");
    const before = JSON.stringify(mockRecord);
    await renderWithProviders(<GlobalPresentation/>);
    await fireEvent.press(globalOpen());
    expect(await screen.findByRole("button", {name: "LEAVE FOR NOW"})).toBeOnTheScreen();
    expectGlobalCovered();
    expect(mockPush).not.toHaveBeenCalled();
    // Neither a second bar action nor a native removal replaces the first held push.
    await fireEvent.press(globalOpen(true));
    await departure({type: "RESET"});
    await press("LEAVE FOR NOW");
    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith("/brewRecord?id=rating-brew");
    expect(mockDispatch).not.toHaveBeenCalled();
    expect(JSON.stringify(store.read("one"))).toBe(before);
});

it("discards the global push on Stay and starts a write instead of replaying it on WRITE", async () => {
    changedDrafts(); offerRating();
    await renderWithProviders(<GlobalPresentation/>);
    await fireEvent.press(globalOpen());
    await press("Stay here");
    expect(mockPush).not.toHaveBeenCalled();
    await fireEvent.press(globalOpen());
    await press("WRITE TO MACHINE");
    expect(mockWrite).toHaveBeenCalledTimes(1);
    expect(mockPush).not.toHaveBeenCalled();
});

it.each(["writing", "saving", "cancelling"] as const)(
    "blocks the sibling bar and hides every sibling control while %s", async status => {
        changedDrafts(); offerRating();
        mockAttempt = {deviceId: "one", serial: "serial",
            operation: status === "cancelling" ? "cancel" : "write", status};
        await renderWithProviders(<GlobalPresentation/>);
        expectGlobalCovered();
        await fireEvent.press(globalOpen(true));
        await fireEvent.press(screen.getByLabelText("Rate 4 stars", {includeHiddenElements: true}));
        expect(mockPush).not.toHaveBeenCalled();
        expect(mockPrompt.rate).not.toHaveBeenCalled();
        expect(screen.queryByRole("button", {name: "LEAVE FOR NOW"})).toBeNull();
        expect(screen.queryByLabelText("Rate 4 stars")).toBeNull();
    }
);

it("keeps the sibling hidden for the success presentation without disabling native departure", async () => {
    changedDrafts(); offerRating();
    const saved = snapshotRecipe(mockAllRecipes[0]);
    mockRecord.written = {at: 1, slots: [saved, saved, saved]};
    mockAttempt = {deviceId: "one", serial: "serial", operation: "write", status: "success"};
    await renderWithProviders(<GlobalPresentation/>);
    expectGlobalCovered();
    expect(mockPreventRemove).toHaveBeenLastCalledWith(false, expect.any(Function));
    await fireEvent.press(globalOpen(true));
    expect(mockPush).not.toHaveBeenCalled();
});

it("covers the global sibling during the slot picker and releases it when the picker closes", async () => {
    offerRating();
    await renderWithProviders(<GlobalPresentation/>);
    await fireEvent.press(screen.getByRole("button", {name: "Change slot A recipe"}));
    expectGlobalCovered();
    await fireEvent.press(globalOpen(true));
    expect(mockPush).not.toHaveBeenCalled();
    await fireEvent.press(await screen.findByRole("button", {name: "Choose Whole library recipe"}));
    await waitFor(() => expect(globalOpen()).toBeOnTheScreen(), {timeout: SHEET_PRESS_TIMEOUT});
    await fireEvent.press(globalOpen());
    expect(mockPush).toHaveBeenCalledWith("/brewRecord?id=rating-brew");
});

it.each(["focus", "unmount"] as const)("releases the scoped guard on %s without disabling other routes", async kind => {
    changedDrafts(); offerRating();
    const view = await renderWithProviders(<GlobalPresentation/>);
    await fireEvent.press(globalOpen());
    expectGlobalCovered();
    if (kind === "focus") mockFocused = false;
    await view.rerender(<GlobalPresentation showEasy={kind !== "unmount"}/>);
    if (kind === "focus") {
        expect(mockPreventRemove).toHaveBeenLastCalledWith(false, expect.any(Function));
        expect((await departure()).preventDefault).not.toHaveBeenCalled();
    }
    expect(globalOpen()).toBeOnTheScreen();
    await fireEvent.press(globalOpen());
    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith("/brewRecord?id=rating-brew");
    if (kind === "focus") {
        mockFocused = true;
        await view.rerender(<GlobalPresentation/>);
        expect(mockPreventRemove).toHaveBeenLastCalledWith(true, expect.any(Function));
        expect(screen.queryByRole("button", {name: "LEAVE FOR NOW"})).toBeNull();
        expect(globalOpen()).toBeOnTheScreen();
        await fireEvent.press(globalOpen());
        expect(await screen.findByRole("button", {name: "LEAVE FOR NOW"})).toBeOnTheScreen();
        expect(mockPush).toHaveBeenCalledTimes(1);
    }
});

it("holds opening an actual run as view-only navigation and never dismisses or restarts it", async () => {
    changedDrafts();
    mockRun = {
        recipe: mockAllRecipes[0], samples: [], elapsed: 12,
        phase: {name: "pouring", pour: 1, pours: 1}, holding: false, heldSeconds: 0
    };
    const run = mockRun;
    await renderWithProviders(<GlobalPresentation/>);
    await fireEvent.press(screen.getByRole("button", {name: "Open the brew"}));
    expect(mockPush).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", {name: "Open the brew"})).toBeNull();
    await press("LEAVE FOR NOW");
    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith("/brew?view=1");
    expect(mockRun).toBe(run);
    expect(mockDismiss).not.toHaveBeenCalled();
});

it("updates the native prevention contract when bytes change and invalidates an obsolete reminder", async () => {
    changedDrafts();
    const saved = snapshotRecipe(mockAllRecipes[0]);
    mockRecord.written = {at: 1, slots: [saved, saved, saved]};
    const view = await renderWithProviders(<EasyModeScreen/>);
    expect(mockPreventRemove).toHaveBeenLastCalledWith(false, expect.any(Function));
    mockRecord.drafts[0] = snapshotRecipe(coffee("Different", 16));
    await view.rerender(<EasyModeScreen/>);
    expect(mockPreventRemove).toHaveBeenLastCalledWith(true, expect.any(Function));
    await departure();
    mockRecord.drafts[0] = saved;
    await view.rerender(<EasyModeScreen/>);
    expect(mockPreventRemove).toHaveBeenLastCalledWith(false, expect.any(Function));
    expect(screen.queryByRole("button", {name: "LEAVE FOR NOW"})).toBeNull();
    expect(mockDispatch).not.toHaveBeenCalled();
});

it("blocks native removal and global navigation even before any changed draft exists", async () => {
    offerRating(); mockRunning = true;
    await renderWithProviders(<GlobalPresentation/>);
    expect(mockPreventRemove).toHaveBeenLastCalledWith(true, expect.any(Function));
    expect((await departure()).preventDefault).toHaveBeenCalledTimes(1);
    expectGlobalCovered();
    await fireEvent.press(globalOpen(true));
    expect(mockPush).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", {name: "LEAVE FOR NOW"})).toBeNull();
});

it.each(["help", "retry", "cancel"] as const)("covers the global sibling during %s presentation", async kind => {
    changedDrafts(); offerRating();
    if (kind !== "help") {
        const saved = snapshotRecipe(mockAllRecipes[0]);
        mockRecord.journal = {
            id: "pending", serial: "serial", slots: [saved, saved, saved],
            frames: prepareSet(mockRecord.drafts), acknowledged: 0, inFlight: null, error: null
        };
    }
    await renderWithProviders(<GlobalPresentation/>);
    if (kind !== "help") {
        // An idle journal can leave with its reservation intact until a modal covers it.
        expect(mockPreventRemove).toHaveBeenLastCalledWith(false, expect.any(Function));
    }
    await fireEvent.press(screen.getByRole("button", {
        name: kind === "help" ? "About Easy Mode" : kind === "retry" ? "Retry slot write" : "Stop slot write"
    }));
    expectGlobalCovered();
    await fireEvent.press(globalOpen(true));
    expect(mockPush).not.toHaveBeenCalled();
    await waitFor(async () => {
        await fireEvent.press(screen.getByRole("button", {name: kind === "help" ? "Close" : "KEEP THIS WRITE"}));
        expect(globalOpen()).toBeOnTheScreen();
    }, {timeout: SHEET_PRESS_TIMEOUT});
});

describe("the reference ABC comparison on the route", () => {
    const identity = {deviceId: "one", serial: "serial"};
    const port = {available: true, acquire: async () => ({
        sendAndConfirm: async () => {}, confirmSaved: async () => {}, release: () => {}
    })};

    async function afterV2() {
        const store = new SlotDatabase(createTestDatabase());
        for (const i of [0, 1, 2] as const) store.assign("one", i, snapshotRecipe(mockAllRecipes[0]));
        for (const id of ["t1", "t2"]) {
            await writeTeaSlotProbe(store, identity, port, {id: () => id});
            await restoreTeaSlotOriginal(store, identity, port, {id: () => `r-${id}`});
        }
        return store;
    }

    it("does not offer fresh labs after historical probes", async () => {
        const store = await afterV2();
        mockRecord = store.read("one"); mockAvailable = true;
        await renderWithProviders(<EasyModeScreen/>);
        expect(screen.queryByText("LAB")).toBeNull();
        expect(mockLab).not.toHaveBeenCalled();
        expect(mockWrite).not.toHaveBeenCalled();
        expect(mockRestore).not.toHaveBeenCalled();
        expect(screen.queryByRole("button", {name: "WRITE STEEP TEST"})).toBeNull();
    });

    it("keeps retained matrix restoration accessible without exposing observation controls", async () => {
        const store = await afterV2();
        await writeTeaSlotProbe(store, identity, port, {id: () => "t3"});
        mockRecord = store.read("one"); mockAvailable = true;
        await renderWithProviders(<EasyModeScreen/>);
        expect(screen.getByRole("button", {name: "Write all three slots"})).toBeDisabled();
        expect(screen.queryByText("LAB")).toBeNull();
        await fireEvent.press(screen.getByRole("button", {name: "Restore original slot set"}));
        expect(mockRestore).toHaveBeenCalledTimes(1);
        expect(mockObserve).not.toHaveBeenCalled();
        expect(mockWrite).not.toHaveBeenCalled();
    });
});
