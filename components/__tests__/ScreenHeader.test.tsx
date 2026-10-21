import {fireEvent, screen} from "@testing-library/react-native";
import React from "react";
import {StyleSheet, Text} from "react-native";

import ScreenHeader from "@/components/ScreenHeader";
import {renderWithProviders} from "@/test-utils/render";

describe("ScreenHeader", () => {
    it("keeps a supplied action beside the title in a wrapping header", async () => {
        await renderWithProviders(
            <ScreenHeader title="Settings" onBack={jest.fn()}
                          action={<Text>Support action</Text>}/>
        );
        expect(screen.getByText("Support action")).toBeTruthy();
        expect(screen.getByRole("header", {name: "Settings"})).toBeTruthy();
        expect(screen.getByLabelText("Back")).toBeTruthy();
        expect(StyleSheet.flatten(screen.getByTestId("screen-header-action-row").props.style))
            .toEqual(expect.objectContaining({flexWrap: "wrap"}));
        expect(screen.getByTestId("screen-title-text").props.numberOfLines).toBe(0);
    });

    it("names the screen it is heading", async () => {
        await renderWithProviders(<ScreenHeader title="Settings" onBack={jest.fn()}/>);
        expect(screen.getByText("Settings")).toBeTruthy();
    });

    it("keeps a screen name to one line and lets a recipe name take two", async () => {
        await renderWithProviders(<ScreenHeader title="Settings" onBack={jest.fn()}/>);
        expect(screen.getByTestId("screen-title-text").props.numberOfLines).toBe(1);

        await renderWithProviders(
            <ScreenHeader title="Colombia | Las Flores | Chiroso Natural - 18g"
                          titleLines={2} onBack={jest.fn()}/>
        );
        expect(screen.getByTestId("screen-title-text").props.numberOfLines).toBe(2);
    });

    it("goes back when the key is pressed", async () => {
        const onBack = jest.fn();
        await renderWithProviders(<ScreenHeader title="About" onBack={onBack}/>);
        await fireEvent.press(screen.getByLabelText("Back"));
        expect(onBack).toHaveBeenCalledTimes(1);
    });

    it("gives the back key a label, because a glyph has no name", async () => {
        await renderWithProviders(<ScreenHeader title="About" onBack={jest.fn()}/>);
        expect(screen.getByLabelText("Back")).toBeTruthy();
    });

    it("announces the title as a heading, as the bar it replaces did", async () => {
        // The native navigation bar carried the header trait, which is what
        // VoiceOver's rotor navigates by. Dropping it leaves a reader arriving
        // on a pushed screen with nothing to land on.
        await renderWithProviders(<ScreenHeader title="Settings" onBack={jest.fn()}/>);
        expect(screen.getByRole("header", {name: "Settings"})).toBeTruthy();
    });
});
