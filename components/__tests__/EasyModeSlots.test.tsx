import React from "react";
import {fireEvent, screen, waitFor, within} from "@testing-library/react-native";
import {Dimensions, StyleSheet} from "react-native";
import {renderWithProviders, SHEET_PRESS_TIMEOUT} from "@/test-utils/render";
import EasyModeSlots from "@/components/EasyModeSlots";
import {emptySlotRecord, prepareSet, snapshotRecipe} from "@/library/slots/slotModel";
import {coffee} from "@/library/slots/__tests__/fixtures";
import {SLOT_INTEGRATION_BLOCK, unavailableSlotPort} from "@/library/slots/slotWriter";
import Recipe, {CUP_TYPE} from "@/library/Recipe";
import {createTestDatabase} from "@/test-utils/sqlite";
import {SlotDatabase} from "@/library/slots/SlotDatabase";
import {useEasyModeSlots} from "@/hooks/useEasyModeSlots";

const recipes = [coffee("Morning"), coffee("Evening")];
const props = () => ({
    record: emptySlotRecord(), recipes, deviceId: "one", connected: true,
    available: false, running: false, error: null,
    onAssign: jest.fn(), onWrite: jest.fn(), onRecover: jest.fn(), onCancel: jest.fn()
});

function PersistentSlots({store}: {store: SlotDatabase}) {
    const slots = useEasyModeSlots({deviceId: "one", serial: "serial"}, unavailableSlotPort, store);
    return <EasyModeSlots {...slots} recipes={recipes} deviceId="one" connected
        onAssign={slots.assign} onWrite={slots.write} onRecover={slots.recover} onCancel={slots.cancel}
        onDismissSuccess={slots.resetAttempt}/>;
}

it("puts readback limitations in help and shows one availability reason", async () => {
    await renderWithProviders(<EasyModeSlots {...props()}/>);
    expect(screen.queryByText(/cannot tell us what is already/i)).toBeNull();
    expect(screen.getByText("Writes A, B and C. Switches to EASY.")).toBeOnTheScreen();
    expect(screen.getByText(SLOT_INTEGRATION_BLOCK)).toBeOnTheScreen();
    expect(screen.getByRole("button", {name: "Write all three slots"})).toBeDisabled();
    await fireEvent.press(screen.getByRole("button", {name: "About Easy Mode"}));
    expect(await screen.findByText(/Changes made elsewhere cannot be read/)).toBeOnTheScreen();
    expect(screen.queryByRole("button", {name: "Write all three slots"})).toBeNull();
});

it("keeps the full overwrite warning outside the card scroll and adjacent to WRITE with valid drafts", async () => {
    const options = props();
    const saved = snapshotRecipe(recipes[0]);
    options.record.drafts = [saved, saved, saved];
    await renderWithProviders(<EasyModeSlots {...options} available/>);
    const warning = screen.getByText("Writes A, B and C. Switches to EASY.");
    expect(within(screen.getByTestId("easy-mode-cards")).queryByText(warning.props.children)).toBeNull();
    const actions = within(screen.getByTestId("easy-mode-actions"));
    expect(actions.getByText(warning.props.children)).toBeOnTheScreen();
    expect(actions.getByRole("button", {name: "Write all three slots"})).toBeEnabled();
    expect(actions.getByText("WRITE TO MACHINE")).toBeOnTheScreen();
    expect(warning.props.numberOfLines).toBeUndefined();
});

