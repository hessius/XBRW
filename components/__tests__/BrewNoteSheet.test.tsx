import React from "react";
import {fireEvent, screen, waitFor} from "@testing-library/react-native";

import BrewNoteSheet from "@/components/BrewNoteSheet";
import {
    COFFEE_JUDGEMENT_PLACEHOLDER, TEA_JUDGEMENT_PLACEHOLDER
} from "@/constants/brewCopy";
import {renderWithProviders, SHEET_PRESS_TIMEOUT} from "@/test-utils/render";

describe("BrewNoteSheet", () => {
    it.each([undefined, "coffee", "tea"] as const)(
        "uses %s note copy and still commits edits",
        async (beverageKind) => {
            const onNote = jest.fn();
            await renderWithProviders(
                <BrewNoteSheet open={true} onOpenChange={() => {}}
                               figures="14:32 · 244 G" recipeName="Morning Bloem"
                               beverageKind={beverageKind}
                               rating={4} note="" onRate={() => {}} onNote={onNote}/>
            );
            const placeholder = beverageKind === "tea"
                ? TEA_JUDGEMENT_PLACEHOLDER : COFFEE_JUDGEMENT_PLACEHOLDER;
            const field = await screen.findByPlaceholderText(placeholder);
            if (beverageKind === "tea") {
                expect(screen.queryByPlaceholderText(COFFEE_JUDGEMENT_PLACEHOLDER)).toBeNull();
            }
            await fireEvent(field, "endEditing", {nativeEvent: {text: "Floral"}});
            expect(onNote).toHaveBeenCalledWith("Floral");
        }
    );

    it("names the brew by its figures", async () => {
        await renderWithProviders(
            <BrewNoteSheet open={true} onOpenChange={() => {}}
                           figures="14:32 · 244 G" recipeName="Morning Bloem"
                           rating={4} note="" onRate={() => {}} onNote={() => {}}/>
        );
        expect(await screen.findByText("14:32 · 244 G")).toBeTruthy();
        expect(screen.getByText("MORNING BLOEM")).toBeTruthy();
    });

    it("reports a note when the field is committed", async () => {
        const onNote = jest.fn();
        await renderWithProviders(
            <BrewNoteSheet open={true} onOpenChange={() => {}}
                           figures="14:32 · 244 G" recipeName="Morning Bloem"
                           rating={4} note="" onRate={() => {}} onNote={onNote}/>
        );
        const field = await screen.findByTestId("judgement-note");
        await fireEvent(field, "endEditing", {nativeEvent: {text: "Sweet"}});
        expect(onNote).toHaveBeenCalledWith("Sweet");
    });

    it("does not clear a rating by tapping the lit star", async () => {
        const onRate = jest.fn();
        await renderWithProviders(
            <BrewNoteSheet open={true} onOpenChange={() => {}}
                           figures="14:32 · 244 G" recipeName="Morning Bloem"
                           rating={4} note="" onRate={onRate} onNote={() => {}}/>
        );

        await waitFor(async () => {
            await fireEvent.press(screen.getByLabelText("Rate 4 stars"));
            expect(onRate).toHaveBeenCalledWith(4);
        }, {timeout: SHEET_PRESS_TIMEOUT});
    });

    it("closes when done is pressed", async () => {
        const onOpenChange = jest.fn();
        await renderWithProviders(
            <BrewNoteSheet open={true} onOpenChange={onOpenChange}
                           figures="14:32 · 244 G" recipeName="Morning Bloem"
                           rating={4} note="" onRate={() => {}} onNote={() => {}}/>
        );
        // The sheet's entrance discards a press aimed at a node that is
        // findable but not yet settled, so the press is retried.
        await waitFor(async () => {
            await fireEvent.press(screen.getByTestId("brew-note-done"));
            expect(onOpenChange).toHaveBeenCalledWith(false);
        }, {timeout: SHEET_PRESS_TIMEOUT});
    });
});
