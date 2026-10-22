import React from "react";
import {fireEvent, screen, within} from "@testing-library/react-native";

import RoasterCoffeeRow from "@/components/RoasterCoffeeRow";
import {renderWithProviders} from "@/test-utils/render";
import {feed} from "@/test-utils/roasterFeed";

describe("roaster row photo failures", () => {
    it("keeps a failed URI blank but requests a replacement URI for the same coffee", async () => {
        const [coffee] = feed([{id: "stable"}]).coffees;
        const draw = (image = coffee.image) => (
            <RoasterCoffeeRow coffee={{...coffee, image}} onPress={jest.fn()} testID="row"/>
        );
        const view = await renderWithProviders(draw());
        await fireEvent(screen.getByTestId("roaster-row-photo"), "error");
        await view.rerender(draw());
        expect(screen.queryByTestId("roaster-row-photo")).toBeNull();
        expect(screen.getByTestId("roaster-row-photo-blank")).toBeTruthy();

        const replacement = "https://roaster.example/cdn/replacement.png";
        await view.rerender(draw(replacement));
        expect(screen.getByTestId("roaster-row-photo").props.source).toEqual({uri: replacement});
        expect(screen.queryByTestId("roaster-row-photo-blank")).toBeNull();
    });

    it("does not share a failed URI between row mounts", async () => {
        const [coffee] = feed([{id: "stable"}]).coffees;
        await renderWithProviders(<>
            <RoasterCoffeeRow coffee={coffee} onPress={jest.fn()} testID="first"/>
            <RoasterCoffeeRow coffee={coffee} onPress={jest.fn()} testID="second"/>
        </>);
        await fireEvent(within(screen.getByTestId("first")).getByTestId("roaster-row-photo"), "error");
        expect(within(screen.getByTestId("first")).getByTestId("roaster-row-photo-blank")).toBeTruthy();
        expect(within(screen.getByTestId("second")).getByTestId("roaster-row-photo")).toBeTruthy();
    });
});
