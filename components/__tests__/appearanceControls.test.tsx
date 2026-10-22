import React from "react";
import {StyleSheet, View} from "react-native";
import {fireEvent, screen, waitFor, within} from "@testing-library/react-native";

import RailChip from "@/components/RailChip";
import RailViewToggle from "@/components/RailViewToggle";
import SegmentedControl from "@/components/SegmentedControl";
import XbrwSwitch from "@/components/XbrwSwitch";
import SupportTile, {SupportAction, SUPPORT_TITLE} from "@/components/SupportTile";
import ExportButton from "@/components/ExportButton";
import SplitBrewButton from "@/components/SplitBrewButton";
import SettingsActionRow from "@/components/SettingsActionRow";
import SettingsChoiceRow from "@/components/SettingsChoiceRow";
import NameShelfSheet from "@/components/NameShelfSheet";
import RenameSheet from "@/components/RenameSheet";
import NewRecipeSheet from "@/components/NewRecipeSheet";
import SortSheet from "@/components/SortSheet";
import EasyModeSlotCard from "@/components/EasyModeSlotCard";
import {accents, onAccent, palette as canonicalPalette, resolveAppearance} from "@/constants/colors";
import {AppearanceScope} from "@/hooks/useAppearance";
import {THEME_IDS, type AppearanceChoice} from "@/library/appearance";
import {blankRecipe} from "@/library/newRecipe";
import Pour from "@/library/Pour";
import {snapshotRecipe} from "@/library/slots/slotModel";
import {contrast, over} from "@/test-utils/contrast";
import {renderWithProviders, SHEET_PRESS_TIMEOUT} from "@/test-utils/render";

const CHOICES = THEME_IDS.flatMap(theme =>
    (["original", "themed"] as const).map(recipeColours => ({theme, recipeColours})));
const OPTIONS = [
    {value: "list", label: "List", icon: "list" as const},
    {value: "grid", label: "Grid", icon: "shelves" as const}
];
const TOUCH = {persist: () => {}, nativeEvent: {touches: [], changedTouches: [], locationX: 1,
    locationY: 1, pageX: 1, pageY: 1, timestamp: 0}};
type Node = ReturnType<typeof screen.getByText>;
function style(node: Node) {
    return StyleSheet.flatten(node.props.style) ?? {};
}
function opacity(node: Node, stop: Node): number {
    let value = 1;
    let current: Node | null = node;
    while (current && current !== stop) {
        if (typeof current.type === "string") value *= style(current).opacity ?? 1;
        current = current.parent;
    }
    return value;
}
function faded(colour: string, alpha: number, background: string) {
    const solid = over(colour, background);
    const rgb = [1, 3, 5].map(index => parseInt(solid.slice(index, index + 2), 16));
    return over(`rgba(${rgb.join(",")},${alpha})`, background);
}
function measured(ink: string, fill: string, parent: string, alpha: number) {
    return contrast(faded(over(ink, fill), alpha, parent), faded(fill, alpha, parent));
}
async function hold(node: Node) {
    // Tamagui's native press state is driven by its responder, RN's by pressIn.
    await fireEvent(node, "pressIn", TOUCH);
    if (node.props.onResponderGrant) await fireEvent(node, "responderGrant", TOUCH);
}
function dot(control: Node) {
    return within(control).getAllByTestId("dot-icon-dot", {includeHiddenElements: true})[0];
}
function background(node: Node): string {
    let current: Node | null = node;
    while (current) {
        const fill = style(current).backgroundColor;
        if (typeof current.type === "string" && fill && fill !== "transparent") return fill;
        current = current.parent;
    }
    throw new Error("No rendered background");
}
async function renderChoice(choice: AppearanceChoice, children: React.ReactNode) {
    return renderWithProviders(<AppearanceScope choice={choice}>{children}</AppearanceScope>);
}

