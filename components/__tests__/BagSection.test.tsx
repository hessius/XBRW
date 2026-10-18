import React from "react";
import {fireEvent, screen} from "@testing-library/react-native";

import BagSection, {type BagSectionProps} from "@/components/BagSection";
import {newBag, readBag} from "@/library/coffeeBag";
import {renderWithProviders} from "@/test-utils/render";

const NOW = new Date(2026, 9, 18, 9).getTime();
const BAG = {...newBag("r1", {sizeGrams: 250, roastedOn: "2026-10-12"}, NOW), id: "bag-1"};
const URL = "https://roaster.example/guji";

function props(over: Partial<BagSectionProps> = {}): BagSectionProps {
    return {
        tracker: "xbrw",
        bag: BAG,
        reading: readBag(BAG, 38, 18),
        reorderUrl: URL,
        onOpenSheet: jest.fn(),
        onFinish: jest.fn(),
        onReorder: jest.fn(),
        ...over
    };
}

describe("BagSection", () => {
    it("invites a bag when there is none", async () => {
        const onOpenSheet = jest.fn();
        await renderWithProviders(<BagSection {...props({bag: null, reading: null, onOpenSheet})}/>);
        expect(screen.getByTestId("bag-none")).toBeTruthy();
        await fireEvent.press(screen.getByLabelText("I bought a bag"));
        expect(onOpenSheet).toHaveBeenCalled();
    });

    it("says what is left, about how many brews, and when it was roasted", async () => {
        await renderWithProviders(<BagSection {...props()}/>);
        expect(screen.getByTestId("bag-remaining")).toHaveTextContent("212 g left, about 11 brews.");
        expect(screen.getByTestId("bag-facts")).toHaveTextContent("250 g bag. Roasted 2026-10-12.");
        expect(screen.queryByTestId("bag-low")).toBeNull();
        // Not low yet, so no reorder.
        expect(screen.queryByTestId("bag-reorder")).toBeNull();
    });

    it("runs low with a reorder that opens the roaster's page", async () => {
        const onReorder = jest.fn();
        await renderWithProviders(
            <BagSection {...props({reading: readBag(BAG, 220, 18), onReorder})}/>
        );
        expect(screen.getByTestId("bag-low")).toHaveTextContent("Running low.");
        await fireEvent.press(screen.getByLabelText("Reorder this coffee"));
        expect(onReorder).toHaveBeenCalledWith(URL);
    });

    it("hides reorder when there is nowhere to reorder from", async () => {
        await renderWithProviders(
            <BagSection {...props({reading: readBag(BAG, 220, 18), reorderUrl: undefined})}/>
        );
        expect(screen.getByTestId("bag-low")).toBeTruthy();
        expect(screen.queryByTestId("bag-reorder")).toBeNull();
    });

    it("offers to finish an empty bag", async () => {
        const onFinish = jest.fn();
        await renderWithProviders(
            <BagSection {...props({reading: readBag(BAG, 240, 18), onFinish})}/>
        );
        expect(screen.getByTestId("bag-empty")).toBeTruthy();
        expect(screen.queryByTestId("bag-low")).toBeNull();
        await fireEvent.press(screen.getByLabelText("Mark this bag finished"));
        expect(onFinish).toHaveBeenCalled();
    });

    it("draws no estimate when Beanconqueror tracks the bag, and keeps reorder", async () => {
        await renderWithProviders(
            <BagSection {...props({tracker: "beanconqueror", reading: null})}/>
        );
        expect(screen.getByTestId("bag-elsewhere")).toHaveTextContent("Bag tracked in Beanconqueror.");
        expect(screen.queryByTestId("bag-remaining")).toBeNull();
        expect(screen.queryByTestId("bag-low")).toBeNull();
        expect(screen.getByTestId("bag-reorder")).toBeTruthy();
    });
});