it.each([
    {width: 320, height: 568, scale: 2, fontScale: 1},
    {width: 320, height: 568, scale: 2, fontScale: 2},
    {width: 320, height: 568, scale: 2, fontScale: 3},
    {width: 393, height: 852, scale: 3, fontScale: 2}
])("keeps intrinsic action sizing and bounded overflow at viewport %p", async (window) => {
    const dimensions = jest.spyOn(Dimensions, "get").mockReturnValue(window);
    const options = props();
    const saved = snapshotRecipe(recipes[0]);
    options.record.drafts = [saved, saved, saved];
    try {
        await renderWithProviders(<EasyModeSlots {...options} available/>);
        const actions = screen.getByTestId("easy-mode-actions");
        const style = StyleSheet.flatten(actions.props.style);
        expect(style).toMatchObject({maxHeight: "60%", flexShrink: 1, flexGrow: 0});
        expect(style.height).toBeUndefined();
        expect(style.width).toBeUndefined();
        const warning = within(actions).getByText("Writes A, B and C. Switches to EASY.");
        expect(warning.props.numberOfLines).toBeUndefined();
        expect(warning.props.allowFontScaling).not.toBe(false);
        expect(within(actions).getByRole("button", {name: "Write all three slots"}))
            .toHaveStyle({height: "auto"});
        expect(screen.getByTestId("easy-mode-cards")).toHaveStyle({flex: 1, minHeight: 0});
    } finally {
        dimensions.mockRestore();
    }
});

it("offers explicit full-set replacement without mutating an existing slot", async () => {
    const options = props();
    const snapshot = snapshotRecipe(recipes[0]);
    options.record.drafts = [snapshot, snapshot, snapshot];
    await renderWithProviders(<EasyModeSlots {...options} incoming={recipes[1]}/>);
    expect(options.onAssign).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole("button", {name: "Put Evening in slot B"}));
    expect(options.onAssign).toHaveBeenCalledWith(1, recipes[1]);
});

it("keeps the incoming replacement available when persistence refuses assignment", async () => {
    const options = props();
    options.onAssign.mockReturnValue(false);
    await renderWithProviders(<EasyModeSlots {...options} incoming={recipes[1]}/>);
    await fireEvent.press(screen.getByRole("button", {name: "Put Evening in slot B"}));
    expect(screen.getByRole("button", {name: "Put Evening in slot B"})).toBeOnTheScreen();
});

it("does not resurrect an accepted incoming choice when the route rehydrates the same recipe", async () => {
    const options = props();
    const incoming = recipes[1];
    const view = await renderWithProviders(<EasyModeSlots {...options} incoming={incoming}/>);
    await fireEvent.press(screen.getByRole("button", {name: "Put Evening in slot B"}));
    expect(screen.queryByRole("button", {name: "Put Evening in slot B"})).toBeNull();
    await view.rerender(<EasyModeSlots {...options}
        incoming={new Recipe(undefined, JSON.stringify(incoming))}/>);
    expect(screen.queryByRole("button", {name: "Put Evening in slot B"})).toBeNull();
});

it("distinguishes removed recipes from edited drafts and permits only explicit updates", async () => {
    const options = props();
    const saved = snapshotRecipe(recipes[0]);
    options.record.drafts = [saved, snapshotRecipe(coffee("Removed")), null];
    const changed = coffee("Morning");
    changed.uuid = recipes[0].uuid;
    changed.pours[0].temperature = 92;
    await renderWithProviders(<EasyModeSlots {...options} recipes={[changed]}/>);
    expect(screen.getByText("RECIPE UPDATED")).toBeOnTheScreen();
    expect(screen.getByText("REMOVED FROM LIBRARY")).toBeOnTheScreen();
    expect(screen.getByText("USE UPDATED RECIPE")).toBeOnTheScreen();
    expect(screen.getByText("Morning")).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", {name: "Update slot A from library"}));
    expect(options.onAssign).toHaveBeenCalledWith(0, changed);
});

