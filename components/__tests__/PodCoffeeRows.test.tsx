import React from "react";
import {fireEvent, screen} from "@testing-library/react-native";

import PodCoffeeRows, {PRODUCT_PAGE_LABEL} from "@/components/PodCoffeeRows";
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

describe("PodCoffeeRows", () => {
    it("draws and announces distinct tasting notes below the flavour list", async () => {
        await renderWithProviders(<PodCoffeeRows recipe={recipeWith({coffee: {
            flavours: ["Papaya", "Citrus"], aromatics: "Sweet papaya with a citrus finish"
        }})}/>);
        expect(screen.getByText("Papaya, Citrus")).toBeTruthy();
        expect(screen.getByTestId("coffee-aromatics-detail"))
            .toHaveTextContent("Sweet papaya with a citrus finish");
        expect(screen.getByLabelText("Flavour, Papaya, Citrus. Sweet papaya with a citrus finish"))
            .toBeTruthy();
    });

    it("does not draw a second flavour line for equivalent notes", async () => {
        await renderWithProviders(<PodCoffeeRows recipe={recipeWith({coffee: {
            flavours: ["Papaya", "Citrus"], aromatics: " PAPAYA,   citrus "
        }})}/>);
        expect(screen.queryByTestId("coffee-aromatics-detail")).toBeNull();
        expect(screen.getByLabelText("Flavour, Papaya, Citrus")).toBeTruthy();
    });

    it("shows every field of a full block, each read as label and value", async () => {
        await renderWithProviders(<PodCoffeeRows recipe={recipeWith({coffee: FULL})}/>);

        expect(screen.getByTestId("pod-coffee")).toBeTruthy();
        expect(screen.getByText("La Esperanza Gesha")).toBeTruthy();
        for (const label of [
            "Roaster, Central Coast Coffee",
            "Country, Colombia",
            "Region, Huila",
            "Farm, Finca La Esperanza",
            "Farmer, Rigoberto Herrera",
            "Elevation, 1,730 m",
            "Process, Washed",
            "Fermentation, Anaerobic",
            "Varietal, Gesha",
            "Type, Single origin",
            "Roast, Light",
            "Roasted on, 2026-09-03",
            "Caffeine, Decaf",
            "Flavour, Jasmine, bergamot, peach",
            "Cupping score, 88.5 points"
        ]) {
            expect(screen.getByLabelText(label)).toBeTruthy();
        }
        // The pod's one-line origin gives way to the finer country and region.
        expect(screen.queryByTestId("coffee-origin")).toBeNull();
        expect(screen.getByText("Grown on a steep slope above the river.")).toBeTruthy();
        expect(screen.getByLabelText(`${PRODUCT_PAGE_LABEL}. Opens in your browser.`))
            .toBeTruthy();
    });

    it("draws no row for an empty field", async () => {
        await renderWithProviders(
            <PodCoffeeRows recipe={recipeWith({
                coffee: {name: "Huila", region: "Huila", roaster: " ", decaffeinated: false}
            })}/>
        );

        expect(screen.getByTestId("coffee-region")).toBeTruthy();
        for (const field of ["roaster", "country", "farm", "elevation", "decaffeinated",
                             "cupping_points", "roastingDate", "aromatics"]) {
            expect(screen.queryByTestId(`coffee-${field}`)).toBeNull();
        }
        expect(screen.queryByTestId("coffee-note")).toBeNull();
        expect(screen.queryByLabelText(`${PRODUCT_PAGE_LABEL}. Opens in your browser.`))
            .toBeNull();
    });

    it("draws nothing for a recipe with no coffee", async () => {
        await renderWithProviders(<PodCoffeeRows recipe={recipeWith()}/>);

        expect(screen.queryByTestId("pod-coffee")).toBeNull();
    });

    it("draws nothing when the coffee only repeats the pod name", async () => {
        await renderWithProviders(
            <PodCoffeeRows recipe={recipeWith({
                xid:        "CGL12",
                xbloomName: "Pod Name",
                coffee:     {name: "Pod Name", imageUrl: "https://x/a.png"}
            })}/>
        );

        expect(screen.queryByTestId("pod-coffee")).toBeNull();
    });

    it("does not repeat a name the pod section already shows", async () => {
        await renderWithProviders(
            <PodCoffeeRows recipe={recipeWith({
                xbloomName: "Pod Name",
                coffee:     {name: "Pod Name", roaster: "R"}
            })}/>
        );

        expect(screen.getByTestId("pod-coffee")).toBeTruthy();
        expect(screen.queryByTestId("coffee-name")).toBeNull();
    });

    it("opens the product page in the browser", async () => {
        await renderWithProviders(<PodCoffeeRows recipe={recipeWith({coffee: FULL})}/>);

        await fireEvent.press(
            screen.getByLabelText(`${PRODUCT_PAGE_LABEL}. Opens in your browser.`)
        );

        expect(openLink).toHaveBeenCalledWith("https://example.com/coffee");
    });

    it("leaves the link to FROM when the product page is the recipe page", async () => {
        await renderWithProviders(
            <PodCoffeeRows recipe={recipeWith({
                recipeUrl: "https://example.com/coffee",
                coffee:    {...FULL}
            })}/>
        );

        expect(screen.queryByLabelText(`${PRODUCT_PAGE_LABEL}. Opens in your browser.`))
            .toBeNull();
    });

    it("folds a long note behind a control and opens it on a tap", async () => {
        const note = "A long story about the farm. ".repeat(10).trim();
        expect(note.length).toBeGreaterThan(NOTE_INLINE_MAX);

        await renderWithProviders(
            <PodCoffeeRows recipe={recipeWith({coffee: {name: "X", note}})}/>
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
            <PodCoffeeRows recipe={recipeWith({coffee: {name: "X", note: "Sweet and clean."}})}/>
        );

        expect(screen.getByText("Sweet and clean.")).toBeTruthy();
        expect(screen.queryByTestId("coffee-note-toggle")).toBeNull();
    });
});
