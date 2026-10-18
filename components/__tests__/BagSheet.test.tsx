import React from "react";
import {fireEvent, screen} from "@testing-library/react-native";

import BagSheet from "@/components/BagSheet";
import {newBag, type BagTracker, type CoffeeBag} from "@/library/coffeeBag";
import {renderWithProviders} from "@/test-utils/render";

function noop() {}

const BAG = {...newBag("r1", {sizeGrams: 250, roastedOn: "2026-10-12"}, 1_760_000_000_000), id: "bag-1"};

async function open(over: {
    tracker?: BagTracker; bag?: CoffeeBag | null; gramsLeft?: number | null;
    onSave?: jest.Mock; onFinish?: jest.Mock; onRemove?: jest.Mock;
    beanNameFixed?: boolean; suggestedRoastedOn?: string;
} = {}) {
    await renderWithProviders(
        <BagSheet open onOpenChange={noop} epoch={1}
                  tracker={over.tracker ?? "xbrw"}
                  bag={over.bag === undefined ? null : over.bag}
                  gramsLeft={over.gramsLeft ?? null}
                  suggestedRoastedOn={over.suggestedRoastedOn}
                  beanName="Ethiopia Guji" beanNameFixed={over.beanNameFixed ?? false}
                  onSave={over.onSave ?? jest.fn()}
                  onFinish={over.onFinish ?? jest.fn()}
                  onRemove={over.onRemove ?? jest.fn()}/>
    );
}

describe("BagSheet", () => {
    it("adds a bag from a preset size and a roast day", async () => {
        const onSave = jest.fn();
        await open({onSave, suggestedRoastedOn: "2026-10-01"});
        await fireEvent.press(screen.getByTestId("bag-size-320"));
        expect(screen.getByTestId("bag-roasted-field").props.value).toBe("2026-10-01");
        await fireEvent.changeText(screen.getByTestId("bag-roasted-field"), "2026-10-12");
        await fireEvent.press(screen.getByTestId("bag-save"));
        expect(onSave).toHaveBeenCalledWith({sizeGrams: 320, roastedOn: "2026-10-12"});
    });

    it("takes a custom size and refuses one that is not whole grams", async () => {
        const onSave = jest.fn();
        await open({onSave});
        await fireEvent.press(screen.getByTestId("bag-size-other"));
        await fireEvent.changeText(screen.getByTestId("bag-size-field"), "12.5");
        expect(screen.getByTestId("bag-size-error")).toBeTruthy();
        await fireEvent.press(screen.getByTestId("bag-save"));
        expect(onSave).not.toHaveBeenCalled();
        await fireEvent.changeText(screen.getByTestId("bag-size-field"), "750");
        await fireEvent.press(screen.getByTestId("bag-save"));
        expect(onSave).toHaveBeenCalledWith({sizeGrams: 750});
    });

    it("refuses a roast day that is not a day", async () => {
        const onSave = jest.fn();
        await open({onSave});
        await fireEvent.changeText(screen.getByTestId("bag-roasted-field"), "2026-02-31");
        await fireEvent.press(screen.getByTestId("bag-save"));
        expect(onSave).not.toHaveBeenCalled();
    });

    it("lets the grams left be corrected while editing", async () => {
        const onSave = jest.fn();
        await open({onSave, bag: BAG, gramsLeft: 212});
        expect(screen.getByTestId("bag-left-field").props.value).toBe("212");
        await fireEvent.changeText(screen.getByTestId("bag-left-field"), "150");
        await fireEvent.press(screen.getByTestId("bag-save"));
        expect(onSave).toHaveBeenCalledWith({sizeGrams: 250, roastedOn: "2026-10-12", gramsLeft: 150});
    });

    it("finishes or removes an open bag", async () => {
        const onFinish = jest.fn();
        const onRemove = jest.fn();
        await open({bag: BAG, gramsLeft: 10, onFinish, onRemove});
        await fireEvent.press(screen.getByTestId("bag-sheet-finish"));
        await fireEvent.press(screen.getByTestId("bag-sheet-remove"));
        expect(onFinish).toHaveBeenCalled();
        expect(onRemove).toHaveBeenCalled();
    });

    it("in Beanconqueror mode asks for the bean name and price, not the grams left", async () => {
        const onSave = jest.fn();
        await open({tracker: "beanconqueror", onSave});
        expect(screen.getByTestId("bag-bean-name-field").props.value).toBe("Ethiopia Guji");
        expect(screen.queryByTestId("bag-left-field")).toBeNull();
        expect(screen.getByText("SEND TO BEANCONQUEROR")).toBeTruthy();
        await fireEvent.changeText(screen.getByTestId("bag-price-field"), "24,50");
        await fireEvent.press(screen.getByTestId("bag-save"));
        expect(onSave).toHaveBeenCalledWith({
            sizeGrams: 250, price: 24.5, beanName: "Ethiopia Guji"
        });
    });

    it("shows a pod's name without letting it be changed", async () => {
        await open({tracker: "beanconqueror", beanNameFixed: true});
        expect(screen.getByTestId("bag-bean-name")).toHaveTextContent("Ethiopia Guji");
        expect(screen.queryByTestId("bag-bean-name-field")).toBeNull();
    });
});
