import React from "react";
import {fireEvent, screen} from "@testing-library/react-native";

import ReadyToBrewCard, {type ReadyToBrewCardProps} from "@/components/ReadyToBrewCard";
import {renderWithProviders} from "@/test-utils/render";
import {measureReadyPicture} from "@/test-utils/pictureLayout";

const ITEM = {uuid: "r1"};
const URL = "https://roaster.example/vinka";

it("omits its circle until text and controls have measured room", async () => {
    await renderWithProviders(<ReadyToBrewCard {...props({imageUri: URL})}/>);
    expect(screen.queryByTestId("ready-to-brew-photo", {includeHiddenElements: true})).toBeNull();
    await fireEvent(screen.getByTestId("ready-to-brew-open"), "layout",
                    {nativeEvent: {layout: {x: 0, y: 0, width: 260, height: 60}}});
    await fireEvent(screen.getByTestId("ready-to-brew-text-measure", {includeHiddenElements: true}),
                    "contentSizeChange", 200, 50);
    expect(screen.getByTestId("ready-to-brew-photo", {includeHiddenElements: true}).props.style.width).toBe(36);
    await fireEvent(screen.getByTestId("ready-to-brew-open"), "layout",
                    {nativeEvent: {layout: {x: 0, y: 0, width: 230, height: 60}}});
    expect(screen.queryByTestId("ready-to-brew-photo", {includeHiddenElements: true})).toBeNull();
    expect(screen.getByLabelText("Brew Vinka")).toBeTruthy();
});

it("keeps all Ready controls after failure and retries only with current text measurements", async () => {
    const input = props({imageUri: URL, low: {line: "Running low", reorderUrl: URL},
        moreLine: "+1 more ready", onMore: jest.fn()});
    const view = await renderWithProviders(<ReadyToBrewCard {...input}/>);
    await measureReadyPicture();
    await fireEvent(screen.getByTestId("ready-to-brew-photo", {includeHiddenElements: true}), "error");
    expect(screen.queryByTestId("ready-to-brew-photo", {includeHiddenElements: true})).toBeNull();
    await view.rerender(<ReadyToBrewCard {...input} imageUri={`${URL}/new`}/>);
    expect(screen.queryByTestId("ready-to-brew-photo", {includeHiddenElements: true})).toBeNull();
    await measureReadyPicture();
    expect(screen.getByTestId("ready-to-brew-photo", {includeHiddenElements: true}).props.resizeMode).toBe("contain");
    await view.rerender(<ReadyToBrewCard {...input} imageUri={`${URL}/new`} name="A different coffee"/>);
    expect(screen.queryByTestId("ready-to-brew-photo", {includeHiddenElements: true})).toBeNull();
    await fireEvent.press(screen.getByLabelText("Brew A different coffee"));
    await fireEvent.press(screen.getByLabelText("Hide until tomorrow"));
    await fireEvent.press(screen.getByTestId("ready-to-brew-open"));
    await fireEvent.press(screen.getByTestId("ready-to-brew-reorder"));
    await fireEvent.press(screen.getByTestId("ready-to-brew-more"));
    expect(input.onBrew).toHaveBeenCalledWith(ITEM);
    expect(input.onOpen).toHaveBeenCalledWith(ITEM);
    expect(input.onReorder).toHaveBeenCalledWith(URL);
    expect(input.onMore).toHaveBeenCalled();
    expect(input.onDismiss).toHaveBeenCalled();
    expect(screen.getByTestId("ready-to-brew-brew")).toHaveStyle({minHeight: 44});
});

function props(over: Partial<ReadyToBrewCardProps<typeof ITEM>> = {}): ReadyToBrewCardProps<typeof ITEM> {
    return {
        item: ITEM,
        name: "Vinka",
        accent: "accent",
        freshnessLine: "At its peak",
        bagLine: "212 g left, about 11 brews",
        emphasised: true,
        onOpen: jest.fn(),
        onBrew: jest.fn(),
        onReorder: jest.fn(),
        onDismiss: jest.fn(),
        ...over
    };
}

