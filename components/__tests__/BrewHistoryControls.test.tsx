import React from "react";
import {fireEvent, screen, waitFor} from "@testing-library/react-native";

import BrewHistoryControls, {BrewHistorySortSheet} from "@/components/BrewHistoryControls";
import type {HistoryQuery} from "@/library/brew/historyQuery";
import {renderWithProviders, SHEET_PRESS_TIMEOUT} from "@/test-utils/render";

const query: HistoryQuery = {
    sort: "date", direction: "desc", hideUnsuccessful: false, ratedOnly: false
};

describe("BrewHistoryControls", () => {
    it("shows the applied count, and its filter row holds two independent checked chips", async () => {
        const hide = jest.fn();
        const rated = jest.fn();
        await renderWithProviders(<BrewHistoryControls query={{...query, ratedOnly: true}} editing={false}
            onToggleHideUnsuccessful={hide} onToggleRatedOnly={rated} onOpenSort={jest.fn()}/>);
        expect(screen.queryByTestId("history-filter-row")).toBeNull();
        expect(screen.getByLabelText("1 filter applied. Tap to show the filter row.")).toBeTruthy();
        await fireEvent.press(screen.getByTestId("history-filter-toggle"));
        expect(screen.getByRole("checkbox", {name: "Hide unsuccessful"})).not.toBeChecked();
        expect(screen.getByRole("checkbox", {name: "Rated only"})).toBeChecked();
        await fireEvent.press(screen.getByLabelText("Hide unsuccessful"));
        expect(hide).toHaveBeenCalledTimes(1);
        expect(rated).not.toHaveBeenCalled();
    });

    it("names the sort once it leaves the default and opens the sheet", async () => {
        const sort = jest.fn();
        await renderWithProviders(<BrewHistoryControls query={{...query, sort: "dose", direction: "asc"}}
            editing={false} onToggleHideUnsuccessful={jest.fn()} onToggleRatedOnly={jest.fn()}
            onOpenSort={sort}/>);
        await fireEvent.press(screen.getByLabelText("Sort brew history. Dose, lowest first."));
        expect(sort).toHaveBeenCalledTimes(1);
        expect(screen.getByText(/DOSE/)).toBeTruthy();
    });

    it("offers the edit chip only when there is something to edit", async () => {
        const edit = jest.fn();
        const {rerender} = await renderWithProviders(<BrewHistoryControls query={query} editing={false}
            onToggleEdit={edit} onToggleHideUnsuccessful={jest.fn()} onToggleRatedOnly={jest.fn()}
            onOpenSort={jest.fn()}/>);
        await fireEvent.press(screen.getByLabelText("Edit brews"));
        expect(edit).toHaveBeenCalledTimes(1);
        await rerender(<BrewHistoryControls query={query} editing={false}
            onToggleHideUnsuccessful={jest.fn()} onToggleRatedOnly={jest.fn()} onOpenSort={jest.fn()}/>);
        expect(screen.queryByLabelText("Edit brews")).toBeNull();
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
