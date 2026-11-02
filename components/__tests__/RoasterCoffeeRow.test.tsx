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

describe("roaster row details", () => {
    function coffeeWith(bean: Record<string, unknown>) {
        const [coffee] = feed([{id: "row"}]).coffees;
        return {...coffee, coffee: {name: coffee.coffee.name, ...bean}, flavours: ["Plum", "Cocoa"]};
    }

    it("reads name, country and farm, variety and process, roast, then flavours", async () => {
        await renderWithProviders(<RoasterCoffeeRow testID="row" onPress={jest.fn()} coffee={coffeeWith({
            country: "Colombia", farm: "La Palma", region: "Cundinamarca",
            variety: "Gesha", processing: "Washed"
        })}/>);
        expect(screen.getByTestId("roaster-row-place")).toHaveTextContent("Colombia · La Palma");
        expect(screen.getByTestId("roaster-row-bean")).toHaveTextContent("Gesha · Washed");
        expect(screen.getByText("Plum, Cocoa")).toBeTruthy();
        expect(screen.getByLabelText(
            "Coffee row, Colombia, La Palma, Gesha, Washed, Light roast, Plum, Cocoa"
        )).toBeTruthy();
    });

    it("falls back to the region without a farm and skips empty parts", async () => {
        await renderWithProviders(<RoasterCoffeeRow testID="row" onPress={jest.fn()} coffee={coffeeWith({
            region: "Huila", farm: "  ", variety: "Caturra"
        })}/>);
        expect(screen.getByTestId("roaster-row-place")).toHaveTextContent("Huila");
        expect(screen.getByTestId("roaster-row-bean")).toHaveTextContent("Caturra");
    });

    it("leaves out both lines when the feed has none of it", async () => {
        await renderWithProviders(<RoasterCoffeeRow testID="row" onPress={jest.fn()} coffee={coffeeWith({})}/>);
        expect(screen.queryByTestId("roaster-row-place")).toBeNull();
        expect(screen.queryByTestId("roaster-row-bean")).toBeNull();
        expect(screen.getByLabelText("Coffee row, Light roast, Plum, Cocoa")).toBeTruthy();
    });
});
