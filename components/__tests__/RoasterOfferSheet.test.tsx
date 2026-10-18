import React from "react";
import {fireEvent, screen} from "@testing-library/react-native";

import NewerVersionPrompt from "@/components/NewerVersionPrompt";
import RoasterCoffeeRow from "@/components/RoasterCoffeeRow";
import RoasterOfferSheet from "@/components/RoasterOfferSheet";
import ShelfChoiceSheet from "@/components/ShelfChoiceSheet";
import {renderWithProviders} from "@/test-utils/render";
import {feed} from "@/test-utils/roasterFeed";

describe("RoasterOfferSheet", () => {
    it("asks to subscribe, in the owner's words", async () => {
        await renderWithProviders(
            <RoasterOfferSheet state={{phase: "offer", roaster: "Test Roaster", count: 30}}
                               onAccept={jest.fn()} onDecline={jest.fn()}/>
        );
        expect(screen.getByText("Subscribe to Test Roaster?")).toBeTruthy();
        expect(screen.getByText("Browse all 30 coffees and their recipes in XBRW++. " +
            "New coffees appear as they're released.")).toBeTruthy();
        expect(screen.getByRole("checkbox", {name: "Don't ask again for this roaster"})).toBeTruthy();
    });

    it("passes the tick with the answer, then clears it", async () => {
        const onAccept = jest.fn();
        const onDecline = jest.fn();
        await renderWithProviders(
            <RoasterOfferSheet state={{phase: "offer", roaster: "Test Roaster", count: 2}}
                               onAccept={onAccept} onDecline={onDecline}/>
        );

        await fireEvent.press(screen.getByTestId("roaster-offer-not-now"));
        expect(onDecline).toHaveBeenLastCalledWith(false);

        await fireEvent.press(screen.getByTestId("roaster-offer-dont-ask"));
        expect(screen.getByRole("checkbox")).toBeChecked();
        await fireEvent.press(screen.getByTestId("roaster-offer-subscribe"));
        expect(onAccept).toHaveBeenLastCalledWith(true);
        expect(screen.getByRole("checkbox")).not.toBeChecked();
    });
});

describe("RoasterCoffeeRow", () => {
    it("shows the roast, notes and bag sizes, and says sold out", async () => {
        const [coffee] = feed([{id: "a", available: false}]).coffees;
        await renderWithProviders(<RoasterCoffeeRow coffee={coffee} testID="row" onPress={jest.fn()}/>);
        expect(screen.getByTestId("roaster-row-sold-out")).toBeTruthy();
        expect(screen.getByText("LIGHT")).toBeTruthy();
        expect(screen.getByText("320 G · 160 G")).toBeTruthy();
        expect(screen.getByLabelText(/Coffee a, sold out, Light roast/)).toBeTruthy();
    });
});

describe("NewerVersionPrompt", () => {
    it("offers both answers and names the user's copy", async () => {
        const onLatest = jest.fn();
        const onKeep = jest.fn();
        await renderWithProviders(<NewerVersionPrompt name="Mine" onLatest={onLatest} onKeep={onKeep}/>);
        expect(screen.getByText("The roaster has a newer version")).toBeTruthy();
        expect(screen.getByText("You have changed Mine. Your name, notes and brews stay either way."))
            .toBeTruthy();
        await fireEvent.press(screen.getByTestId("newer-version-latest"));
        await fireEvent.press(screen.getByTestId("newer-version-keep"));
        expect(onLatest).toHaveBeenCalledTimes(1);
        expect(onKeep).toHaveBeenCalledTimes(1);
    });
});

describe("ShelfChoiceSheet", () => {
    it("lists the user's shelves and a way to make one", async () => {
        const onChoose = jest.fn();
        const onNew = jest.fn();
        await renderWithProviders(
            <ShelfChoiceSheet open shelves={["Pantry", "Gifts"]} onOpenChange={jest.fn()}
                              onChoose={onChoose} onNew={onNew}/>
        );
        await fireEvent.press(screen.getByTestId("shelf-choice-Pantry"));
        expect(onChoose).toHaveBeenCalledWith("Pantry");
        await fireEvent.press(screen.getByTestId("shelf-choice-new"));
        expect(onNew).toHaveBeenCalledTimes(1);
    });
});
