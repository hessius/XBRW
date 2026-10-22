import React from "react";
import {act, fireEvent, screen, waitFor, within} from "@testing-library/react-native";
import {AccessibilityInfo, Dimensions, processColor, StyleSheet} from "react-native";
import {renderWithProviders, Providers, SHEET_PRESS_TIMEOUT} from "@/test-utils/render";
import EasyModeSlots from "@/components/EasyModeSlots";
import EasyModeSlotCard from "@/components/EasyModeSlotCard";
import {emptySlotRecord, prepareSet, snapshotRecipe} from "@/library/slots/slotModel";
import {coffee} from "@/library/slots/__tests__/fixtures";
import {SLOT_INTEGRATION_BLOCK, unavailableSlotPort} from "@/library/slots/slotWriter";
import Recipe, {CUP_TYPE} from "@/library/Recipe";
import Pour from "@/library/Pour";
import {createTestDatabase} from "@/test-utils/sqlite";
import {SlotDatabase} from "@/library/slots/SlotDatabase";
import {useEasyModeSlots} from "@/hooks/useEasyModeSlots";
import {palette, resolveAppearance} from "@/constants/colors";
import {DEFAULT_APPEARANCE, THEME_IDS} from "@/library/appearance";
import {resolveAccent} from "@/library/accent";
import * as motion from "@/constants/motion";
import {restoreTeaSlotOriginal, writeTeaSlotProbe} from "@/library/slots/teaSlotProbe";
import {buildProfilePath, PROFILE_BLEED} from "@/components/PourProfile";
import {DOTO_FAMILIES} from "@/components/DotMatrixText";

const recipes = [coffee("Morning"), coffee("Evening")];
const native = jest.requireActual<typeof import("react-native")>("react-native");
const props = () => ({
    record: emptySlotRecord(), recipes, deviceId: "one", connected: true,
    available: false, running: false, error: null,
    onAssign: jest.fn(), onWrite: jest.fn(), onRecover: jest.fn(), onCancel: jest.fn()
});

it.each(THEME_IDS.flatMap(theme => (["original", "themed"] as const).map(recipeColours =>
    ({theme, recipeColours}))))("draws chooser silhouettes on their actual card ground: %j", async choice => {
    const recipe = coffee("Sky");
    recipe.accentIndex = 0;
    const colour = resolveAppearance(choice).recipe(resolveAccent(recipe));
    await renderWithProviders(<EasyModeSlots {...props()} recipes={[recipe]}/>, {
        wrapper: ({children}: {children: React.ReactNode}) =>
            <Providers appearance={choice}>{children}</Providers>
    });
    await fireEvent.press(screen.getByRole("button", {name: "Change slot C recipe"}));
    const card = await screen.findByRole("button", {name: "Choose Sky"});
    expect(within(card).getByTestId("recipe-choice-surface")).toHaveStyle({backgroundColor: colour.fill});
    const profile = within(card).getByTestId("profile-wash", {includeHiddenElements: true});
    expect(profile.props.fill).toEqual({type: 0, payload: processColor(colour.onAccent.profileFill)});
    const line = within(card).getByTestId("profile-line", {includeHiddenElements: true});
    expect(line.props.stroke).toEqual({type: 0, payload: processColor(colour.onAccent.profileStroke)});
    expect(line.props.d).toBe(buildProfilePath(recipe.pours, 80, 24));
});

it.each([1, 3])("keeps the Scale hit target at least 44pt without changing its visual size at font scale %p",
    async (fontScale) => {
        const dimensions = jest.spyOn(Dimensions, "get").mockReturnValue({
            width: 320, height: 568, scale: 2, fontScale
        });
        try {
            const options = props();
            options.record.drafts[0] = snapshotRecipe(recipes[0]);
            await renderWithProviders(<EasyModeSlots {...options} onSetScaleEnabled={jest.fn()}/>);
            const scale = screen.getByRole("switch", {name: "Scale for slot A"});
            expect(scale).toHaveStyle({width: 46, height: 23, minHeight: 23});
            expect(scale.props.hitSlop).toEqual({top: 10.5, bottom: 10.5, left: 0, right: 0});
            const {width, height} = StyleSheet.flatten(scale.props.style);
            const {top, bottom, left, right} = scale.props.hitSlop;
            expect(width + left + right).toBeGreaterThanOrEqual(44);
            expect(height + top + bottom).toBeGreaterThanOrEqual(44);
            // RN clips hitSlop at the parent: padding keeps it inside even when the label wraps.
            const group = screen.getByTestId("slot-A-scale");
            expect(group).toHaveStyle({minHeight: 44, paddingTop: top, paddingBottom: bottom});
            expect(group.props.onPress).toBeUndefined();
            expect(group.props.onStartShouldSetResponder).toBeUndefined();
            const footer = screen.getByTestId("slot-A-footer");
            expect(footer).toHaveStyle({gap: 13, flexWrap: "wrap"});
            expect(footer.props.onPress).toBeUndefined();
            expect(within(footer).getByRole("button", {name: "Change slot A recipe"}).props.hitSlop)
                .toBeUndefined();
        } finally {
            dimensions.mockRestore();
        }
    });

