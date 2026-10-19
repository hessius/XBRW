import React from "react";
import {fireEvent, screen} from "@testing-library/react-native";
import {Dimensions, StyleSheet} from "react-native";
import {Text} from "tamagui";

import QuickEditPanel from "@/components/QuickEditPanel";
import {palette} from "@/constants/colors";
import Pour from "@/library/Pour";
import Recipe, {CUP_TYPE, GRINDER_OFF_VALUE} from "@/library/Recipe";
import type {QuickEditAdjustments} from "@/library/quickEdit";
import type {TemperatureUnit} from "@/library/units";
import {renderWithProviders} from "@/test-utils/render";

const DEFAULT_WINDOW = {fontScale: 1, height: 852, scale: 3, width: 393};

function mockWindowFontScale(fontScale: number): void {
    const window = {...DEFAULT_WINDOW, fontScale};
    Dimensions.set({screen: window, window});
}

type CoffeeRecipeOptions = {
    dosage?: number;
    ratio?: number;
    grindSize?: number;
    grinder?: boolean;
};

function coffeeRecipe(options: CoffeeRecipeOptions = {}): Recipe {
    const recipe = new Recipe();
    recipe.cupType = CUP_TYPE.XPOD;
    recipe.dosage = options.dosage ?? 20;
    recipe.ratio = options.ratio ?? 16;
    recipe.grindSize = options.grindSize ?? 65;
    recipe.grinder = options.grinder ?? true;
    recipe.pours = [
        new Pour(1, 80, 88, 30, 0, 0, 20),
        new Pour(2, 120, 88, 30, 0, 0, 10),
        new Pour(3, 120, 90, 30, 0, 0, 0)
    ];
    return recipe;
}

function teaRecipe(): Recipe {
    const recipe = coffeeRecipe();
    recipe.cupType = CUP_TYPE.TEA;
    recipe.dosage = 5;
    recipe.ratio = 18;
    recipe.pours = [new Pour(1, 90, 88, 40, 0, 0, 0)];
    return recipe;
}

async function draw(
    adjustments: QuickEditAdjustments = {},
    recipe: Recipe = coffeeRecipe(),
    onChange = jest.fn(),
    temperatureUnit: TemperatureUnit = "C"
) {
    const rendered = await renderWithProviders(
        <QuickEditPanel recipe={recipe} adjustments={adjustments}
                        accent={palette.brand} temperatureUnit={temperatureUnit}
                        onChange={onChange}/>
    );
    return {onChange, ...rendered};
}

