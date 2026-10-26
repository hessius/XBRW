import React from "react";
import {PixelRatio, StyleSheet} from "react-native";
import {fireEvent, screen, waitFor, within} from "@testing-library/react-native";
import {SafeAreaProvider} from "react-native-safe-area-context";

import NewerVersionPrompt from "@/components/NewerVersionPrompt";
import RoasterCoffeeRow from "@/components/RoasterCoffeeRow";
import RoasterOfferSheet, {ROASTER_OFFER_BODY} from "@/components/RoasterOfferSheet";
import {palette} from "@/constants/colors";
import ShelfChoiceSheet from "@/components/ShelfChoiceSheet";
import UnsubscribeSheet from "@/components/UnsubscribeSheet";
import type {RoasterOfferState} from "@/hooks/useRoasterOffer";
import {renderWithProviders, SHEET_PRESS_TIMEOUT} from "@/test-utils/render";
import {feed} from "@/test-utils/roasterFeed";

async function drawNarrowSheet(sheet: React.ReactElement) {
    jest.spyOn(PixelRatio, "getFontScale").mockReturnValue(3);
    return renderWithProviders(
        <SafeAreaProvider initialMetrics={{
            frame: {x: 0, y: 0, width: 320, height: 480},
            insets: {top: 24, left: 0, right: 0, bottom: 24}
        }}>
            {sheet}
        </SafeAreaProvider>
    );
}

afterEach(() => jest.restoreAllMocks());