it("offers retry and confirmed cancellation without technical recovery jargon", async () => {
    const options = props();
    const saved = snapshotRecipe(recipes[0]);
    options.record.journal = {
        id: "attempt", serial: "serial", slots: [saved, saved, saved],
        frames: prepareSet([saved, saved, saved]), acknowledged: 1,
        inFlight: 1, error: "Receipt unknown"
    };
    await renderWithProviders(<EasyModeSlots {...options} available/>);
    expect(screen.getByText("A: received")).toBeOnTheScreen();
    expect(screen.getByText("B: not confirmed")).toBeOnTheScreen();
    expect(screen.getByText("C: pending")).toBeOnTheScreen();
    expect(screen.getByRole("button", {name: "Retry slot write"})).toBeEnabled();
    expect(screen.getByRole("button", {name: "Cancel slot write"})).toBeEnabled();
    expect(screen.queryByText(/verified recovery evidence|sending a frame/i)).toBeNull();
    expect(screen.queryByRole("button", {name: "Change slot A recipe"})).toBeNull();
    await fireEvent.press(screen.getByRole("button", {name: "Retry slot write"}));
    expect(options.onRecover).not.toHaveBeenCalled();
    await waitFor(async () => {
        await fireEvent.press(screen.getByRole("button", {name: "Confirm machine is back to normal and retry"}));
        expect(options.onRecover).toHaveBeenCalledWith(true);
    }, {timeout: SHEET_PRESS_TIMEOUT});
});

it("compares bytes, keeps snapshot identity and clears dirty status when bytes return", async () => {
    const options = props();
    const recipe = coffee("Original");
    recipe.grinder = false;
    const saved = snapshotRecipe(recipe);
    options.record.drafts = [saved, saved, saved];
    options.record.written = {at: 1000, slots: [saved, saved, saved]};
    const renamed = new Recipe(undefined, JSON.stringify(recipe));
    renamed.name = "Renamed";
    const view = await renderWithProviders(<EasyModeSlots {...options} recipes={[renamed]} available/>);
    expect(screen.getAllByText("LAST WRITTEN")).toHaveLength(3);
    expect(screen.getByText("0 slots not written")).toBeOnTheScreen();
    expect(screen.queryByText("RECIPE UPDATED")).toBeNull();
    expect(screen.queryByText("Renamed")).toBeNull();
    expect(screen.getAllByText(/GRIND OFF/)).toHaveLength(3);
    expect(screen.getByTestId("slot-A-profile")).toBeOnTheScreen();
    const changed = coffee("Different bytes");
    options.record.drafts[1] = snapshotRecipe(changed);
    await view.rerender(<EasyModeSlots {...options} available/>);
    expect(screen.getByText("1 slot not written")).toBeOnTheScreen();
    expect(screen.getAllByText("NOT WRITTEN")).toHaveLength(1);
    options.record.drafts[1] = saved;
    await view.rerender(<EasyModeSlots {...options} available/>);
    expect(screen.queryByText("NOT WRITTEN")).toBeNull();
    expect(screen.getByRole("button", {name: "Write all three slots"})).toBeEnabled();
});

it("keeps the picker selection on storage failure and searches the full supplied library", async () => {
    const options = props();
    options.onAssign.mockReturnValue(false);
    await renderWithProviders(<EasyModeSlots {...options}/>);
    await fireEvent.press(screen.getByRole("button", {name: "Change slot A recipe"}));
    await fireEvent.changeText(await screen.findByLabelText("Search recipes"), "Even");
    expect(screen.queryByText("Morning")).toBeNull();
    expect(screen.getByText("Evening")).toBeOnTheScreen();
    await waitFor(async () => {
        await fireEvent.press(screen.getByRole("button", {name: "Choose Evening"}));
        expect(options.onAssign).toHaveBeenCalledWith(0, recipes[1]);
    }, {timeout: SHEET_PRESS_TIMEOUT});
    expect(screen.getByRole("button", {name: "Choose Evening"})).toBeOnTheScreen();
    expect(screen.queryByRole("button", {name: "Write all three slots"})).toBeNull();
});

it.each([null, 1] as const)("offers deliberate still-saving recovery for B boundary %p", async (inFlight) => {
    const options = props();
    const saved = snapshotRecipe(recipes[0]);
    options.record.journal = {
        id: "attempt", serial: "serial", slots: [saved, saved, saved],
        frames: prepareSet([saved, saved, saved]), acknowledged: 1, inFlight, error: "Receipt unknown"
    };
    await renderWithProviders(<EasyModeSlots {...options} available/>);
    expect(screen.getByText("Writing stopped at B.")).toBeOnTheScreen();
    expect(screen.queryByText("LAST WRITTEN")).toBeNull();
    await fireEvent.press(screen.getByRole("button", {name: "Retry slot write"}));
    expect(await screen.findByText(/may already have arrived.*same set/)).toBeOnTheScreen();
    await waitFor(async () => {
        await fireEvent.press(screen.getByRole("button", {name: "Finish write while machine is still saving"}));
        expect(options.onRecover).toHaveBeenCalledWith(false);
    }, {timeout: SHEET_PRESS_TIMEOUT});
});