it("presses Scale exactly once independently of CHANGE and retains checked and disabled behavior", async () => {
    const snapshot = snapshotRecipe(recipes[0]);
    const onSetScaleEnabled = jest.fn();
    const onChange = jest.fn();
    const cardProps = {
        index: 0 as const, snapshot, needsWrite: true, status: null, recovery: false,
        locked: false, updateProblem: null, onChange, onUpdate: jest.fn(), onSetScaleEnabled
    };
    const view = await renderWithProviders(<EasyModeSlotCard {...cardProps}/>);
    const scale = () => screen.getByRole("switch", {name: "Scale for slot A"});
    expect(scale()).not.toBeChecked();
    await fireEvent.press(scale());
    expect(onSetScaleEnabled).toHaveBeenCalledTimes(1);
    expect(onSetScaleEnabled).toHaveBeenLastCalledWith(true);
    expect(onChange).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole("button", {name: "Change slot A recipe"}));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onSetScaleEnabled).toHaveBeenCalledTimes(1);
    await view.rerender(<EasyModeSlotCard {...cardProps} snapshot={{...snapshot, scaleEnabled: true}}/>);
    expect(scale()).toBeChecked();
    expect(screen.getByText("SCALE ON")).toBeOnTheScreen();
    await fireEvent.press(scale());
    expect(onSetScaleEnabled).toHaveBeenCalledTimes(2);
    expect(onSetScaleEnabled).toHaveBeenLastCalledWith(false);
    await view.rerender(<EasyModeSlotCard {...cardProps} locked/>);
    expect(scale()).toBeDisabled();
    await fireEvent.press(scale());
    expect(onSetScaleEnabled).toHaveBeenCalledTimes(2);
    expect(onChange).toHaveBeenCalledTimes(1);
});

it("hides LAB while keeping retained original restoration on the normal screen", async () => {
    const store = new SlotDatabase(createTestDatabase());
    for (const i of [0, 1, 2] as const) store.assign("one", i, snapshotRecipe(recipes[0]));
    const port = {available: true, acquire: async () => ({
        sendAndConfirm: async () => {}, confirmSaved: async () => {}, release: () => {}
    })};
    await writeTeaSlotProbe(store, {deviceId: "one", serial: "serial"}, port);
    const onRestoreOriginal = jest.fn();
    await renderWithProviders(<EasyModeSlots {...props()} available record={store.read("one")}
        onRestoreOriginal={onRestoreOriginal}/>);
    expect(screen.queryByText("LAB")).toBeNull();
    expect(screen.getByRole("button", {name: "Restore original slot set"})).toBeEnabled();
    await fireEvent.press(screen.getByRole("button", {name: "Restore original slot set"}));
    expect(onRestoreOriginal).toHaveBeenCalledTimes(1);
});

it("confirms normal recovery without requiring the user to wait for a stuck saving screen", async () => {
    const onDismissWrite = jest.fn();
    await renderWithProviders(<EasyModeSlots {...interruptedOptions()} available onDismissWrite={onDismissWrite}/>);
    await fireEvent.press(screen.getByRole("button", {name: "Stop slot write"}));
    expect(onDismissWrite).not.toHaveBeenCalled();
    expect(await screen.findByText(/returns the machine to normal.*slot contents remain unconfirmed/i)).toBeOnTheScreen();
    await waitFor(async () => {
        await fireEvent.press(screen.getByRole("button", {name: "Confirm stop slot write"}));
        expect(onDismissWrite).toHaveBeenCalledTimes(1);
    }, {timeout: SHEET_PRESS_TIMEOUT});
});

it("shows a normal tea slot as steeps and water rather than coffee ratio and grind settings", async () => {
    const recipe = coffee("Two steeps");
    recipe.cupType = CUP_TYPE.TEA;
    recipe.grinder = false;
    recipe.dosage = 6;
    recipe.ratio = 30;
    recipe.pours = Array.from({length: 2}, (_, i) => new Pour(i + 1, 90, 92, 35, 0, 2, 20));
    const options = props();
    options.record.drafts[0] = snapshotRecipe(recipe);
    await renderWithProviders(<EasyModeSlots {...options} available/>);
    const card = within(screen.getByTestId("slot-A"));
    expect(card.getByText("2 STEEPS · 180ML · GRIND OFF")).toBeOnTheScreen();
    expect(card.queryByText(/1:30/)).toBeNull();
    const band = card.getByTestId("slot-A-profile-band", {includeHiddenElements: true});
    expect(band).toHaveStyle({height: 45, marginHorizontal: -14, overflow: "hidden"});
    expect(card.queryByTestId("slot-A-profile", {includeHiddenElements: true})).toBeNull();
    await fireEvent(band, "layout", {nativeEvent: {layout: {width: 320, height: 45, x: 0, y: 0}}});
    const profile = card.getByTestId("slot-A-profile", {includeHiddenElements: true});
    expect(profile.props.width).toBe(320 + 2 * PROFILE_BLEED);
    expect(profile.props.height).toBe(45 + 2 * PROFILE_BLEED);
    expect(screen.getByRole("button", {name: "Change slot A recipe"})).toBeEnabled();
});

