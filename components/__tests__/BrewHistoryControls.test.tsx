import React from "react";
import {fireEvent, screen, waitFor} from "@testing-library/react-native";

import BrewHistoryControls, {BrewHistorySortSheet} from "@/components/BrewHistoryControls";
import type {HistoryQuery} from "@/library/brew/historyQuery";
import {renderWithProviders, SHEET_PRESS_TIMEOUT} from "@/test-utils/render";

const query: HistoryQuery = {
    sort: "date", direction: "desc", hideUnsuccessful: false, ratedOnly: false
};

describe("BrewHistoryControls", () => {
    it("renders two independent checked chips and a named sort opener", async () => {
        const hide = jest.fn();
        const rated = jest.fn();
        const sort = jest.fn();
        await renderWithProviders(<BrewHistoryControls query={{...query, ratedOnly: true}}
            onToggleHideUnsuccessful={hide} onToggleRatedOnly={rated} onOpenSort={sort}/>);
        expect(screen.getByRole("checkbox", {name: "Hide unsuccessful"})).not.toBeChecked();
        expect(screen.getByRole("checkbox", {name: "Rated only"})).toBeChecked();
        await fireEvent.press(screen.getByLabelText("Hide unsuccessful"));
        expect(hide).toHaveBeenCalledTimes(1);
        expect(rated).not.toHaveBeenCalled();
        await fireEvent.press(screen.getByLabelText("Rated only"));
        await fireEvent.press(screen.getByLabelText("Sort brew history"));
        expect(rated).toHaveBeenCalledTimes(1);
        expect(sort).toHaveBeenCalledTimes(1);
        expect(screen.getByText(/DATE/)).toBeTruthy();
    });

    it("offers exactly five axes, both directions, and scrollable sheet content", async () => {
        const change = jest.fn();
        await renderWithProviders(<BrewHistorySortSheet open onOpenChange={jest.fn()}
            sort="dose" direction="asc" onSortChange={change}/>);
        for (const axis of ["Date", "Rating", "Dose", "Ratio", "Grind"]) {
            expect(screen.getByRole("radio", {name: axis})).toBeTruthy();
        }
        expect(screen.getAllByRole("radio")).toHaveLength(7);
        expect(screen.getByRole("radio", {name: "Dose"})).toBeChecked();
        expect(screen.getByTestId("history-sort-scroll")).toBeTruthy();
        await waitFor(async () => {
            await fireEvent.press(screen.getByRole("radio", {name: "Grind"}));
            expect(change).toHaveBeenCalledWith("grind", "asc");
        }, {timeout: SHEET_PRESS_TIMEOUT});
        await fireEvent.press(screen.getByRole("radio", {name: "HIGHEST"}));
        expect(change).toHaveBeenCalledWith("dose", "desc");
    });
});