describe.each(CHOICES)("$theme / $recipeColours core controls", choice => {
    const appearance = resolveAppearance(choice);
    const {palette, selection} = appearance;

    it.each(["base", "surface", "raised"] as const)(
        "keeps selected and inactive rail text/glyphs readable while actually pressed on %s",
        async ground => {
            await renderChoice(choice, <View testID="parent" style={{backgroundColor: palette[ground]}}>
                <RailChip active label="FILTER" icon="filter" accessibilityLabel="Filter" onPress={() => {}}/>
                <RailChip active={false} label="SEARCH" icon="search" accessibilityLabel="Search" onPress={() => {}}/>
                <RailViewToggle value="list" options={OPTIONS} accessibilityLabel="View" onChange={() => {}}/>
            </View>);
            const parent = screen.getByTestId("parent");
            for (const [node, selected, text] of [
                [screen.getByRole("button", {name: "Filter"}), true, "FILTER"],
                [screen.getByRole("button", {name: "Search"}), false, "SEARCH"],
                [screen.getByRole("tab", {name: "List"}), true, undefined],
                [screen.getByRole("tab", {name: "Grid"}), false, undefined]
            ] as const) {
                expect(node.props.accessibilityState.selected).toBe(selected);
                if (selected) expect(style(node).backgroundColor).toBe(selection.fill);
                await hold(node);
                const drawnFill = style(node).backgroundColor;
                const fill = !drawnFill || drawnFill === palette.none
                    ? palette[ground] : over(drawnFill, palette[ground]);
                const alpha = opacity(node, parent);
                expect(alpha).toBe(1);
                if (selected) expect(style(node).backgroundColor).toBe(selection.pressedFill);
                const glyphInk = style(dot(node)).backgroundColor;
                expect(measured(glyphInk, fill, palette[ground], alpha)).toBeGreaterThanOrEqual(3);
                if (text) {
                    const ink = style(screen.getByText(text)).color;
                    expect(measured(ink, fill, palette[ground], alpha)).toBeGreaterThanOrEqual(4.5);
                }
                await fireEvent(node, "responderRelease", TOUCH);
                await fireEvent(node, "pressOut", TOUCH);
            }
        }
    );

    it("uses neutral generic segments and resolved canonical recipe segments", async () => {
        const canonical = accents.coffee[0];
        await renderChoice(choice, <View testID="parent" style={{backgroundColor: palette.raised}}>
            <SegmentedControl value="list" options={OPTIONS} onChange={() => {}}/>
            <SegmentedControl value="yes" options={[{value: "yes", label: "RECIPE"}]}
                              accent={canonical} onChange={() => {}}/>
            <RailChip active accent={canonical} label="LOCAL" accessibilityLabel="Local"
                      onPress={() => {}}/>
        </View>);
        const radio = screen.getByRole("radio", {name: "List"});
        expect(radio.props.accessibilityState).toEqual({checked: true});
        expect(style(dot(radio)).backgroundColor).toBe(selection.ink);
        const recipe = screen.getByText("RECIPE");
        expect(style(recipe).backgroundColor).toBe(appearance.recipe(canonical).fill);
        expect(style(recipe).color).toBe(appearance.recipe(canonical).onAccent.text);
        expect(background(screen.getByText("LOCAL"))).toBe(appearance.recipe(canonical).fill);
        expect(style(screen.getByText("LOCAL")).color).toBe(appearance.recipe(canonical).onAccent.text);
        await hold(screen.getByRole("radio", {name: "RECIPE"}));
        expect(measured(style(recipe).color, background(recipe), palette.raised,
            opacity(recipe, screen.getByTestId("parent")))).toBeGreaterThanOrEqual(4.5);
    });

    it("independently measures the actually pressed selected view toggle", async () => {
        await renderChoice(choice, <View testID="parent" style={{backgroundColor: palette.base}}>
            <RailViewToggle value="list" options={OPTIONS} accessibilityLabel="View"
                            onChange={() => {}}/>
        </View>);
        const node = screen.getByRole("tab", {name: "List"});
        await hold(node);
        const alpha = opacity(node, screen.getByTestId("parent"));
        const ratio = measured(style(dot(node)).backgroundColor, background(node), palette.base, alpha);
        expect(alpha).toBe(1);
        expect(ratio).toBeGreaterThanOrEqual(3);
        expect(node.props.accessibilityState).toEqual({selected: true});
        if (process.env.REPORT_APPEARANCE_CONTRAST) {
            process.stdout.write(`Pressed view glyph ${JSON.stringify({choice, alpha, ratio})}\n`);
        }
    });

    it("uses chrome switch treatment without changing checked semantics", async () => {
        await renderChoice(choice, <XbrwSwitch checked accessibilityLabel="Chrome" onCheckedChange={() => {}}/>);
        const node = screen.getByRole("switch", {name: "Chrome"});
        expect(node.props.accessibilityState).toEqual({checked: true});
        expect(style(node).backgroundColor).toBe(appearance.chromeSwitch.on.track);
    });

    it("uses the actual displayed card fill for both switch states, without identity mapping", async () => {
        const fills = [accents.coffee[0], appearance.recipe(accents.coffee[0]).fill,
            palette.brandFill, palette.raised];
        await renderChoice(choice, <View>
            {fills.map((displayFill, index) => <View key={index} style={{backgroundColor: displayFill}}>
                <XbrwSwitch checked ground="accent" displayFill={displayFill}
                            accessibilityLabel={`On ${index}`} onCheckedChange={() => {}}/>
                <XbrwSwitch checked={false} ground="accent" displayFill={displayFill}
                            accessibilityLabel={`Off ${index}`} onCheckedChange={() => {}}/>
            </View>)}
        </View>);
        fills.forEach((fill, index) => {
            const pair = appearance.switchOn(fill);
            for (const [label, colours] of [["On", pair.on], ["Off", pair.off]] as const) {
                const track = style(screen.getByRole("switch", {name: `${label} ${index}`}));
                expect(track.backgroundColor).toBe(colours.track);
                expect(track.borderTopColor).toBe(colours.ring);
                expect(contrast(colours.ring, fill)).toBeGreaterThanOrEqual(3);
            }
        });
    });

    it("wires the slot card's actual themed fill to its switch", async () => {
        const recipe = blankRecipe("coffee");
        recipe.accentIndex = 0;
        recipe.pours = [new Pour(1, 240, 93, 30, 0, 0, 0)];
        const onSetScaleEnabled = jest.fn();
        await renderChoice(choice, <EasyModeSlotCard index={0} snapshot={{...snapshotRecipe(recipe), scaleEnabled: true}}
            needsWrite={false} status={null} recovery={false} locked={false} updateProblem={null}
            onChange={() => {}} onUpdate={() => {}} onSetScaleEnabled={onSetScaleEnabled}/>);
        const displayFill = style(screen.getByTestId("slot-A")).backgroundColor;
        expect(displayFill).toBe(appearance.recipe(accents.coffee[0]).fill);
        const node = screen.getByRole("switch", {name: "Scale for slot A"});
        expect(style(node).backgroundColor).toBe(appearance.switchOn(displayFill).on.track);
        await fireEvent.press(node);
        expect(onSetScaleEnabled).toHaveBeenCalledWith(false);
    });

    it("keeps unavailable requests actionable, genuinely dimmed controls disabled, and warning meaning", async () => {
        const requested = jest.fn();
        const disabled = jest.fn();
        await renderChoice(choice, <View>
            <RailChip active unavailable label="REQUEST" accessibilityLabel="Requested" onPress={requested}/>
            <RailChip active dimmed label="DIMMED" accessibilityLabel="Dimmed" onPress={disabled}/>
            <SettingsActionRow label="Delete" tone="danger" onPress={() => {}}/>
        </View>);
        const request = screen.getByRole("button", {name: "Requested"});
        expect(request.props.accessibilityState).toEqual({selected: false});
        expect(style(screen.getByText("REQUEST")).color).toBe(palette.warn);
        await hold(request);
        await fireEvent(request, "responderRelease", TOUCH);
        expect(requested).toHaveBeenCalledTimes(1);
        const dimmed = screen.getByRole("button", {name: "Dimmed"});
        expect(dimmed.props.accessibilityState.disabled).toBe(true);
        await hold(dimmed);
        await fireEvent(dimmed, "responderRelease", TOUCH);
        expect(disabled).not.toHaveBeenCalled();
        expect(style(screen.getByText("Delete")).color).toBe(palette.danger);
    });

    it("keeps one BREW, disabled gating and an independently usable quick-edit handle", async () => {
        const onBrew = jest.fn();
        const onToggleQuickEdit = jest.fn();
        await renderChoice(choice, <SplitBrewButton enabled={false} accent={accents.coffee[0]}
            flex={2} quickEditOpen onBrew={onBrew} onToggleQuickEdit={onToggleQuickEdit}/>);
        const brew = screen.getByRole("button", {name: "Brew"});
        expect(screen.getAllByText("BREW")).toHaveLength(1);
        expect(brew.props.accessibilityState).toEqual({disabled: true});
        await fireEvent.press(brew);
        expect(onBrew).not.toHaveBeenCalled();
        const arrow = screen.getByRole("button", {name: "Close quick edit"});
        expect(arrow.props.accessibilityState).toEqual({expanded: true});
        expect(style(screen.getByText("▼")).color).toBe(appearance.recipe(accents.coffee[0]).onAccent.text);
        await fireEvent.press(arrow);
        expect(onToggleQuickEdit).toHaveBeenCalledTimes(1);
        const divider = style(screen.getByTestId("split-brew-divider"));
        expect(contrast(divider.borderLeftColor, divider.backgroundColor)).toBeGreaterThanOrEqual(3);
    });

    it("keeps settings choices neutral and readable in both enabled press states", async () => {
        await renderChoice(choice, <View testID="parent" style={{backgroundColor: palette.surface}}>
            <SettingsChoiceRow label="Units" description="Temperature" value="c"
                               options={[{value: "c", label: "CELSIUS"}, {value: "f", label: "FAHRENHEIT"}]}
                               onChange={() => {}}/>
        </View>);
        for (const label of ["CELSIUS", "FAHRENHEIT"]) {
            const node = screen.getByRole("radio", {name: label});
            await hold(node);
            const text = screen.getByText(label);
            expect(opacity(text, screen.getByTestId("parent"))).toBe(1);
            expect(contrast(style(text).color, background(text))).toBeGreaterThanOrEqual(4.5);
            if (label === "CELSIUS") {
                expect(background(text)).toBe(selection.pressedFill);
                expect(style(text).color).toBe(selection.ink);
            }
            await fireEvent(node, "responderRelease", TOUCH);
        }
    });

    it("keeps sort directions neutral even in themed recipe mode", async () => {
        const onSortChange = jest.fn();
        await renderChoice(choice, <SortSheet open sort="added" direction="desc"
            favouritesFirst onOpenChange={() => {}} onSortChange={onSortChange}
            onFavouritesFirstChange={() => {}}/>);
        const selected = screen.getByText("NEWEST");
        expect(style(selected).backgroundColor).toBe(selection.fill);
        expect(style(selected).color).toBe(selection.ink);
        await waitFor(async () => {
            await fireEvent.press(screen.getByRole("radio", {name: "OLDEST"}));
            expect(onSortChange).toHaveBeenCalledWith("added", "asc");
        }, {timeout: SHEET_PRESS_TIMEOUT});
    });

    it.each([undefined, "MORNINGS"])("makes shelf create/save primary (%s) and preserves submit", async current => {
        const onName = jest.fn().mockReturnValue(true);
        await renderChoice(choice, <NameShelfSheet open current={current} count={3}
            onOpenChange={() => {}} onName={onName}/>);
        await fireEvent.changeText(screen.getByTestId("shelf-name-field"), "  EVENINGS  ");
        const button = screen.getByTestId("shelf-name-confirm");
        expect(style(button).backgroundColor).toBe(appearance.primary.fill);
        const text = screen.getByText(current === undefined ? "CREATE SHELF" : "RENAME SHELF");
        expect(style(text).color).toBe(appearance.primary.ink);
        await hold(button);
        expect(style(button).backgroundColor).toBe(appearance.primary.pressedFill);
        expect(contrast(style(text).color, background(text))).toBeGreaterThanOrEqual(4.5);
        await fireEvent(button, "responderRelease", TOUCH);
        await waitFor(async () => {
            await fireEvent.press(button);
            expect(onName).toHaveBeenCalledWith("EVENINGS");
        }, {timeout: SHEET_PRESS_TIMEOUT});
    });

    it("keeps recipe rename neutral without a supplied recipe identity", async () => {
        const onRename = jest.fn();
        await renderChoice(choice, <RenameSheet open name="Recipe" borrowedName=""
            onOpenChange={() => {}} onRename={onRename}/>);
        const button = screen.getByTestId("rename-confirm");
        expect(style(button).backgroundColor).toBe(selection.fill);
        expect(style(screen.getByText("SAVE NAME")).color).toBe(selection.ink);
        await waitFor(async () => {
            await fireEvent.press(button);
            expect(onRename).toHaveBeenCalledWith("Recipe");
        }, {timeout: SHEET_PRESS_TIMEOUT});
    });

    it("keeps new-recipe category and AI doors utility surfaces, not theme primary", async () => {
        const onChoose = jest.fn();
        await renderChoice(choice, <NewRecipeSheet open onOpenChange={() => {}}
            onChoose={onChoose} onBrewMind={() => {}}/>);
        for (const label of ["COFFEE", "TEA", "BREWMIND"]) {
            const text = screen.getByText(label);
            expect(background(text)).toBe(palette.raised);
            expect(contrast(style(text).color, background(text))).toBeGreaterThanOrEqual(4.5);
        }
        const ai = screen.getByTestId("new-recipe-brewmind-door");
        await hold(ai);
        expect(style(ai).opacity).toBe(1);
        await waitFor(async () => {
            await fireEvent.press(screen.getByRole("button", {name: "New tea recipe"}));
            expect(onChoose).toHaveBeenCalledWith("tea");
        }, {timeout: SHEET_PRESS_TIMEOUT});
    });

    it("keeps brand support distinct, neutral utility export and recipe-local BREW", async () => {
        const canonical = accents.coffee[0];
        await renderChoice(choice, <View testID="parent" style={{backgroundColor: palette.base}}>
            <SupportTile/>
            <SupportAction/>
            <ExportButton testID="export" label="Share" busy={false} onPress={() => {}}/>
            <SettingsActionRow label="Utility" detail="Details" onPress={() => {}}/>
            <SplitBrewButton enabled accent={canonical} flex={2} quickEditOpen={false}
                             onBrew={() => {}} onToggleQuickEdit={() => {}}/>
        </View>);
        const parent = screen.getByTestId("parent");
        expect(style(screen.getByTestId("support-tile")).backgroundColor).toBe(palette.brandFill);
        for (const node of screen.getAllByRole("link")) {
            await hold(node);
            const alpha = opacity(node, parent);
            const title = within(node).getByText(SUPPORT_TITLE);
            expect(measured(style(title).color, palette.brandFill, palette.base, alpha))
                .toBeGreaterThanOrEqual(4.5);
            const dots = within(node).queryAllByTestId("dot-icon-dot", {includeHiddenElements: true});
            if (dots.length) expect(measured(style(dots[0]).backgroundColor, palette.brandFill,
                palette.base, alpha)).toBeGreaterThanOrEqual(3);
        }
        expect(style(screen.getByTestId("export-label")).color).toBe(palette.dim);
        await hold(screen.getByTestId("export"));
        expect(opacity(screen.getByTestId("export"), parent)).toBe(1);
        expect(contrast(style(screen.getByTestId("export-label")).color, palette.base)).toBeGreaterThanOrEqual(4.5);
        const brew = screen.getByText("BREW");
        expect(style(brew).color).toBe(appearance.recipe(canonical).onAccent.text);
        expect(background(brew)).toBe(appearance.recipe(canonical).fill);
        await hold(screen.getByRole("button", {name: "Utility, Details"}));
        expect(opacity(screen.getByText("Utility"), parent)).toBe(1);
        for (const label of ["Utility", "Details"]) {
            expect(contrast(style(screen.getByText(label)).color, palette.base)).toBeGreaterThanOrEqual(4.5);
        }
    });
});