function PersistentSlots({store, libraryRecipes = recipes}: {store: SlotDatabase; libraryRecipes?: Recipe[]}) {
    const slots = useEasyModeSlots({deviceId: "one", serial: "serial"}, unavailableSlotPort, store);
    return <EasyModeSlots {...slots} recipes={libraryRecipes} deviceId="one" connected
        onAssign={slots.assign} onWrite={slots.write} onRecover={slots.recover} onCancel={slots.cancel}
        onSetScaleEnabled={slots.setScaleEnabled}
        onDismissSuccess={slots.resetAttempt}/>;
}

it("toggles each assigned slot independently and persists until WRITE", async () => {
    const sql = createTestDatabase();
    const store = new SlotDatabase(sql);
    const saved = snapshotRecipe(recipes[0]);
    for (const index of [0, 1, 2] as const) store.assign("one", index, saved);
    await renderWithProviders(<PersistentSlots store={store}/>);
    const scale = (name: string) => screen.getByRole("switch", {name: `Scale for slot ${name}`});
    expect(scale("A")).not.toBeChecked();
    expect(scale("B")).not.toBeChecked();
    await fireEvent(scale("A"), "onCheckedChange", true);
    expect(scale("A")).toBeChecked();
    expect(scale("B")).not.toBeChecked();
    expect(within(screen.getByTestId("slot-A")).getByText("SCALE ON")).toBeOnTheScreen();
    expect(within(screen.getByTestId("slot-B")).getByText("SCALE OFF")).toBeOnTheScreen();
    expect(screen.queryByText("RECIPE UPDATED")).toBeNull();
    expect(new SlotDatabase(sql).read("one").drafts[0]?.scaleEnabled).toBe(true);
    expect(store.read("one").written).toBeNull();
    await fireEvent(scale("B"), "onCheckedChange", true);
    await fireEvent(scale("A"), "onCheckedChange", false);
    expect(scale("A")).not.toBeChecked();
    expect(scale("B")).toBeChecked();
    await fireEvent.press(screen.getByRole("button", {name: "About Easy Mode"}));
    expect(await screen.findByText(/automatically tares.*slot.*started/i)).toBeOnTheScreen();
    expect(screen.getByText(/scale changes.*WRITE TO MACHINE/i)).toBeOnTheScreen();
});

it("retains the slot's selected scale when accepting updated library content", async () => {
    const store = new SlotDatabase(createTestDatabase());
    const recipe = recipes[0];
    store.assign("one", 0, snapshotRecipe(recipe));
    store.setScaleEnabled("one", 0, true);
    const updated = new Recipe(undefined, JSON.stringify(recipe));
    updated.pours[0].temperature = 92;
    await renderWithProviders(<PersistentSlots store={store} libraryRecipes={[updated]}/>);
    expect(screen.getByRole("switch", {name: "Scale for slot A"})).toBeChecked();
    await fireEvent.press(screen.getByRole("button", {name: "Update slot A from library"}));
    expect(screen.getByRole("switch", {name: "Scale for slot A"})).toBeChecked();
    expect(screen.queryByText("RECIPE UPDATED")).toBeNull();
    expect(store.read("one").drafts[0]?.blob).toEqual(snapshotRecipe(updated).blob);
});

it("shows no scale control for an empty slot and disables it without an optional handler", async () => {
    const options = props();
    options.record.drafts[0] = snapshotRecipe(recipes[0]);
    await renderWithProviders(<EasyModeSlots {...options}/>);
    expect(screen.getByRole("switch", {name: "Scale for slot A"})).toBeDisabled();
    expect(screen.queryByRole("switch", {name: "Scale for slot B"})).toBeNull();
    const empty = within(screen.getByTestId("slot-B"));
    expect(empty.getByText("B")).toBeOnTheScreen();
    expect(empty.getByText("CHOOSE RECIPE")).toBeOnTheScreen();
    expect(empty.queryByTestId("slot-B-profile-band", {includeHiddenElements: true})).toBeNull();
    expect(empty.queryByText(/SCALE|NOT WRITTEN|LAST WRITTEN/)).toBeNull();
});

it("locks scale during operations and active fixed trials, and omits it from recovery probes", async () => {
    const store = new SlotDatabase(createTestDatabase());
    for (const index of [0, 1, 2] as const) store.assign("one", index, snapshotRecipe(recipes[0]));
    const onSetScaleEnabled = jest.fn();
    const view = await renderWithProviders(<EasyModeSlots {...props()} record={store.read("one")}
        running onSetScaleEnabled={onSetScaleEnabled}/>);
    expect(screen.getByRole("switch", {name: "Scale for slot A", includeHiddenElements: true})).toBeDisabled();
    await writeTeaSlotProbe(store, {deviceId: "one", serial: "serial"}, {
        available: true, acquire: async () => ({
            sendAndConfirm: async () => {}, confirmSaved: async () => {}, release: () => {}
        })
    });
    await view.rerender(<EasyModeSlots {...props()} record={store.read("one")}
        onSetScaleEnabled={onSetScaleEnabled}/>);
    expect(screen.queryByRole("switch", {name: "Scale for slot A"})).toBeNull();
    expect(screen.queryByTestId("slot-A-profile-band", {includeHiddenElements: true})).toBeNull();
    expect(screen.getByRole("switch", {name: "Scale for slot B"})).toBeDisabled();
    expect(onSetScaleEnabled).not.toHaveBeenCalled();
    await view.rerender(<EasyModeSlots {...interruptedOptions()} onSetScaleEnabled={onSetScaleEnabled}/>);
    expect(screen.queryByRole("switch")).toBeNull();
});

