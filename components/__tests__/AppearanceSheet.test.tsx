import React from "react";
import {fireEvent, screen, within, waitFor} from "@testing-library/react-native";
import {SafeAreaProvider} from "react-native-safe-area-context";
import {PixelRatio} from "react-native";
import AppearanceSheet from "@/components/AppearanceSheet";
import {accents, resolveAppearance} from "@/constants/colors";
import {AppearanceScope} from "@/hooks/useAppearance";
import {THEME_IDS} from "@/library/appearance";
import {renderWithProviders, SHEET_PRESS_TIMEOUT} from "@/test-utils/render";

it("keeps all labelled choices inside a scroll container on a small, large-font viewport", async () => {
    const fontScale = jest.spyOn(PixelRatio, "getFontScale").mockReturnValue(2);
    const chooseTheme = jest.fn();
    const chooseRecipeColours = jest.fn();
    const chooseLabels = jest.fn();
    await renderWithProviders(
        <SafeAreaProvider initialMetrics={{
            frame: {x: 0, y: 0, width: 320, height: 480},
            insets: {top: 20, left: 0, right: 0, bottom: 0}
        }}>
            <AppearanceSheet open onOpenChange={jest.fn()}
                choice={{theme: "original", recipeColours: "themed"}}
                chooseTheme={chooseTheme} chooseRecipeColours={chooseRecipeColours}
                solidControlLabels={false} onSolidControlLabelsChange={chooseLabels}/>
        </SafeAreaProvider>);
    const scroll = screen.getByTestId("appearance-scroll");
    await fireEvent(scroll, "layout", {nativeEvent: {layout: {width: 320, height: 180}}});
    await fireEvent.scroll(scroll, {nativeEvent: {
        contentOffset: {x: 0, y: 900}, contentSize: {width: 320, height: 1100},
        layoutMeasurement: {width: 320, height: 180}
    }});
    // Unit reachability, not a measurement of native text layout or clipping.
    const choices = within(scroll);
    expect(choices.getAllByRole("radio")).toHaveLength(6);
    for (const label of ["Original Dark", "Light", "Offline Blue", "Magenta", "Original", "Themed"]) {
        expect(choices.getByRole("radio", {name: label})).toBeTruthy();
    }
    expect(choices.getByRole("radio", {name: "Original Dark"})).toBeChecked();
    expect(choices.getByRole("radio", {name: "Themed"})).toBeChecked();
    expect(choices.getAllByText("Selected")).toHaveLength(2);
    expect(choices.getByRole("switch", {name: "Solid button labels"})).not.toBeChecked();
    await waitFor(async () => {
        await fireEvent.press(choices.getByRole("radio", {name: "Magenta"}));
        expect(chooseTheme).toHaveBeenCalledWith("magenta");
        await fireEvent.press(choices.getByRole("radio", {name: "Original"}));
        expect(chooseRecipeColours).toHaveBeenCalledWith("original");
        await fireEvent.press(choices.getByRole("switch", {name: "Solid button labels"}));
        expect(chooseLabels).toHaveBeenCalledWith(true);
    }, {timeout: SHEET_PRESS_TIMEOUT});
    fontScale.mockRestore();
});

it("previews each candidate locally with foregrounds matching the actual recipe fill", async () => {
    const view = await renderWithProviders(
        <AppearanceScope choice={{theme: "blue", recipeColours: "themed"}}>
            <AppearanceSheet open onOpenChange={jest.fn()}
                choice={{theme: "blue", recipeColours: "themed"}}
                chooseTheme={jest.fn()} chooseRecipeColours={jest.fn()}
                solidControlLabels={false} onSolidControlLabelsChange={jest.fn()}/>
        </AppearanceScope>);
    for (const theme of THEME_IDS) {
        const candidate = resolveAppearance({theme, recipeColours: "themed"});
        expect(screen.getByTestId(`appearance-preview-${theme}`, {includeHiddenElements: true}))
            .toHaveStyle({backgroundColor: candidate.palette.base});
        const recipe = candidate.recipe(accents.coffee[0]);
        expect(screen.getByTestId(`appearance-preview-recipe-${theme}`, {includeHiddenElements: true}))
            .toHaveStyle({backgroundColor: recipe.fill});
        expect(screen.getByTestId(`appearance-preview-label-${theme}`, {includeHiddenElements: true}))
            .toHaveStyle({color: candidate.onFill(recipe.fill).text});
    }
    expect(view.toJSON()).toBeTruthy();
    expect(screen.getByRole("radio", {name: "Offline Blue"})).toBeChecked();
});
