import React from "react";
import {fireEvent, screen, waitFor} from "@testing-library/react-native";
import BagSheet from "@/components/BagSheet";
import {bagFixture} from "@/test-utils/bags";
import {renderWithProviders, SHEET_PRESS_TIMEOUT} from "@/test-utils/render";
import {dayOf} from "@/library/coffeeBag";

const noop = () => {};
async function pressSave(onSave: jest.Mock) {
    await waitFor(async () => {
        await fireEvent.press(screen.getByTestId("bag-save"));
        expect(onSave).toHaveBeenCalled();
    }, {timeout: SHEET_PRESS_TIMEOUT});
}

it("requires a local name and does not invent a roast date or known medium roast", async () => {
    const onSave = jest.fn();
    await renderWithProviders(<BagSheet open epoch={1} onOpenChange={noop}
        bag={null} tracker="xbrw" gramsLeft={null} beanName="" onSave={onSave}
        onFinish={noop} onRemove={noop}/>);
    expect(screen.getByTestId("bag-roasted-value")).toHaveTextContent("Not set");
    expect(screen.getByTestId("bag-roast-medium")).not.toBeChecked();
    expect(screen.getByTestId("bag-save")).toBeDisabled();
    await fireEvent.changeText(screen.getByLabelText("Bag name"), "October bag");
    await pressSave(onSave);
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
        name: "October bag", sizeGrams: 250, adviceSource: "estimate"
    }));
    expect(onSave.mock.calls[0][0]).not.toHaveProperty("roastedOn");
});

it("allows editing all supplied guidance without moving a separately edited window end", async () => {
    const onSave = jest.fn();
    await renderWithProviders(<BagSheet open epoch={1} onOpenChange={noop}
        bag={null} tracker="xbrw" gramsLeft={null} beanName="" onSave={onSave}
        coffee={{restDays: 11, peakDay: 28, bestUntilDay: 42}}
        onFinish={noop} onRemove={noop}/>);
    await fireEvent.changeText(screen.getByLabelText("Bag name"), "Roaster bag");
    await fireEvent.changeText(screen.getByLabelText("Estimated window ends after roasting"), "50");
    await fireEvent.changeText(screen.getByLabelText("Peak day after roasting"), "30");
    await pressSave(onSave);
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
        figures: {restDays: 11, peakDay: 30, bestUntilDay: 50}, adviceSource: "user"
    }));
});

it("does not correct quantity for a metadata edit, but includes an explicitly touched zero", async () => {
    const onSave = jest.fn();
    await renderWithProviders(<BagSheet open epoch={1} onOpenChange={noop}
        bag={bagFixture()} tracker="xbrw" gramsLeft={120} beanName="" onSave={onSave}
        onFinish={noop} onRemove={noop}/>);
    await fireEvent.changeText(screen.getByLabelText("Bag name"), "Renamed");
    await pressSave(onSave);
    expect(onSave.mock.calls[0][0]).not.toHaveProperty("gramsLeft");
    onSave.mockClear();
    await fireEvent.changeText(screen.getByLabelText("Grams left in the bag"), "0");
    await pressSave(onSave);
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({gramsLeft: 0}));
});

it("allows a pod's external name to be edited independently of its local name", async () => {
    const onSave = jest.fn();
    await renderWithProviders(<BagSheet open epoch={1} onOpenChange={noop}
        bag={bagFixture()} tracker="beanconqueror" gramsLeft={null} beanName="Pod name"
        onSave={onSave} onFinish={noop} onRemove={noop}/>);
    await fireEvent.changeText(screen.getByLabelText("Beanconqueror bean name"), "Pod second bag");
    await pressSave(onSave);
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
        name: bagFixture().name, beanName: "Pod second bag"
    }));
    expect(screen.queryByText("SEND TO BEANCONQUEROR")).toBeNull();
});

it("requires correction of a future roast day and inconsistent three-value guidance", async () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    await renderWithProviders(<BagSheet open epoch={1} onOpenChange={noop}
        bag={bagFixture({roastedOn: dayOf(tomorrow.getTime())})} tracker="xbrw"
        gramsLeft={null} beanName="" onSave={jest.fn()} onFinish={noop} onRemove={noop}/>);
    expect(screen.getByTestId("bag-save")).toBeDisabled();
    await waitFor(async () => {
        await fireEvent.press(screen.getByLabelText("Clear the roast date"));
        expect(screen.getByTestId("bag-roasted-value")).toHaveTextContent("Not set");
    }, {timeout: SHEET_PRESS_TIMEOUT});
    expect(screen.getByTestId("bag-save")).not.toBeDisabled();
    await fireEvent.changeText(screen.getByLabelText("Peak day after roasting"), "0");
    expect(screen.getByTestId("bag-save")).toBeDisabled();
    await fireEvent.changeText(screen.getByLabelText("Peak day after roasting"), "18");
    await fireEvent.changeText(screen.getByLabelText("Estimated window ends after roasting"), "1.5");
    expect(screen.getByTestId("bag-save")).toBeDisabled();
});

it("resets drafts at the next form epoch and does not finish an already finished bag", async () => {
    const bag = bagFixture({finishedAt: 1});
    const view = await renderWithProviders(<BagSheet open epoch={1} onOpenChange={noop}
        bag={bag} tracker="xbrw" gramsLeft={null} beanName="" onSave={jest.fn()}
        onFinish={noop} onRemove={noop}/>);
    await fireEvent.changeText(screen.getByLabelText("Bag name"), "Uncommitted draft");
    expect(screen.queryByLabelText("Mark this bag finished")).toBeNull();
    await view.rerender(<BagSheet open epoch={2} onOpenChange={noop}
        bag={bag} tracker="xbrw" gramsLeft={null} beanName="" onSave={jest.fn()}
        onFinish={noop} onRemove={noop}/>);
    expect(screen.getByLabelText("Bag name")).toHaveDisplayValue(bag.name);
});