describe("ReadyToBrewCard", () => {
    it("draws the coffee, its freshness and what is left", async () => {
        await renderWithProviders(<ReadyToBrewCard {...props()}/>);
        expect(screen.getByTestId("ready-to-brew-name")).toHaveTextContent("Vinka");
        expect(screen.getByTestId("ready-to-brew-freshness")).toHaveTextContent("At its peak");
        expect(screen.getByTestId("ready-to-brew-bag")).toHaveTextContent("212 g left, about 11 brews");
        expect(screen.getByLabelText("Ready to brew, Vinka, At its peak, 212 g left, about 11 brews"))
            .toBeTruthy();
        expect(screen.queryByTestId("ready-to-brew-low")).toBeNull();
        expect(screen.queryByTestId("ready-to-brew-more")).toBeNull();
    });

    it("leaves out lines it was not given", async () => {
        await renderWithProviders(<ReadyToBrewCard {...props({freshnessLine: null, bagLine: null})}/>);
        expect(screen.queryByTestId("ready-to-brew-freshness")).toBeNull();
        expect(screen.queryByTestId("ready-to-brew-bag")).toBeNull();
    });

    it("opens the recipe from the name and brews it from BREW", async () => {
        const onOpen = jest.fn();
        const onBrew = jest.fn();
        await renderWithProviders(<ReadyToBrewCard {...props({onOpen, onBrew})}/>);
        await fireEvent.press(screen.getByTestId("ready-to-brew-open"));
        expect(onOpen).toHaveBeenCalledWith(ITEM);
        expect(onBrew).not.toHaveBeenCalled();
        await fireEvent.press(screen.getByLabelText("Brew Vinka"));
        expect(onBrew).toHaveBeenCalledWith(ITEM);
    });

    it("draws no BREW without a machine to brew on", async () => {
        await renderWithProviders(<ReadyToBrewCard {...props({onBrew: undefined})}/>);
        expect(screen.queryByTestId("ready-to-brew-brew")).toBeNull();
    });

    it("says a coffee is running low, with Reorder only when there is a link", async () => {
        const onReorder = jest.fn();
        const {rerender} = await renderWithProviders(<ReadyToBrewCard {...props({
            onReorder, low: {line: "Vinka is running low", reorderUrl: URL}
        })}/>);
        expect(screen.getByTestId("ready-to-brew-low")).toHaveTextContent(/Vinka is running low/);
        await fireEvent.press(screen.getByTestId("ready-to-brew-reorder"));
        expect(onReorder).toHaveBeenCalledWith(URL);

        await rerender(<ReadyToBrewCard {...props({low: {line: "Vinka is running low"}})}/>);
        expect(screen.getByTestId("ready-to-brew-low")).toHaveTextContent("Vinka is running low");
        expect(screen.queryByTestId("ready-to-brew-reorder")).toBeNull();
    });

    it("steps to the next ready coffee from +2 more ready", async () => {
        const onMore = jest.fn();
        await renderWithProviders(<ReadyToBrewCard {...props({moreLine: "+2 more ready", onMore})}/>);
        await fireEvent.press(screen.getByTestId("ready-to-brew-more"));
        expect(onMore).toHaveBeenCalled();
    });

    it("hides until tomorrow from the close button", async () => {
        const onDismiss = jest.fn();
        await renderWithProviders(<ReadyToBrewCard {...props({onDismiss})}/>);
        await fireEvent.press(screen.getByLabelText("Hide until tomorrow"));
        expect(onDismiss).toHaveBeenCalled();
    });

    it("draws the photo only when given one", async () => {
        const {rerender} = await renderWithProviders(
            <ReadyToBrewCard {...props({imageUri: "https://img.example/pod.png"})}/>
        );
        await measureReadyPicture();
        expect(screen.getByTestId("ready-to-brew-photo", {includeHiddenElements: true})).toBeTruthy();
        await rerender(<ReadyToBrewCard {...props({imageUri: undefined})}/>);
        expect(screen.queryByTestId("ready-to-brew-photo")).toBeNull();
    });
});