it("offers observe-only recovery after three receipts without inventing a fourth slot", async () => {
    const options = props();
    const saved = snapshotRecipe(recipes[0]);
    options.record.journal = {
        id: "attempt", serial: "serial", slots: [saved, saved, saved],
        frames: prepareSet([saved, saved, saved]), acknowledged: 3, inFlight: null, error: null
    };
    await renderWithProviders(<EasyModeSlots {...options} available/>);
    expect(screen.getByText("Saving was not confirmed.")).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", {name: "Retry slot write"}));
    expect(await screen.findByText(/waits for a fresh save confirmation.*does not resend/)).toBeOnTheScreen();
    await waitFor(async () => {
        await fireEvent.press(screen.getByRole("button", {name: "Finish write while machine is still saving"}));
        expect(options.onRecover).toHaveBeenCalledWith(false);
    }, {timeout: SHEET_PRESS_TIMEOUT});
});

it("keeps applicable automatic protection limitations visible next to WRITE", async () => {
    const options = props();
    const recipe = coffee();
    recipe.cupType = CUP_TYPE.OTHER;
    recipe.overflowProtection = {retainedGrams: 60, checkSeconds: 15};
    const saved = snapshotRecipe(recipe);
    options.record.drafts = [saved, saved, saved];
    await renderWithProviders(<EasyModeSlots {...options} available/>);
    expect(within(screen.getByTestId("easy-mode-actions"))
        .getByText(/Stored slots do not run.*automatic pause protection/)).toBeOnTheScreen();
});

it("validates library updates instead of altering an invalid edited recipe", async () => {
    const options = props();
    const original = coffee("Saved snapshot");
    const saved = snapshotRecipe(original);
    options.record.drafts[0] = saved;
    original.bypassEnabled = true;
    await renderWithProviders(<EasyModeSlots {...options} recipes={[original]}/>);
    expect(screen.getByRole("button", {name: "Update slot A from library"})).toBeDisabled();
    expect(screen.getByText(/Recipes with bypass are not supported/)).toBeOnTheScreen();
    expect(options.onAssign).not.toHaveBeenCalled();
});

it("shows only the highest-priority availability reason, not a warning stack", async () => {
    await renderWithProviders(<EasyModeSlots {...props()} busy connected={false} serialMatches={false}/>);
    expect(screen.getByText(/belongs to a different machine/)).toBeOnTheScreen();
    expect(screen.queryByText(SLOT_INTEGRATION_BLOCK)).toBeNull();
    expect(screen.queryByText(/running or held brew/)).toBeNull();
    expect(screen.queryByText(/Connect to this machine/)).toBeNull();
});

it("shows the last-written time once and treats a new source with identical bytes as written", async () => {
    const options = props();
    const saved = snapshotRecipe(recipes[0]);
    const otherSource = coffee("Another name");
    options.record.drafts = [snapshotRecipe(otherSource), saved, saved];
    options.record.written = {at: 1000, slots: [saved, saved, saved]};
    await renderWithProviders(<EasyModeSlots {...options} recipes={[...recipes, otherSource]} available/>);
    expect(screen.getAllByText(/Last written by XBRW\+\+/)).toHaveLength(1);
    expect(screen.getAllByText("LAST WRITTEN")).toHaveLength(3);
    expect(screen.getByText("0 slots not written")).toBeOnTheScreen();
    expect(screen.getByRole("button", {name: "Write all three slots"})).toBeEnabled();
});