it("uses accent slabs with a measured full-width profile band and wrapping shared footer", async () => {
    const options = props();
    const recipe = coffee("Hunkute - DROP COFFEE ROASTERS");
    const saved = snapshotRecipe(recipe);
    options.record.drafts = [saved, saved, saved];
    await renderWithProviders(<EasyModeSlots {...options} recipes={[recipe]} available/>);
    const card = screen.getByTestId("slot-A");
    expect(card).toHaveStyle({
        backgroundColor: resolveAccent(recipe), paddingTop: 14, paddingBottom: 14,
        paddingLeft: 14, paddingRight: 14, borderTopLeftRadius: 18, borderTopRightRadius: 18,
        borderBottomLeftRadius: 18, borderBottomRightRadius: 18
    });
    expect(StyleSheet.flatten(card.props.style).height).toBeUndefined();
    expect(StyleSheet.flatten(card.props.style).overflow).not.toBe("hidden");
    const identity = within(card).getByText(saved.name);
    expect(identity).toHaveStyle({fontSize: 16, fontWeight: "600"});
    expect(StyleSheet.flatten(identity.props.style).fontFamily).not.toBe(DOTO_FAMILIES.bold);
    expect(identity.props.numberOfLines).toBeUndefined();
    expect(identity.props.allowFontScaling).not.toBe(false);
    const heading = within(screen.getByTestId("slot-A-heading"));
    expect(heading.getByText("A")).toHaveStyle({fontSize: 24, fontFamily: DOTO_FAMILIES.bold});
    expect(heading.getByText("NOT WRITTEN")).toHaveStyle({fontSize: 11, fontFamily: DOTO_FAMILIES.bold});
    const details = within(screen.getByTestId("slot-A-details"));
    const figures = details.getByText(/GRIND/);
    expect(figures).toHaveStyle({fontSize: 11, fontFamily: DOTO_FAMILIES.bold});
    expect(figures.props.numberOfLines).toBeUndefined();
    expect(details.queryByRole("button")).toBeNull();
    const footer = screen.getByTestId("slot-A-footer");
    expect(footer).toHaveStyle({alignItems: "center", justifyContent: "space-between", flexWrap: "wrap"});
    const controls = within(footer);
    expect(controls.getByRole("switch", {name: "Scale for slot A"})).toBeOnTheScreen();
    expect(controls.getByText("SCALE OFF")).toHaveStyle({fontSize: 11, fontFamily: DOTO_FAMILIES.bold});
    expect(controls.getByText("CHANGE")).toHaveStyle({fontSize: 11, fontFamily: DOTO_FAMILIES.bold});
    expect(controls.getByRole("button", {name: "Change slot A recipe"})).toHaveStyle({
        height: "auto", minHeight: 44,
        backgroundColor: resolveAppearance(DEFAULT_APPEARANCE).recipe(resolveAccent(recipe)).onAccent.key
    });
    const band = screen.getByTestId("slot-A-profile-band", {includeHiddenElements: true});
    expect(band).toHaveStyle({height: 45, marginHorizontal: -14, overflow: "hidden"});
    const bandStyle = StyleSheet.flatten(band.props.style);
    expect(bandStyle.marginLeft ?? bandStyle.marginHorizontal).toBe(-14);
    expect(bandStyle.marginRight ?? bandStyle.marginHorizontal).toBe(-14);
    expect(band.props.pointerEvents).toBe("none");
    expect(band.props.accessibilityElementsHidden).toBe(true);
    expect(band.props.importantForAccessibility).toBe("no-hide-descendants");
    expect(screen.queryByTestId("slot-A-profile-watermark", {includeHiddenElements: true})).toBeNull();
    expect(screen.queryByTestId("slot-A-profile", {includeHiddenElements: true})).toBeNull();
    await fireEvent(band, "layout", {nativeEvent: {layout: {width: 320, height: 45, x: 0, y: 0}}});
    let profile = screen.getByTestId("slot-A-profile", {includeHiddenElements: true});
    expect(profile.props.width).toBe(320 + 2 * PROFILE_BLEED);
    expect(profile.props.height).toBe(45 + 2 * PROFILE_BLEED);
    await fireEvent(band, "layout", {nativeEvent: {layout: {width: 240, height: 45, x: 0, y: 0}}});
    profile = screen.getByTestId("slot-A-profile", {includeHiddenElements: true});
    expect(profile.props.width).toBe(240 + 2 * PROFILE_BLEED);
    expect(profile.props.height).toBe(45 + 2 * PROFILE_BLEED);
    expect(screen.getByRole("button", {name: "About Easy Mode"})).toHaveStyle({backgroundColor: palette.none});
    expect(screen.getByRole("button", {name: "Write all three slots"})).toHaveStyle({
        backgroundColor: palette.text,
        color: resolveAppearance(DEFAULT_APPEARANCE).onFill(palette.text).text
    });
});

