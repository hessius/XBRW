import React from "react";
import {act, fireEvent, screen, waitFor} from "@testing-library/react-native";
import {renderWithProviders, SHEET_PRESS_TIMEOUT} from "@/test-utils/render";
import {coffee} from "@/library/slots/__tests__/fixtures";
import {emptySlotRecord, prepareSet, snapshotRecipe} from "@/library/slots/slotModel";
import type {SlotAttempt} from "@/hooks/useEasyModeSlots";
import {createTestDatabase} from "@/test-utils/sqlite";
import {SlotDatabase} from "@/library/slots/SlotDatabase";
import {AccessibilityInfo} from "react-native";
import EasyModeScreen from "@/app/easyMode";

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
const mockWrite = jest.fn();
const mockReset = jest.fn();
type Action = {type: string; payload?: {count: number}};
type BeforeRemove = {data: {action: Action}; preventDefault: () => void};
const mockListeners = new Set<(event: BeforeRemove) => void>();
function mockRemove(action: Action = {type: "GO_BACK"}) {
    const event = {data: {action}, preventDefault: jest.fn()};
    for (const listener of mockListeners) listener(event);
    return event;
}
const mockDispatch = jest.fn((action: Action) => mockRemove(action));
const mockNavigation = {
    dispatch: mockDispatch,
    addListener: (name: string, listener: (event: BeforeRemove) => void) => {
        if (name === "beforeRemove") mockListeners.add(listener);
        return () => { mockListeners.delete(listener); };
    }
};
jest.mock("@/hooks/useLiveBrew", () => ({
    useLiveBrew: () => ({ratingNoteOpen: mockRatingNoteOpen})
}));
jest.mock("expo-router", () => ({
    useLocalSearchParams: () => mockParams,
    useNavigation: () => mockNavigation,
    router: {push: jest.fn(), back: () => mockRemove(), canGoBack: () => true},
    useRouter: () => ({back: jest.fn()})
}));
jest.mock("@/hooks/useMachine", () => ({
    useMachine: () => ({
        remembered: mockDeviceId, status: mockConnected ? "connected" : "disconnected",
        machine: {slotIdentity: mockConnected ? {deviceId: mockDeviceId, serial: mockSerial} : null,
            phase: mockBusy ? {name: "pouring"} : undefined}
    })
}));
jest.mock("@/hooks/useEasyModeSlots", () => ({
    ...jest.requireActual("@/hooks/useEasyModeSlots"),
    useEasyModeSlots: () => ({
        record: mockRecord, error: null,
        available: mockAvailable, running: mockRunning, attempt: mockAttempt,
        resetAttempt: mockReset,
        assign: jest.fn(), write: mockWrite, recover: jest.fn(), cancel: jest.fn()
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
});

function changedDrafts() {
    const saved = snapshotRecipe(mockAllRecipes[0]);
    mockRecord.drafts = [saved, saved, saved];
    mockAvailable = true;
}

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

it.each(["write", "recover", "cancel"] as const)("blocks departure throughout an active %s attempt", async (operation) => {
    changedDrafts(); mockRunning = true;
    mockAttempt = {deviceId: "one", serial: "serial", operation,
        status: operation === "cancel" ? "cancelling" : "writing"};
    await renderWithProviders(<EasyModeScreen/>);
    expect((await departure()).preventDefault).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", {name: "LEAVE FOR NOW"})).toBeNull();
    expect(mockDispatch).not.toHaveBeenCalled();
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
