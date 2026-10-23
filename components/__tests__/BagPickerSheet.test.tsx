import React from "react";
import {fireEvent, screen, waitFor} from "@testing-library/react-native";
import BagPickerSheet from "@/components/BagPickerSheet";
import {bagFixture} from "@/test-utils/bags";
import {renderWithProviders, SHEET_PRESS_TIMEOUT} from "@/test-utils/render";

it("offers an explicit No bag alongside linked unfinished bags", async () => {
    const onSelect = jest.fn();
    await renderWithProviders(<BagPickerSheet open onOpenChange={() => {}}
        recipeName="Colombia" linked={[bagFixture(), bagFixture({id: "finished", finishedAt: 10})]}
        selectedId="bag-a" summaryFor={() => "Approx. 120 g remaining"}
        onSelect={onSelect} onLinkExisting={() => {}} onAdd={() => {}}/>);
    expect(screen.getByRole("radio", {name: /Colombia, roasted 12 Oct/}))
        .toBeChecked();
    expect(screen.getAllByRole("radio")).toHaveLength(2);
    await waitFor(async () => {
        await fireEvent.press(screen.getByRole("radio", {name: /No bag/}));
        expect(onSelect).toHaveBeenCalledWith(null);
    }, {timeout: SHEET_PRESS_TIMEOUT});
    expect(screen.getByRole("button", {name: "Use another existing bag"})).toBeTruthy();
});
