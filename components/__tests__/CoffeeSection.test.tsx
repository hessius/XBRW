import React from "react";
import {fireEvent, screen} from "@testing-library/react-native";

import CoffeeSection, {COFFEE_PAGE_LABEL} from "@/components/CoffeeSection";
import {openLink} from "@/components/openLink";
import {NOTE_INLINE_MAX} from "@/library/coffeeDetails";
import type {PodCoffee} from "@/library/podCoffee";
import Recipe from "@/library/Recipe";
import {renderWithProviders} from "@/test-utils/render";

jest.mock("@/components/openLink", () => ({openLink: jest.fn()}));

const includeHidden = {includeHiddenElements: true};

const FULL: PodCoffee = {
    name:           "La Esperanza Gesha",
    roaster:        "Central Coast Coffee",
    roastingDate:   "2026-09-03T08:00:00+10:00",
    roast:          "Light",
    origin:         "Colombia, Huila",
    country:        "Colombia",
    region:         "Huila",
    farm:           "Finca La Esperanza",
    farmer:         "Rigoberto Herrera",
    elevation:      1730,
    processing:     "Washed",
    fermentation:   "Anaerobic",
    variety:        "Gesha",
    beanMix:        "Single origin",
    aromatics:      "Jasmine, bergamot, peach",
    note:           "Grown on a steep slope above the river.",
    cupping_points: 88.5,
    decaffeinated:  true,
    url:            "https://example.com/coffee"
};

function recipeWith(over: Partial<Recipe> = {}): Recipe {
    return Object.assign(new Recipe(), over);
}

beforeEach(() => {
    jest.mocked(openLink).mockClear();
});

describe("CoffeeSection", () => {
    it("shows every field of a full coffee, each read as label and value", async () => {
        await renderWithProviders(<CoffeeSection recipe={recipeWith({coffee: FULL})}/>);

        expect(screen.getByTestId("about-coffee")).toBeTruthy();
        expect(screen.getByText("La Esperanza Gesha")).toBeTruthy();
        for (const label of [
            "Roaster, Central Coast Coffee",
            "Origin, Colombia, Huila",
            "Country, Colombia",
            "Region, Huila",
            "Farm, Finca La Esperanza",
            "Producer, Rigoberto Herrera",
            "Elevation, 1,730 m",
            "Process, Washed",
            "Fermentation, Anaerobic",
            "Variety, Gesha",
            "Type, Single origin",
            "Roast, Light",
            "Roasted on, 2026-09-03",
            "Caffeine, Decaf",
            "Tasting notes, Jasmine, bergamot, peach",
            "Cupping score, 88.5 points"
        ]) {
            expect(screen.getByLabelText(label)).toBeTruthy();
        }
        expect(screen.getByText("Grown on a steep slope above the river.")).toBeTruthy();
        expect(screen.getByLabelText(`${COFFEE_PAGE_LABEL}. Opens in your browser.`))
            .toBeTruthy();
    });

    it("draws no row for an empty field", async () => {
        await renderWithProviders(
            <CoffeeSection recipe={recipeWith({
                coffee: {name: "Huila", region: "Huila", roaster: " ", decaffeinated: false}
            })}/>
        );

        expect(screen.getByTestId("coffee-region")).toBeTruthy();
        for (const field of ["roaster", "country", "farm", "elevation", "decaffeinated",
                             "cupping_points", "roastingDate", "aromatics"]) {
            expect(screen.queryByTestId(`coffee-${field}`)).toBeNull();
        }
        expect(screen.queryByTestId("coffee-note")).toBeNull();
        expect(screen.queryByLabelText(`${COFFEE_PAGE_LABEL}. Opens in your browser.`))
            .toBeNull();
    });

    it("is absent for a recipe with no coffee", async () => {
        await renderWithProviders(<CoffeeSection recipe={recipeWith()}/>);

        expect(screen.queryByTestId("about-coffee")).toBeNull();
    });

    it("is absent when the coffee only repeats the pod name XPOD shows", async () => {
        await renderWithProviders(
            <CoffeeSection recipe={recipeWith({
                xid:        "CGL12",
                xbloomName: "Pod Name",
                coffee:     {name: "Pod Name", imageUrl: "https://x/a.png"}
            })}/>
        );

        expect(screen.queryByTestId("about-coffee")).toBeNull();
    });

    it("does not repeat a name the pod section already shows", async () => {
        await renderWithProviders(
            <CoffeeSection recipe={recipeWith({
                xbloomName: "Pod Name",
                coffee:     {name: "Pod Name", roaster: "R"}
            })}/>
        );

        expect(screen.getByTestId("about-coffee")).toBeTruthy();
        expect(screen.queryByTestId("coffee-name")).toBeNull();
    });

    it("opens the coffee page in the browser", async () => {
        await renderWithProviders(<CoffeeSection recipe={recipeWith({coffee: FULL})}/>);

        await fireEvent.press(
            screen.getByLabelText(`${COFFEE_PAGE_LABEL}. Opens in your browser.`)
        );

        expect(openLink).toHaveBeenCalledWith("https://example.com/coffee");
    });

    it("leaves the link to FROM when the coffee page is the recipe page", async () => {
        await renderWithProviders(
            <CoffeeSection recipe={recipeWith({
                recipeUrl: "https://example.com/coffee",
                coffee:    {...FULL}
            })}/>
        );

        expect(screen.queryByLabelText(`${COFFEE_PAGE_LABEL}. Opens in your browser.`))
            .toBeNull();
    });

    it("folds a long note behind a control and opens it on a tap", async () => {
        const note = "A long story about the farm. ".repeat(10).trim();
        expect(note.length).toBeGreaterThan(NOTE_INLINE_MAX);

        await renderWithProviders(
            <CoffeeSection recipe={recipeWith({coffee: {name: "X", note}})}/>
        );

        const toggle = screen.getByTestId("coffee-note-toggle");
        expect(toggle.props.accessibilityState).toMatchObject({expanded: false});
        expect(screen.queryByText(note)).toBeNull();
        expect(screen.getByTestId("collapsible", includeHidden).props.accessibilityElementsHidden)
            .toBe(true);

        await fireEvent.press(toggle);

        expect(screen.getByTestId("coffee-note-toggle").props.accessibilityState)
            .toMatchObject({expanded: true});
        expect(screen.getByText(note)).toBeTruthy();
    });

    it("shows a short note as it is, with no control", async () => {
        await renderWithProviders(
            <CoffeeSection recipe={recipeWith({coffee: {name: "X", note: "Sweet and clean."}})}/>
        );

        expect(screen.getByText("Sweet and clean.")).toBeTruthy();
        expect(screen.queryByTestId("coffee-note-toggle")).toBeNull();
    });
});