it("gives interruption its own scrollable recovery stage instead of stacking it below the editing slabs", async () => {
    await renderWithProviders(<EasyModeSlots {...interruptedOptions()} available/>);
    expect(screen.queryByTestId("slot-A-profile")).toBeNull();
    const recovery = within(screen.getByTestId("easy-mode-recovery"));
    expect(recovery.getByText("Writing stopped at B.")).toBeOnTheScreen();
    expect(recovery.getByText("A: received")).toBeOnTheScreen();
    expect(recovery.getByRole("button", {name: "Retry slot write"})).toHaveStyle({backgroundColor: palette.text});
    expect(recovery.getByRole("button", {name: "Cancel slot write"})).toHaveStyle({backgroundColor: palette.raised});
    expect(recovery.getByText(/Your recipes are kept.*saving animation usually clears/)).toBeOnTheScreen();
});

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

it("presents an unresolved probe as a steep rather than coffee ratio or a removed library recipe", async () => {
    const store = new SlotDatabase(createTestDatabase());
    for (const i of [0, 1, 2] as const) store.assign("one", i, snapshotRecipe(recipes[0]));
    await expect(writeTeaSlotProbe(store, {deviceId: "one", serial: "serial"}, {
        available: true, acquire: async () => ({
            sendAndConfirm: async () => { throw new Error("Receipt unknown"); },
            confirmSaved: async () => {}, release: () => {}
        })
    })).rejects.toThrow();
    await renderWithProviders(<EasyModeSlots {...props()} record={store.read("one")} available/>);
    const probe = within(screen.getByTestId("slot-A"));
    expect(probe.getByText("1 STEEP · 60ML · 70C · 60S · GRIND OFF")).toBeOnTheScreen();
    expect(probe.queryByText(/1:12|REMOVED FROM LIBRARY|RECIPE UPDATED/)).toBeNull();
    expect(probe.queryByTestId("slot-A-profile")).toBeNull();
    expect(screen.getByRole("button", {name: "Retry slot write"})).toBeEnabled();
    expect(screen.queryByRole("button", {name: "Write all three slots"})).toBeNull();
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
    expect(screen.queryByText("LAST WRITTEN")).toBeNull();
    expect(screen.queryByText("NOT WRITTEN")).toBeNull();
    expect(screen.getAllByText(/Last written by XBRW\+\+/)).toHaveLength(1);
    expect(screen.getByText("0 CHANGES")).toBeOnTheScreen();
    expect(screen.queryByText("RECIPE UPDATED")).toBeNull();
    expect(screen.queryByText("Renamed")).toBeNull();
    expect(screen.getAllByText(/GRIND OFF/)).toHaveLength(3);
    expect(screen.getByTestId("slot-A-profile-band", {includeHiddenElements: true})).toBeOnTheScreen();
    const changed = coffee("Different bytes");
    options.record.drafts[1] = snapshotRecipe(changed);
    await view.rerender(<EasyModeSlots {...options} available/>);
    expect(screen.getByText("1 CHANGE")).toBeOnTheScreen();
    expect(screen.getAllByText("NOT WRITTEN")).toHaveLength(1);
    options.record.drafts[1] = saved;
    await view.rerender(<EasyModeSlots {...options} available/>);
    expect(screen.queryByText("NOT WRITTEN")).toBeNull();
    expect(screen.queryByText("LAST WRITTEN")).toBeNull();
    expect(screen.getByText("0 CHANGES")).toBeOnTheScreen();
    expect(screen.getByRole("button", {name: "Write all three slots"})).toBeEnabled();
});

