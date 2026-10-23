import React from "react";
import {fireEvent, screen} from "@testing-library/react-native";
import ReadyToBrewCard, {type ReadyToBrewCardProps} from "@/components/ReadyToBrewCard";
import {renderWithProviders} from "@/test-utils/render";
import {measureReadyPicture} from "@/test-utils/pictureLayout";
import {accents} from "@/constants/colors";

const item = {recipe: "recipe-a", bag: "bag-a"};
function props(): ReadyToBrewCardProps<typeof item> {
    return {item, name: "The selected recipe", accent: accents.coffee[0],
        bagLine: "October bag, Approx. 232 g remaining", emphasised: true,
        onOpen: jest.fn(), onBrew: jest.fn(), onDismiss: jest.fn(), onReorder: jest.fn()};
}

it("keeps open, brew and dismissal separate and hands back the exact displayed pair", async () => {
    const input = props();
    await renderWithProviders(<ReadyToBrewCard {...input}/>);
    await fireEvent.press(screen.getByTestId("ready-to-brew-open"));
    expect(input.onOpen).toHaveBeenCalledWith(item);
    expect(input.onBrew).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByLabelText("Brew The selected recipe"));
    expect(input.onBrew).toHaveBeenCalledWith(item);
    await fireEvent.press(screen.getByLabelText("Hide until tomorrow"));
    expect(input.onDismiss).toHaveBeenCalled();
    expect(screen.queryByTestId("ready-to-brew-freshness")).toBeNull();
});

it("omits brew without a machine and cycles only from its separate more-bags action", async () => {
    const onMore = jest.fn();
    await renderWithProviders(<ReadyToBrewCard {...props()} onBrew={undefined}
        moreLine="+2 more bags" onMore={onMore}/>);
    expect(screen.queryByTestId("ready-to-brew-brew")).toBeNull();
    await fireEvent.press(screen.getByTestId("ready-to-brew-more"));
    expect(onMore).toHaveBeenCalledTimes(1);
});

it("honours photo gating, measured room and image failure without losing controls", async () => {
    const input = props();
    const view = await renderWithProviders(<ReadyToBrewCard {...input}/>);
    expect(screen.queryByTestId("ready-to-brew-photo", {includeHiddenElements: true})).toBeNull();
    await view.rerender(<ReadyToBrewCard {...input} imageUri="https://coffee.example/bag.jpg"/>);
    await measureReadyPicture();
    expect(screen.getByTestId("ready-to-brew-photo", {includeHiddenElements: true})).toBeTruthy();
    await fireEvent(screen.getByTestId("ready-to-brew-photo", {includeHiddenElements: true}), "error");
    expect(screen.queryByTestId("ready-to-brew-photo", {includeHiddenElements: true})).toBeNull();
    await fireEvent.press(screen.getByLabelText("Brew The selected recipe"));
    expect(input.onBrew).toHaveBeenCalledWith(item);
});