it("measures the real pressed magenta recipe chip and catches group fading", async () => {
    const {palette} = resolveAppearance({theme: "original", recipeColours: "original"});
    await renderWithProviders(<View testID="parent" style={{backgroundColor: palette.base}}>
        <RailChip active accent={palette.brand} label="RECIPE" icon="filter"
                  accessibilityLabel="Recipe" onPress={() => {}}/>
    </View>);
    const chip = screen.getByRole("button", {name: "Recipe"});
    await hold(chip);
    const fill = background(chip);
    const ink = style(screen.getByText("RECIPE")).color;
    const alpha = opacity(chip, screen.getByTestId("parent"));
    const ratio = measured(ink, fill, palette.base, alpha);
    expect(ratio).toBeGreaterThanOrEqual(4.5);
    expect(measured(style(dot(chip)).backgroundColor, fill, palette.base, alpha))
        .toBeGreaterThanOrEqual(3);
    expect(measured(ink, fill, palette.base, 0.7)).toBeLessThan(4.5);
    if (process.env.REPORT_APPEARANCE_CONTRAST) {
        process.stdout.write(`Pressed recipe text/glyph ${JSON.stringify({ink, fill, alpha, ratio,
            fadedRatio: measured(ink, fill, palette.base, 0.7)})}\n`);
    }
});

it("detects the #243 whole-group opacity regression independently of palette assertions", () => {
    const fill = canonicalPalette.brand;
    const ink = onAccent.text;
    expect(measured(ink, fill, "#000000", 1)).toBeGreaterThanOrEqual(4.5);
    expect(measured(ink, fill, "#000000", 0.7)).toBeLessThan(3);
    if (process.env.REPORT_APPEARANCE_CONTRAST) {
        process.stdout.write(`Old #243 pair ${JSON.stringify({ratio: measured(ink, fill, "#000000", 1),
            fadedRatio: measured(ink, fill, "#000000", 0.7)})}\n`);
    }
});