it("shows pending status for a scale-only change and clears it when the receipt matches again", async () => {
    const options = props();
    const saved = snapshotRecipe(recipes[0]);
    options.record.drafts = [saved, saved, saved];
    options.record.written = {at: 1000, slots: [saved, saved, saved]};
    const view = await renderWithProviders(<EasyModeSlots {...options} available/>);
    expect(screen.queryByText("NOT WRITTEN")).toBeNull();
    expect(screen.queryByText("LAST WRITTEN")).toBeNull();
    expect(screen.getByText("0 CHANGES")).toBeOnTheScreen();
    options.record.drafts[0] = {...saved, scaleEnabled: true};
    await view.rerender(<EasyModeSlots {...options} available/>);
    expect(screen.getAllByText("NOT WRITTEN")).toHaveLength(1);
    expect(within(screen.getByTestId("slot-A-heading")).getByText("NOT WRITTEN")).toBeOnTheScreen();
    expect(screen.getByText("1 CHANGE")).toBeOnTheScreen();
    options.record.drafts[0] = saved;
    await view.rerender(<EasyModeSlots {...options} available/>);
    expect(screen.queryByText("NOT WRITTEN")).toBeNull();
    expect(screen.queryByText("LAST WRITTEN")).toBeNull();
    expect(screen.getByText("0 CHANGES")).toBeOnTheScreen();
    expect(screen.getAllByText(/Last written by XBRW\+\+/)).toHaveLength(1);
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
    expect(await screen.findByText(/still saving.*finish the same set.*back to normal.*all three again/)).toBeOnTheScreen();
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
    expect(await screen.findByText(/check for save confirmation without sending the recipes again/)).toBeOnTheScreen();
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

it("names the empty slots before the first write and says one change is enough after it", async () => {
    const options = props();
    options.record.drafts = [snapshotRecipe(recipes[0]), null, null];
    await renderWithProviders(<EasyModeSlots {...options} available/>);
    expect(screen.getByText("Choose a recipe for slots B and C before writing. The first write needs all three. "
        + "After that you can change one at a time.")).toBeOnTheScreen();
    expect(screen.getByRole("button", {name: "Write all three slots"})).toBeDisabled();
    await fireEvent.press(screen.getByRole("button", {name: "About Easy Mode"}));
    expect(await screen.findByText(
        "Choose all three recipes the first time. After that, change any one and the other two are sent again."
    )).toBeOnTheScreen();
});

it("reconnects a slot from an unsaved catalogue recipe to the library's copy of its link", async () => {
    const options = props();
    const fetched = coffee("Kenya - 18g");
    fetched.shareId = "share-kenya";
    options.record.drafts = [snapshotRecipe(fetched), null, null];
    const saved = coffee("Kenya - 18g");
    saved.shareId = "share-kenya";
    await renderWithProviders(<EasyModeSlots {...options} recipes={[...recipes, saved]}/>);
    expect(screen.queryByText("REMOVED FROM LIBRARY")).toBeNull();
    expect(screen.queryByText("RECIPE UPDATED")).toBeNull();
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
    expect(screen.queryByText("LAST WRITTEN")).toBeNull();
    expect(screen.queryByText("NOT WRITTEN")).toBeNull();
    expect(screen.getByText("0 CHANGES")).toBeOnTheScreen();
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
    expect(await screen.findByText(/assignments are kept.*slot contents remain unconfirmed/i)).toBeOnTheScreen();
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
    expect(screen.getByText("1 CHANGE")).toBeOnTheScreen();
});

it("keeps the searchable picker and explains the storage failure inside it", async () => {
    const sql = createTestDatabase();
    const store = new SlotDatabase(sql);
    sql.execSync("CREATE TRIGGER fail_slot BEFORE INSERT ON easy_mode_slots BEGIN SELECT RAISE(ABORT, 'disk full'); END;");
    await renderWithProviders(<PersistentSlots store={store}/>);
    await fireEvent.press(screen.getByRole("button", {name: "Change slot A recipe"}));
    await waitFor(async () => {
        await fireEvent.press(screen.getByRole("button", {name: "Choose Morning"}));
        expect(screen.getByRole("alert")).toHaveTextContent(/could not save.*phone.*storage/i);
    }, {timeout: SHEET_PRESS_TIMEOUT});
    expect(screen.getByRole("button", {name: "Choose Morning"})).toBeOnTheScreen();
    expect(new SlotDatabase(sql).read("one").drafts[0]).toBeNull();
});

function interruptedOptions() {
    const options = props();
    const saved = snapshotRecipe(recipes[0]);
    options.record.journal = {
        id: "attempt", serial: "serial", slots: [saved, saved, saved],
        frames: prepareSet([saved, saved, saved]), acknowledged: 1, inFlight: 1, error: null
    };
    return options;
}

describe("accessibility focus restoration", () => {
    let focus: jest.SpyInstance;
    let handle: jest.SpyInstance;
    beforeEach(() => {
        focus = jest.spyOn(AccessibilityInfo, "setAccessibilityFocus").mockImplementation(() => {});
        handle = jest.spyOn(native, "findNodeHandle").mockReturnValue(42);
    });
    afterEach(() => {
        focus.mockRestore();
        handle.mockRestore();
    });

    async function expectFocus(label: string) {
        await waitFor(() => {
            expect(screen.getByRole("button", {name: label})).toBeOnTheScreen();
            expect(handle).toHaveBeenCalled();
            expect(handle.mock.calls.at(-1)?.[0]?.props?.accessibilityLabel).toBe(label);
            expect(focus).toHaveBeenLastCalledWith(42);
        });
    }

    it.each([
        ["Change slot B recipe", false],
        ["About Easy Mode", false],
        ["Retry slot write", true],
        ["Cancel slot write", true]
    ] as const)("restores the originating %s after CLOSE", async (label, recovery) => {
        await renderWithProviders(<EasyModeSlots {...(recovery ? interruptedOptions() : props())} available/>);
        await fireEvent.press(screen.getByRole("button", {name: label}));
        expect(focus).not.toHaveBeenCalled();
        await waitFor(async () => {
            await fireEvent.press(screen.getByRole("button", {name: "Close"}));
            expect(screen.getByRole("button", {name: label})).toBeOnTheScreen();
        }, {timeout: SHEET_PRESS_TIMEOUT});
        await expectFocus(label);
    });

    it("restores CHANGE after a successful picker assignment", async () => {
        const options = props();
        await renderWithProviders(<EasyModeSlots {...options}/>);
        await fireEvent.press(screen.getByRole("button", {name: "Change slot C recipe"}));
        await waitFor(async () => {
            await fireEvent.press(screen.getByRole("button", {name: "Choose Evening"}));
            expect(options.onAssign).toHaveBeenCalledWith(2, recipes[1]);
        }, {timeout: SHEET_PRESS_TIMEOUT});
        await expectFocus("Change slot C recipe");
    });

    it.each(["retry", "cancel"] as const)("restores %s after KEEP THIS WRITE", async (kind) => {
        await renderWithProviders(<EasyModeSlots {...interruptedOptions()} available/>);
        const label = kind === "retry" ? "Retry slot write" : "Cancel slot write";
        await fireEvent.press(screen.getByRole("button", {name: label}));
        await waitFor(async () => {
            await fireEvent.press(screen.getByRole("button", {name: "KEEP THIS WRITE"}));
            expect(screen.getByRole("button", {name: label})).toBeOnTheScreen();
        }, {timeout: SHEET_PRESS_TIMEOUT});
        await expectFocus(label);
    });

    it.each([false, true])("restores RETRY after retry choice restart=%s without an active attempt", async (restart) => {
        const options = interruptedOptions();
        await renderWithProviders(<EasyModeSlots {...options} available/>);
        await fireEvent.press(screen.getByRole("button", {name: "Retry slot write"}));
        await waitFor(async () => {
            await fireEvent.press(screen.getByRole("button", {name: restart
                ? "Confirm machine is back to normal and retry" : "Finish write while machine is still saving"}));
            expect(options.onRecover).toHaveBeenCalledWith(restart);
        }, {timeout: SHEET_PRESS_TIMEOUT});
        await expectFocus("Retry slot write");
    });

    it("restores surviving WRITE after confirmed cancellation, not the removed CANCEL", async () => {
        const options = interruptedOptions();
        const view = await renderWithProviders(<EasyModeSlots {...options} available/>);
        await fireEvent.press(screen.getByRole("button", {name: "Cancel slot write"}));
        await waitFor(async () => {
            await fireEvent.press(screen.getByRole("button", {name: "Confirm machine is back to normal and cancel"}));
            expect(options.onCancel).toHaveBeenCalledTimes(1);
        }, {timeout: SHEET_PRESS_TIMEOUT});
        await view.rerender(<EasyModeSlots {...options} available running attempt={{
            deviceId: "one", serial: "serial", operation: "cancel", status: "cancelling"
        }}/>);
        focus.mockClear();
        handle.mockClear();
        const completed = {...options.record, drafts: options.record.journal!.slots, journal: null};
        await view.rerender(<EasyModeSlots {...options} record={completed} available attempt={{
            deviceId: "one", serial: "serial", operation: "cancel", status: "cancelled"
        }}/>);
        await expectFocus("Write all three slots");
    });

    it.each(["write", "recover"] as const)("restores surviving WRITE after %s success is dismissed", async (operation) => {
        const options = interruptedOptions();
        const saved = options.record.journal!.slots;
        const completed = {...options.record, drafts: saved, journal: null, written: {at: 1000, slots: saved}};
        const onDismissSuccess = jest.fn();
        const view = await renderWithProviders(<EasyModeSlots {...options} available running attempt={{
            deviceId: "one", serial: "serial", operation, status: "writing"
        }}/>);
        await view.rerender(<EasyModeSlots {...options} available record={completed} onDismissSuccess={onDismissSuccess}
            attempt={{deviceId: "one", serial: "serial", operation, status: "success"}}/>);
        expect(focus).not.toHaveBeenCalled();
        await waitFor(() => expect(onDismissSuccess).toHaveBeenCalledTimes(1), {timeout: SHEET_PRESS_TIMEOUT});
        await view.rerender(<EasyModeSlots {...options} available record={completed} attempt={null}/>);
        await expectFocus("Write all three slots");
    });

    it("restores surviving RETRY after a WRITE interruption", async () => {
        const options = props();
        const saved = snapshotRecipe(recipes[0]);
        options.record.drafts = [saved, saved, saved];
        const view = await renderWithProviders(<EasyModeSlots {...options} available/>);
        await fireEvent.press(screen.getByRole("button", {name: "Write all three slots"}));
        await view.rerender(<EasyModeSlots {...options} available running attempt={{
            deviceId: "one", serial: "serial", operation: "write", status: "writing"
        }}/>);
        expect(focus).not.toHaveBeenCalled();
        await view.rerender(<EasyModeSlots {...interruptedOptions()} available attempt={{
            deviceId: "one", serial: "serial", operation: "write", status: "error"
        }}/>);
        await expectFocus("Retry slot write");
    });

    it.each([false, true])("removes the modal before restoring focus on the next frame (reduced motion: %s)", async (reducedMotion) => {
        const reduced = jest.spyOn(motion, "useReducedMotion").mockReturnValue(reducedMotion);
        const options = interruptedOptions();
        const view = await renderWithProviders(<EasyModeSlots {...options} available running attempt={{
            deviceId: "one", serial: "serial", operation: "write", status: "writing"
        }}/>);
        const frames: FrameRequestCallback[] = [];
        const raf = jest.spyOn(global, "requestAnimationFrame").mockImplementation(callback => {
            frames.push(callback);
            return frames.length;
        });
        try {
            expect(screen.getByTestId("easy-mode-write-overlay").props.exiting).toBeUndefined();
            await view.rerender(<EasyModeSlots {...options} available attempt={{
                deviceId: "one", serial: "serial", operation: "write", status: "error"
            }}/>);
            expect(screen.queryByTestId("easy-mode-write-overlay", {includeHiddenElements: true})).toBeNull();
            expect(screen.getByTestId("easy-mode-host").props).toMatchObject({
                accessibilityElementsHidden: false, importantForAccessibility: "auto", pointerEvents: "auto"
            });
            expect(focus).not.toHaveBeenCalled();
            expect(frames).toHaveLength(1);
            await act(async () => frames[0](0));
            expect(handle.mock.calls.at(-1)?.[0]?.props?.accessibilityLabel).toBe("Retry slot write");
            expect(focus).toHaveBeenCalledTimes(1);
            expect(focus).toHaveBeenLastCalledWith(42);
        } finally {
            raf.mockRestore();
            reduced.mockRestore();
        }
    });
});

it.each([
    "The Easy Mode frame does not match its durable dispatch boundary.",
    "All three Easy Mode receipts are required before storage completion.",
    "The Easy Mode recovery frames disagree with their snapshots.",
    "The connected machine serial must match.",
    "The recipe's brewer settings are invalid.",
    "The Easy Mode dose must be 6-30 g.",
    "Could not persist the incomplete Easy Mode write: disk full. Original failure: Receipt unknown",
    "Unexpected native failure"
])("shows an actual failure in red without exposing internal details: %s", async (error) => {
    await renderWithProviders(<EasyModeSlots {...interruptedOptions()} available error={error}/>);
    expect(screen.getByText("Writing stopped at B.")).toHaveStyle({color: palette.danger});
    expect(screen.getByRole("alert")).not.toHaveTextContent(/durable|dispatch|receipt|journal|serial|invariant/i);
    expect(screen.getByRole("alert")).not.toHaveTextContent(error);
});

it("keeps definite machine refusal red with actionable copy", async () => {
    await renderWithProviders(<EasyModeSlots {...interruptedOptions()} available
        error="The machine refused the Easy Mode write. Fill the tank if needed, then retry."/>);
    expect(screen.getByText("Writing stopped at B.")).toHaveStyle({color: palette.danger});
    expect(screen.getByRole("alert")).toHaveTextContent(/machine refused.*Fill the tank/);
});

it.each([
    ["Easy Mode link lost. Receipt is unknown.", "The connection was lost before B was confirmed."],
    ["The Easy Mode connection changed. Receipt is unknown.", "The connection was lost before B was confirmed."],
    ["Easy Mode writing stopped because the app entered the background.",
        "Writing stopped because the app moved to the background. Keep it open when retrying."]
])("preserves the specific interruption reason without alarm styling: %s", async (error, copy) => {
    await renderWithProviders(<EasyModeSlots {...interruptedOptions()} available error={error}/>);
    expect(screen.getByRole("alert")).toHaveTextContent(copy);
    expect(screen.getByText("Writing stopped at B.")).toHaveStyle({color: palette.text});
    expect(screen.queryByText("!")).toBeNull();
    expect(screen.getByRole("alert")).not.toHaveTextContent(/receipt|journal/i);
});

it("explains temporary saving without claiming the interrupted set was saved", async () => {
    const options = interruptedOptions();
    await renderWithProviders(<EasyModeSlots {...options} available error={null}/>);
    expect(screen.getByText(/usually clears after about a minute/)).toBeOnTheScreen();
    expect(screen.getByText(/This set has not been confirmed saved/)).toBeOnTheScreen();
    expect(screen.getByText("Finish or cancel this write to brew from the app.")).toBeOnTheScreen();
    expect(screen.queryByText("Do not start a brew until this write is resolved.")).toBeNull();
    expect(screen.queryByText("!")).toBeNull();
    expect(options.onCancel).not.toHaveBeenCalled();
    expect(options.onRecover).not.toHaveBeenCalled();
});

it("presents each reference matrix slot with its own name and figures, not the first probe's", async () => {
    const store = new SlotDatabase(createTestDatabase());
    for (const i of [0, 1, 2] as const) store.assign("one", i, snapshotRecipe(recipes[0]));
    const identity = {deviceId: "one", serial: "serial"};
    const port = {available: true, acquire: async () => ({
        sendAndConfirm: async () => {}, confirmSaved: async () => {}, release: () => {}
    })};
    for (const id of ["t1", "t2"]) {
        await writeTeaSlotProbe(store, identity, port, {id: () => id});
        await restoreTeaSlotOriginal(store, identity, port, {id: () => `r-${id}`});
    }
    await writeTeaSlotProbe(store, identity, port, {id: () => "t3"});
    await renderWithProviders(<EasyModeSlots {...props()} record={store.read("one")} available/>);
    for (const [slot, name, grind] of [["A", "TEA REF A", "OFF"], ["B", "TEA REF B", "OFF"], ["C", "TEA REF C", "50"]]) {
        const card = within(screen.getByTestId(`slot-${slot}`));
        expect(card.getByText(name)).toBeOnTheScreen();
        expect(card.getByText(`1 STEEP · 90ML · 92C · 20S · GRIND ${grind}`)).toBeOnTheScreen();
        expect(card.queryByText(/1:15|1:30|REMOVED FROM LIBRARY|RECIPE UPDATED/)).toBeNull();
        expect(card.queryByTestId(`slot-${slot}-profile`)).toBeNull();
    }
});