describe("RoasterOfferSheet", () => {
    it("asks to subscribe, in the owner's words", async () => {
        await renderWithProviders(
            <RoasterOfferSheet state={{phase: "offer", roaster: "Test Roaster", count: 30}}
                               onAccept={jest.fn()} onDecline={jest.fn()}/>
        );
        expect(screen.getByText("Subscribe to Test Roaster?")).toBeTruthy();
        expect(screen.getByTestId("roaster-offer-body").props.children).toBe(
            "Browse all their coffees and recipes. New coffees appear as they're released."
        );
        expect(screen.getByRole("checkbox", {name: "Don't ask again for this roaster"})).toBeTruthy();
    });

    it("names neither a count nor the app, whatever the feed holds", async () => {
        await renderWithProviders(
            <RoasterOfferSheet state={{phase: "offer", roaster: "Test Roaster", count: 1}}
                               onAccept={jest.fn()} onDecline={jest.fn()}/>
        );
        const body = screen.getByTestId("roaster-offer-body").props.children as string;
        expect(body).toBe(ROASTER_OFFER_BODY);
        expect(body).not.toMatch(/\d/);
        expect(body).not.toContain("XBRW");
    });

    it("keeps the full long name, question and actions in a bounded scroll for narrow screens and large text", async () => {
        const roaster = "Central Coast Coffee ".repeat(6).trim();
        await drawNarrowSheet(
            <RoasterOfferSheet state={{phase: "offer", roaster, count: 30}}
                               onAccept={jest.fn()} onDecline={jest.fn()}/>
        );
        expect(screen.getByTestId("sheet-title").props.children).toBe("Subscribe");
        const scroll = screen.getByTestId("roaster-offer-scroll");
        expect(StyleSheet.flatten(scroll.props.style)).toMatchObject({flex: 1, minHeight: 0, flexShrink: 1});
        const contents = within(scroll);
        expect(contents.getByText(`Subscribe to ${roaster}?`).props.numberOfLines).toBeUndefined();
        expect(contents.getByTestId("roaster-offer-body")).toBeTruthy();
        expect(contents.getByRole("checkbox")).toBeTruthy();
        expect(contents.getByRole("button", {name: `Subscribe to ${roaster}`})).toBeTruthy();
        expect(contents.getByRole("button", {name: "Not now"})).toBeTruthy();
        expect(screen.getByRole("button", {name: "Close"})).toBeTruthy();
    });

    it.each(["Other Roaster", "Test Roaster"])("forgets a cancelled offer's opt-out before a new offer for %s", async (roaster) => {
        const onDecline = jest.fn();
        const onAccept = jest.fn();
        const draw = (state: RoasterOfferState) => (
            <RoasterOfferSheet state={state} onAccept={onAccept} onDecline={onDecline}/>
        );
        const first: RoasterOfferState = {phase: "offer", roaster: "Test Roaster", count: 2};
        const view = await renderWithProviders(draw(first));
        await fireEvent.press(screen.getByRole("checkbox"));
        // An unrelated rerender of the same offer must not discard a deliberate tick.
        await view.rerender(draw(first));
        expect(screen.getByRole("checkbox")).toBeChecked();
        await view.rerender(draw({phase: "idle"}));
        await view.rerender(draw({phase: "offer", roaster, count: 2}));
        expect(screen.getByRole("checkbox")).not.toBeChecked();
        await waitFor(async () => {
            await fireEvent.press(screen.getByTestId("roaster-offer-not-now"));
            expect(onDecline).toHaveBeenLastCalledWith(false);
        }, {timeout: SHEET_PRESS_TIMEOUT});
        expect(onAccept).not.toHaveBeenCalled();
    });

    it("clears the tick when a new offer replaces one without an idle render", async () => {
        const onDecline = jest.fn();
        const draw = (state: RoasterOfferState) => (
            <RoasterOfferSheet state={state} onAccept={jest.fn()} onDecline={onDecline}/>
        );
        const view = await renderWithProviders(draw({phase: "offer", roaster: "Test Roaster", count: 2}));
        await fireEvent.press(screen.getByRole("checkbox"));
        await view.rerender(draw({phase: "offer", roaster: "Test Roaster", count: 2}));
        expect(screen.getByRole("checkbox")).not.toBeChecked();
        await waitFor(async () => {
            await fireEvent.press(screen.getByTestId("roaster-offer-not-now"));
            expect(onDecline).toHaveBeenCalledWith(false);
        }, {timeout: SHEET_PRESS_TIMEOUT});
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

describe("UnsubscribeSheet", () => {
    it("keeps a long name, explanation and both actions in a bounded scroll", async () => {
        const roaster = "Central Coast Coffee ".repeat(6).trim();
        const onConfirm = jest.fn();
        const onOpenChange = jest.fn();
        await drawNarrowSheet(
            <UnsubscribeSheet open roaster={roaster} onConfirm={onConfirm} onOpenChange={onOpenChange}/>
        );
        expect(screen.getByTestId("sheet-title").props.children).toBe("Unsubscribe?");
        const scroll = screen.getByTestId("unsubscribe-scroll");
        expect(StyleSheet.flatten(scroll.props.style)).toMatchObject({flex: 1, minHeight: 0, flexShrink: 1});
        const contents = within(scroll);
        expect(contents.getByText(`${roaster}'s coffees leave the catalogue. Recipes in your library stay.`)
            .props.numberOfLines).toBeUndefined();
        await fireEvent.press(contents.getByRole("button", {name: `Unsubscribe from ${roaster}`}));
        await fireEvent.press(contents.getByRole("button", {name: "Stay subscribed"}));
        expect(onConfirm).toHaveBeenCalledTimes(1);
        expect(onOpenChange).toHaveBeenCalledWith(false);
    });
});

describe("RoasterCoffeeRow", () => {
    it("shows where it is from, the bean, the roast and notes, and says sold out", async () => {
        const [coffee] = feed([{id: "a", available: false}]).coffees;
        await renderWithProviders(<RoasterCoffeeRow coffee={coffee} testID="row" onPress={jest.fn()}/>);
        expect(screen.getByTestId("roaster-row-sold-out")).toBeTruthy();
        expect(screen.getByText("LIGHT")).toBeTruthy();
        expect(screen.getByTestId("roaster-row-place")).toHaveTextContent("Peru");
        expect(screen.getByTestId("roaster-row-bean")).toHaveTextContent("Washed");
        // Bag sizes are on the coffee's own screen now, not the row.
        expect(screen.queryByText("320 G · 160 G")).toBeNull();
        expect(screen.queryByTestId("roaster-row-bags")).toBeNull();
        // The secondary text colour the notes use, not the faint one.
        expect(StyleSheet.flatten(screen.getByTestId("roaster-row-place").props.style).color)
            .toBe(palette.dim);
        expect(screen.getByLabelText("Coffee a, sold out, Peru, Washed, Light roast")).toBeTruthy();
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
