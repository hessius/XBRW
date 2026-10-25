import React from "react";
import {fireEvent, screen, within} from "@testing-library/react-native";

import BeanNameSheet from "@/components/BeanNameSheet";
import BrewNoteSheet from "@/components/BrewNoteSheet";
import LeaveEditorSheet from "@/components/LeaveEditorSheet";
import {RATING_SHEET_DONE} from "@/constants/brewCopy";
import {resolveAppearance} from "@/constants/colors";
import {AppearanceScope} from "@/hooks/useAppearance";
import {THEME_IDS} from "@/library/appearance";
import {renderWithProviders} from "@/test-utils/render";

it.each(THEME_IDS)("uses the primary pair for save in %s", async theme => {
    const choice = {theme, recipeColours: "themed" as const};
    const {primary} = resolveAppearance(choice);
    await renderWithProviders(
        <AppearanceScope choice={choice}>
            <LeaveEditorSheet open intent="leave" onSave={jest.fn()}
                onDiscard={jest.fn()} onCancel={jest.fn()}/>
        </AppearanceScope>
    );
    const button = await screen.findByRole("button", {name: "Save changes"});
    expect(button).toHaveStyle({backgroundColor: primary.fill});
    expect(within(button).getByText("Save changes")).toHaveStyle({color: primary.ink});
});

it.each(THEME_IDS)("uses the primary pair for DONE in %s", async theme => {
    const choice = {theme, recipeColours: "themed" as const};
    const {primary} = resolveAppearance(choice);
    await renderWithProviders(
        <AppearanceScope choice={choice}>
            <BrewNoteSheet open onOpenChange={jest.fn()} figures="14:32"
                recipeName="Coffee" rating={0} note="" onRate={jest.fn()} onNote={jest.fn()}/>
        </AppearanceScope>
    );
    const button = await screen.findByTestId("brew-note-done");
    expect(button).toHaveStyle({backgroundColor: primary.fill});
    expect(within(button).getByText(RATING_SHEET_DONE)).toHaveStyle({color: primary.ink});
});

it.each(THEME_IDS)("keeps coffee-name actions primary in %s", async theme => {
    const choice = {theme, recipeColours: "themed" as const};
    const {primary} = resolveAppearance(choice);
    await renderWithProviders(
        <AppearanceScope choice={choice}>
            <BeanNameSheet open onOpenChange={jest.fn()} suggestion="" onConfirm={jest.fn()}/>
        </AppearanceScope>
    );
    const button = await screen.findByTestId("bean-name-send");
    expect(button).toHaveStyle({backgroundColor: primary.fill});
    expect(within(button).getByText("SKIP")).toHaveStyle({color: primary.ink});
    await fireEvent.changeText(screen.getByTestId("bean-name-field"), "Coffee");
    expect(within(screen.getByTestId("bean-name-send")).getByText("SEND"))
        .toHaveStyle({color: primary.ink});
});