it("requires confirmation before cancelling and hides the underlying screen", async () => {
    const options = props();
    const saved = snapshotRecipe(recipes[0]);
    options.record.journal = {
        id: "attempt", serial: "serial", slots: [saved, saved, saved],
        frames: prepareSet([saved, saved, saved]), acknowledged: 0,
        inFlight: 0, error: null
    };
    await renderWithProviders(<EasyModeSlots {...options} available/>);
    await fireEvent.press(screen.getByRole("button", {name: "Cancel slot write"}));
    expect(options.onCancel).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", {name: "Retry slot write"})).toBeNull();
    expect(await screen.findByText(/does not stop a write on the machine/i)).toBeOnTheScreen();
    await waitFor(async () => {
        await fireEvent.press(screen.getByRole("button", {name: "Confirm machine is back to normal and cancel"}));
        expect(options.onCancel).toHaveBeenCalledTimes(1);
    }, {timeout: SHEET_PRESS_TIMEOUT});
});

it("picks from all supplied library recipes and exposes unsupported recipe reasons", async () => {
    const options = props();
    const bypass = coffee("Bypass");
    bypass.bypassEnabled = true;
    await renderWithProviders(<EasyModeSlots {...options} recipes={[...recipes, bypass]}/>);
    await fireEvent.press(screen.getByRole("button", {name: "Change slot C recipe"}));
    expect(await screen.findByText("Evening")).toBeOnTheScreen();
    expect(await screen.findByText(/Recipes with bypass are not supported/)).toBeOnTheScreen();
    expect(screen.getByRole("button", {name: "Choose Bypass"})).toBeDisabled();
    expect(screen.getByRole("button", {name: "Choose Bypass"}).props.accessibilityHint)
        .toMatch(/Recipes with bypass are not supported/);
    await waitFor(async () => {
        await fireEvent.press(screen.getByRole("button", {name: "Choose Evening"}));
        expect(options.onAssign).toHaveBeenCalledWith(2, recipes[1]);
    }, {timeout: SHEET_PRESS_TIMEOUT});
});

it("persists a picked snapshot immediately and restores it after reopening the screen", async () => {
    const sql = createTestDatabase();
    const store = new SlotDatabase(sql);
    const view = await renderWithProviders(<PersistentSlots store={store}/>);
    await fireEvent.press(screen.getByRole("button", {name: "Change slot C recipe"}));
    await waitFor(async () => {
        await fireEvent.press(screen.getByRole("button", {name: "Choose Evening"}));
        expect(store.read("one").drafts[2]?.name).toBe("Evening");
    }, {timeout: SHEET_PRESS_TIMEOUT});
    await waitFor(() => expect(screen.queryByRole("button", {name: "Choose Evening"})).toBeNull(),
        {timeout: SHEET_PRESS_TIMEOUT});
    await view.unmount();
    await renderWithProviders(<PersistentSlots store={new SlotDatabase(sql)}/>);
    expect(within(screen.getByTestId("slot-C")).getByText("Evening")).toBeOnTheScreen();
    expect(screen.getByText("1 slot not written")).toBeOnTheScreen();
});

it("keeps the searchable picker and exposes the real storage failure inside it", async () => {
    const sql = createTestDatabase();
    const store = new SlotDatabase(sql);
    sql.execSync("CREATE TRIGGER fail_slot BEFORE INSERT ON easy_mode_slots BEGIN SELECT RAISE(ABORT, 'disk full'); END;");
    await renderWithProviders(<PersistentSlots store={store}/>);
    await fireEvent.press(screen.getByRole("button", {name: "Change slot A recipe"}));
    await waitFor(async () => {
        await fireEvent.press(screen.getByRole("button", {name: "Choose Morning"}));
        expect(screen.getByRole("alert")).toHaveTextContent(/disk full/);
    }, {timeout: SHEET_PRESS_TIMEOUT});
    expect(screen.getByRole("button", {name: "Choose Morning"})).toBeOnTheScreen();
    expect(new SlotDatabase(sql).read("one").drafts[0]).toBeNull();
});
