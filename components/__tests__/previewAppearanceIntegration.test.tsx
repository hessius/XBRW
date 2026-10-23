import React from "react";
import {Platform, StyleSheet} from "react-native";
import {fireEvent, screen, within} from "@testing-library/react-native";

import BagSection from "@/components/BagSection";
import BagSheet from "@/components/BagSheet";
import ReadyToBrewCard from "@/components/ReadyToBrewCard";
import QuickEditPanel from "@/components/QuickEditPanel";
import RoastDayField from "@/components/RoastDayField";
import {accents, resolveAppearance} from "@/constants/colors";
import {AppearanceScope} from "@/hooks/useAppearance";
import {THEME_IDS, type AppearanceChoice} from "@/library/appearance";
import {blankRecipe} from "@/library/newRecipe";
import Pour from "@/library/Pour";
import {contrast} from "@/test-utils/contrast";
import {renderWithProviders} from "@/test-utils/render";

const CHOICES = THEME_IDS.flatMap(theme =>
    (["original", "themed"] as const).map(recipeColours => ({theme, recipeColours})));
const noop = () => {};

describe.each(CHOICES)("$theme / $recipeColours cumulative preview appearance", choice => {
    it("draws Ready to brew with readable actual-fill ink and reactive chrome", async () => {
        const {palette, recipe} = resolveAppearance(choice);
        const colour = recipe(accents.coffee[0]);
        await renderWithProviders(
            <AppearanceScope choice={choice}>
                <ReadyToBrewCard item="recipe" name="Vinka" accent={accents.coffee[0]}
                    emphasised onOpen={noop} onBrew={noop} onReorder={noop} onDismiss={noop}/>
                <BagSection tracker="xbrw" bag={null} reading={null}
                    onOpenSheet={noop} onFinish={noop} onReorder={noop}/>
            </AppearanceScope>
        );
        expect(screen.getByTestId("ready-to-brew")).toHaveStyle({backgroundColor: palette.surface});
        expect(screen.getByTestId("ready-to-brew-name")).toHaveStyle({color: palette.text});
        const brew = screen.getByTestId("ready-to-brew-brew");
        expect(brew).toHaveStyle({backgroundColor: colour.fill});
        const label = within(brew).getByText("BREW");
        expect(label).toHaveStyle({color: colour.onAccent.text});
        expect(contrast(StyleSheet.flatten(label.props.style).color, colour.fill))
            .toBeGreaterThanOrEqual(4.5);
        expect(screen.getByTestId("bag-none")).toHaveStyle({color: palette.dim});
    });

    it("uses neutral bag choices, primary save and the current native calendar scheme", async () => {
        const appearance = resolveAppearance(choice);
        await renderWithProviders(
            <AppearanceScope choice={choice}>
                <BagSheet open epoch={1} onOpenChange={noop} tracker="xbrw"
                    bag={null} gramsLeft={null} beanName="Vinka" beanNameFixed={false}
                    suggestedRoastedOn="2026-10-12" onSave={noop} onFinish={noop} onRemove={noop}/>
            </AppearanceScope>
        );
        const selected = screen.getByTestId("bag-size-250");
        expect(selected).toHaveStyle({backgroundColor: appearance.selection.fill});
        const label = within(selected).getByText("250G");
        expect(contrast(StyleSheet.flatten(label.props.style).color, appearance.selection.fill))
            .toBeGreaterThanOrEqual(4.5);
        const save = screen.getByTestId("bag-save");
        expect(save).toHaveStyle({backgroundColor: appearance.primary.fill});
        expect(contrast(StyleSheet.flatten(within(save).getByText("SAVE").props.style).color,
            appearance.primary.fill)).toBeGreaterThanOrEqual(4.5);
        await fireEvent.press(screen.getByTestId("bag-roasted-field"));
        if (Platform.OS === "ios") {
            expect(screen.getByTestId("bag-roasted-calendar").props.themeVariant).toBe(appearance.scheme);
        }
        await fireEvent.press(screen.getByTestId("bag-size-other"));
        await fireEvent.changeText(screen.getByTestId("bag-size-field"), "0");
        expect(screen.getByTestId("bag-save")).toBeDisabled();
        expect(screen.getByTestId("bag-save")).toHaveStyle({backgroundColor: appearance.primary.disabledFill});
        expect(within(screen.getByTestId("bag-save")).getByText("SAVE"))
            .toHaveStyle({color: appearance.primary.disabledInk});
    });

    it("resolves canonical recipe ink for dose saving and actual-fill dose presets", async () => {
        const recipe = blankRecipe("coffee");
        recipe.dosage = 20;
        recipe.pours = [
            new Pour(1, 80, 93, 30, 0, 0, 0),
            new Pour(2, 120, 93, 30, 0, 0, 0),
            new Pour(3, 120, 93, 30, 0, 0, 0)
        ];
        const before = JSON.stringify(recipe);
        const appearance = resolveAppearance(choice);
        const colour = appearance.recipe(accents.coffee[0]);
        await renderWithProviders(
            <AppearanceScope choice={choice}>
                <QuickEditPanel recipe={recipe} adjustments={{dose: 15}} accent={accents.coffee[0]}
                    temperatureUnit="C" onChange={noop} onSaveDose={noop}/>
            </AppearanceScope>
        );
        const save = screen.getByTestId("quick-edit-save-dose");
        expect(save).toHaveStyle({color: colour.ink});
        for (const ground of [appearance.palette.base, appearance.palette.surface, appearance.palette.raised]) {
            expect(contrast(StyleSheet.flatten(save.props.style).color, ground)).toBeGreaterThanOrEqual(4.5);
        }
        expect(screen.getByTestId("quick-edit-dose-preset-15")).toHaveStyle({backgroundColor: colour.fill});
        expect(JSON.stringify(recipe)).toBe(before);
    });
});

it("retains the open calendar and selected day when appearance changes", async () => {
    const tree = (choice: AppearanceChoice) => (
        <AppearanceScope choice={choice}>
            <RoastDayField value="2026-10-12" today="2026-10-23" onChange={noop}/>
        </AppearanceScope>
    );
    const view = await renderWithProviders(tree({theme: "original", recipeColours: "original"}));
    await fireEvent.press(screen.getByTestId("bag-roasted-field"));
    await view.rerender(tree({theme: "light", recipeColours: "themed"}));
    expect(screen.getByTestId("bag-roasted-field")).toHaveStyle({
        backgroundColor: resolveAppearance({theme: "light", recipeColours: "themed"}).palette.raised
    });
    if (Platform.OS === "ios") {
        const calendar = screen.getByTestId("bag-roasted-calendar");
        expect(calendar.props.themeVariant).toBe("light");
        expect(calendar.props.value).toEqual(new Date(2026, 9, 12));
    }
});