describe("QuickEditPanel", () => {
    beforeEach(() => {
        mockWindowFontScale(1);
    });

    it("reports dose changes as deviations from the saved recipe", async () => {
        const {onChange} = await draw();

        await fireEvent.press(screen.getByLabelText("Increase Quick edit dose"));

        expect(onChange).toHaveBeenCalledWith({dose: 21});
    });

    it("reports ratio changes as deviations from the saved recipe", async () => {
        const {onChange} = await draw();

        await fireEvent.press(screen.getByLabelText("Increase Quick edit ratio"));

        expect(onChange).toHaveBeenCalledWith({ratio: 17});
    });

    it("reports grind changes and shows grinder off as OFF", async () => {
        const {onChange, rerender} = await draw({grind: 80});

        await fireEvent.press(screen.getByLabelText("Increase Quick edit grind"));

        expect(onChange).toHaveBeenCalledWith({grind: GRINDER_OFF_VALUE});

        await rerender(
            <QuickEditPanel recipe={coffeeRecipe()} adjustments={{grind: GRINDER_OFF_VALUE}}
                            accent={palette.brand} temperatureUnit="C" onChange={onChange}/>
        );

        expect(screen.getByText("OFF")).toBeTruthy();
    });

    it("reports temperature offset changes", async () => {
        const {onChange} = await draw();

        await fireEvent.press(screen.getByLabelText("Increase Temperature offset"));

        expect(onChange).toHaveBeenCalledWith({tempOffset: 1});
    });

    it.each([
        ["dose", {dose: 21}, "Increase Quick edit dose", "Decrease Quick edit dose"],
        ["ratio", {ratio: 17}, "Increase Quick edit ratio", "Decrease Quick edit ratio"],
        ["grind", {grind: 66}, "Increase Quick edit grind", "Decrease Quick edit grind"],
        ["tempOffset", {tempOffset: 1}, "Increase Temperature offset", "Decrease Temperature offset"],
    ] as const)("removes %s when it returns to the saved value", async (
        key, adjustments, action, restoreAction
    ) => {
        const recipe = coffeeRecipe();
        const {onChange, rerender} = await draw({}, recipe);

        await fireEvent.press(screen.getByLabelText(action));
        expect(onChange).toHaveBeenCalledWith(adjustments);

        await rerender(
            <QuickEditPanel recipe={recipe} adjustments={adjustments}
                            accent={palette.brand} temperatureUnit="C" onChange={onChange}/>
        );
        await fireEvent.press(screen.getByLabelText(restoreAction));
        await fireEvent.press(screen.getByLabelText(restoreAction));

        const emitted = onChange.mock.calls.at(-1)?.[0] ?? {};
        expect(Object.keys(emitted)).not.toContain(key);
    });

    it("hides ratio for tea and shows it for coffee", async () => {
        const {rerender} = await draw({}, teaRecipe());

        expect(screen.queryByLabelText("Quick edit ratio, 18")).toBeNull();

        await rerender(
            <QuickEditPanel recipe={coffeeRecipe()} adjustments={{}}
                            accent={palette.brand} temperatureUnit="C" onChange={jest.fn()}/>
        );

        expect(screen.getByLabelText("Quick edit ratio, 16")).toBeTruthy();
    });

    it("hides grind for tea and shows it for coffee", async () => {
        const {rerender} = await draw({}, teaRecipe());

        expect(screen.queryByLabelText(/Quick edit grind/)).toBeNull();

        await rerender(
            <QuickEditPanel recipe={coffeeRecipe()} adjustments={{}}
                            accent={palette.brand} temperatureUnit="C" onChange={jest.fn()}/>
        );

        expect(screen.getByLabelText("Quick edit grind, 65")).toBeTruthy();
    });

    it.each([
        [{tempOffset: 2}, "Temperature offset, +2 °C"],
        [{}, "Temperature offset, 0 °C"],
        [{tempOffset: -3}, "Temperature offset, -3 °C"]
    ] as const)("shows signed temperature offset %#", async (adjustments, label) => {
        await draw(adjustments);

        expect(screen.getByLabelText(label)).toBeTruthy();
    });

    it("shows the temperature baseline from the saved recipe", async () => {
        await draw();

        expect(screen.getByTestId("quick-edit-temperature-baseline"))
            .toHaveTextContent(/88, 88, 90 °C/);
    });

    it("says nothing about the recipe's dose until the dose is adjusted", async () => {
        await draw({}, coffeeRecipe({dosage: 18}));

        expect(screen.queryByTestId("quick-edit-dose-baseline")).toBeNull();
    });

    it("says what the recipe's dose was once it has been adjusted", async () => {
        await draw({dose: 20}, coffeeRecipe({dosage: 18}));

        expect(screen.getByTestId("quick-edit-dose-baseline"))
            .toHaveTextContent("recipe 18 g");
    });

    it("says what the recipe's grind was once it has been adjusted", async () => {
        await draw({grind: 70}, coffeeRecipe({grinder: true, grindSize: 65}));

        expect(screen.getByTestId("quick-edit-grind-baseline"))
            .toHaveTextContent("recipe 65");
    });

    it("shows Fahrenheit temperatures and stores the canonical positive offset", async () => {
        const {onChange} = await draw({tempOffset: 1}, coffeeRecipe(), jest.fn(), "F");

        expect(screen.getByTestId("quick-edit-temperature-baseline"))
            .toHaveTextContent(/190, 190, 194 °F/);
        expect(screen.getByLabelText("Temperature offset, +2 °F")).toBeTruthy();

        await fireEvent.press(screen.getByLabelText("Increase Temperature offset"));

        expect(onChange).toHaveBeenCalledWith({tempOffset: 2});
    });

    it("shows Fahrenheit negative offsets as differences, not absolute temperatures", async () => {
        const {onChange} = await draw({tempOffset: -1}, coffeeRecipe(), jest.fn(), "F");

        expect(screen.getByLabelText("Temperature offset, -2 °F")).toBeTruthy();

        await fireEvent.press(screen.getByLabelText("Decrease Temperature offset"));

        expect(onChange).toHaveBeenCalledWith({tempOffset: -2});
    });

    it("reserves the baseline line on every row, adjusted or not", async () => {
        await draw();

        // Four knobs, four slots, with only TEMP OFFSET's line in one of them.
        // The slot is held open so that moving a knob cannot shift the rows
        // below it out from under the finger that moved it.
        const slots = screen.getAllByTestId("quick-edit-baseline-slot");
        expect(slots).toHaveLength(4);
        for (const slot of slots) {
            const style = StyleSheet.flatten(slot.props.style) ?? {};
            expect((style as {minHeight?: number}).minHeight).toBe(16);
        }
        expect(screen.queryByTestId("quick-edit-dose-baseline")).toBeNull();
    });

    it("explains dose and ratio volume rescaling", async () => {
        const {rerender} = await draw({dose: 18});

        expect(screen.getByTestId("quick-edit-explainer"))
            .toHaveTextContent("Stage volumes rescale to 288 ml to match the new dose.");

        await rerender(
            <QuickEditPanel recipe={coffeeRecipe()} adjustments={{ratio: 17}}
                            accent={palette.brand} temperatureUnit="C" onChange={jest.fn()}/>
        );

        expect(screen.getByTestId("quick-edit-explainer"))
            .toHaveTextContent("Stage volumes rescale to 340 ml to match the new ratio.");
    });

    it("omits the explainer for grind and temperature changes", async () => {
        const {rerender} = await draw({grind: 66});

        expect(screen.queryByTestId("quick-edit-explainer")).toBeNull();

        await rerender(
            <QuickEditPanel recipe={coffeeRecipe()} adjustments={{tempOffset: 2}}
                            accent={palette.brand} temperatureUnit="C" onChange={jest.fn()}/>
        );

        expect(screen.queryByTestId("quick-edit-explainer")).toBeNull();
    });

    it("surfaces problems and reports brewability through the render prop", async () => {
        await renderWithProviders(
            <QuickEditPanel recipe={coffeeRecipe()} adjustments={{ratio: 100}}
                            accent={palette.brand} temperatureUnit="C" onChange={jest.fn()}
                            renderBrewAction={({brewable}) => (
                                <Text testID="host-brewable">
                                    {brewable ? "brewable" : "blocked"}
                                </Text>
                            )}/>
        );

        expect(screen.getByTestId("quick-edit-problems"))
            .toHaveTextContent(/Stage 1 pours/);
        expect(screen.getByTestId("host-brewable")).toHaveTextContent("blocked");
    });

    it("shows quick edit problems in the selected temperature unit", async () => {
        const recipe = coffeeRecipe();
        recipe.pours[0].temperature = 38;

        await draw({}, recipe, jest.fn(), "F");

        expect(screen.getByTestId("quick-edit-problems"))
            .toHaveTextContent(/Stage 1 brews at 100 F\. The range is 102-210 F\./);
    });

    it("reports brewable when there are no problems", async () => {
        await renderWithProviders(
            <QuickEditPanel recipe={coffeeRecipe()} adjustments={{grind: 66}}
                            accent={palette.brand} temperatureUnit="C" onChange={jest.fn()}
                            renderBrewAction={({brewable}) => (
                                <Text testID="host-brewable">
                                    {brewable ? "brewable" : "blocked"}
                                </Text>
                            )}/>
        );

        expect(screen.queryByTestId("quick-edit-problems")).toBeNull();
        expect(screen.getByTestId("host-brewable")).toHaveTextContent("brewable");
    });

    it("resets every adjustment", async () => {
        const {onChange} = await draw({
            dose: 18,
            ratio: 15,
            grind: 66,
            tempOffset: -2
        });

        await fireEvent.press(screen.getByLabelText("Reset quick edits"));

        expect(onChange).toHaveBeenCalledWith({});
    });

    describe("dose presets", () => {
        function drawWithSave(
            adjustments: QuickEditAdjustments,
            recipe: Recipe = coffeeRecipe(),
            onSaveDose = jest.fn()
        ) {
            return renderWithProviders(
                <QuickEditPanel recipe={recipe} adjustments={adjustments}
                                accent={palette.brand} temperatureUnit="C"
                                onChange={jest.fn()} onSaveDose={onSaveDose}/>
            ).then(() => onSaveDose);
        }

        it("offers 15, 18 and 20 g with the current dose lit", async () => {
            await draw();

            expect(screen.getByTestId("quick-edit-dose-presets")).toBeTruthy();
            expect(screen.getByLabelText("Brew at 15 grams")).toBeTruthy();
            expect(screen.getByLabelText("Brew at 18 grams")).toBeTruthy();
            expect(screen.getByLabelText("Brew at 20 grams, the recipe's dose"))
                .toHaveProp("accessibilityState", expect.objectContaining({selected: true}));
            expect(screen.getByLabelText("Brew at 15 grams"))
                .toHaveProp("accessibilityState", expect.objectContaining({selected: false}));
        });

        it("adds the recipe's own dose when it is not a preset", async () => {
            await draw({}, coffeeRecipe({dosage: 12}));

            expect(screen.getByLabelText("Brew at 12 grams, the recipe's dose")).toBeTruthy();
            expect(screen.getByLabelText("Brew at 20 grams")).toBeTruthy();
        });

        it("replaces the saved-dose chip when the same recipe is edited in place", async () => {
            const recipe = coffeeRecipe({dosage: 12});
            recipe.autoFixPourVolumes();
            const {onChange, rerender} = await draw({dose: 16}, recipe);
            expect(screen.getByLabelText("Brew at 12 grams, the recipe's dose")).toBeTruthy();

            recipe.dosage = 16;
            recipe.autoFixPourVolumes();
            await rerender(
                <QuickEditPanel recipe={recipe} adjustments={{}}
                                accent={palette.brand} temperatureUnit="C" onChange={onChange}/>
            );

            expect(screen.queryByTestId("quick-edit-dose-preset-12")).toBeNull();
            expect(screen.getByLabelText("Brew at 16 grams, the recipe's dose"))
                .toHaveProp("accessibilityState", expect.objectContaining({selected: true}));
            await fireEvent.press(screen.getByLabelText("Brew at 16 grams, the recipe's dose"));
            expect(onChange).toHaveBeenLastCalledWith({});
        });

        it("sets the dose for this brew, and the recipe's chip takes it back", async () => {
            const {onChange, rerender} = await draw();

            await fireEvent.press(screen.getByLabelText("Brew at 15 grams"));
            expect(onChange).toHaveBeenLastCalledWith({dose: 15});

            await rerender(
                <QuickEditPanel recipe={coffeeRecipe()} adjustments={{dose: 15, ratio: 17}}
                                accent={palette.brand} temperatureUnit="C" onChange={onChange}/>
            );
            await fireEvent.press(screen.getByLabelText("Brew at 20 grams, the recipe's dose"));
            expect(onChange).toHaveBeenLastCalledWith({ratio: 17});
        });

        it("draws no presets for tea", async () => {
            await draw({}, teaRecipe());

            expect(screen.queryByTestId("quick-edit-dose-presets")).toBeNull();
        });

        it("shows the bypass and the whole cup once the dose moves", async () => {
            const recipe = coffeeRecipe();
            recipe.bypassEnabled = true;
            recipe.bypassVolume = 40;
            await draw({dose: 15}, recipe);

            expect(screen.getByTestId("quick-edit-explainer")).toHaveTextContent(
                "Stage volumes rescale to 240 ml to match the new dose. " +
                "Bypass water rescales to 30 ml, so the cup gets 270 ml."
            );
        });

        it("offers no save when the host has not asked for one", async () => {
            await draw({dose: 15});

            expect(screen.queryByTestId("quick-edit-save-dose")).toBeNull();
        });

        it("offers no save until the dose has moved", async () => {
            await drawWithSave({ratio: 17});

            expect(screen.queryByTestId("quick-edit-save-dose")).toBeNull();
        });

        it("saves the adjusted dose through the host", async () => {
            const onSaveDose = await drawWithSave({dose: 15});

            expect(screen.getByTestId("quick-edit-save-dose")).toHaveTextContent("SAVE AS 15 G");
            await fireEvent.press(screen.getByLabelText("Save the recipe at 15 grams"));

            expect(onSaveDose).toHaveBeenCalledWith(15);
        });

        it("refuses to save, and says why, when a stage would pass the machine's limit", async () => {
            const recipe = coffeeRecipe();
            recipe.pours = [
                new Pour(1, 40, 88, 30, 0, 0, 0),
                new Pour(2, 280, 88, 30, 0, 0, 0)
            ];
            await drawWithSave({dose: 18}, recipe);

            expect(screen.queryByTestId("quick-edit-save-dose")).toBeNull();
            expect(screen.getByTestId("quick-edit-problems"))
                .toHaveTextContent(/Stage 2 pours 252 ml\. The most is 240 ml\./);
        });
    });
});
