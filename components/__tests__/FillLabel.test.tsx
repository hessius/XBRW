import React from "react";
import {StyleSheet} from "react-native";
import {screen, within} from "@testing-library/react-native";

import {BuySection} from "@/components/CatalogueParts";
import DeckSwitch from "@/components/DeckSwitch";
import {DOTO_FAMILIES} from "@/components/DotMatrixText";
import FillLabel, {DOTO_INK_COVERAGE} from "@/components/FillLabel";
import HubSaveBar from "@/components/HubSaveBar";
import SplitBrewButton from "@/components/SplitBrewButton";
import {accents, resolveAppearance} from "@/constants/colors";
import {AppearanceScope} from "@/hooks/useAppearance";
import {THEME_IDS, type AppearanceChoice} from "@/library/appearance";
import {contrast} from "@/test-utils/contrast";
import {renderWithProviders} from "@/test-utils/render";

type Node = ReturnType<typeof screen.getByText>;
const DOTO = new Set<string>(Object.values(DOTO_FAMILIES));

function style(node: Node) {
    return StyleSheet.flatten(node.props.style) ?? {};
}

function renderChoice(choice: AppearanceChoice, children: React.ReactNode) {
    return renderWithProviders(<AppearanceScope choice={choice}>{children}</AppearanceScope>);
}

/** The sRGB colour a label of separate dots averages to over its fill. */
function averaged(ink: string, fill: string, coverage: number): string {
    const channels = (colour: string) => [1, 3, 5].map(i => parseInt(colour.slice(i, i + 2), 16) / 255)
        .map(c => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    const a = channels(ink);
    const b = channels(fill);
    return "#" + a.map((c, i) => c * coverage + b[i] * (1 - coverage))
        .map(c => c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055)
        .map(c => Math.round(c * 255).toString(16).padStart(2, "0")).join("");
}

describe("why filled labels leave Doto", () => {
    it("dark dots on the original fills average out to almost nothing", () => {
        const {primary, selection} = resolveAppearance({theme: "original", recipeColours: "original"});
        // Solid, the inks pass easily. That is what the token checks measured.
        expect(contrast(primary.ink, primary.fill)).toBeGreaterThanOrEqual(4.5);
        expect(contrast(selection.ink, selection.fill)).toBeGreaterThanOrEqual(4.5);
        // As a fifth of the label's area, they do not.
        expect(contrast(averaged(primary.ink, primary.fill, DOTO_INK_COVERAGE), primary.fill)).toBeLessThan(1.5);
        expect(contrast(averaged(selection.ink, selection.fill, DOTO_INK_COVERAGE), selection.fill))
            .toBeLessThan(1.5);
    });
});

describe.each(THEME_IDS)("%s theme filled labels", theme => {
    const choice: AppearanceChoice = {theme, recipeColours: "original"};
    const {primary, selection, palette} = resolveAppearance(choice);

    it("draws BUY in the selection ink, in the body face", async () => {
        await renderChoice(choice, <BuySection options={[
            {key: "250", label: "250 g · $20", available: true, url: "https://example.com/250"}
        ]}/>);
        const label = within(screen.getByTestId("buy-250-link")).getByText("BUY");
        expect(style(label).color).toBe(selection.ink);
        expect(DOTO.has(String(style(label).fontFamily))).toBe(false);
        expect(contrast(selection.ink, selection.fill)).toBeGreaterThanOrEqual(4.5);
    });

    it("draws a primary action in the primary ink, in the body face", async () => {
        await renderChoice(choice, <HubSaveBar count={2} saving={false} progress={{done: 0, total: 2}}
                                              onSave={() => {}} onCancel={() => {}}/>);
        const label = screen.getByText("SAVE 2");
        expect(style(label).color).toBe(primary.ink);
        expect(DOTO.has(String(style(label).fontFamily))).toBe(false);
        expect(contrast(primary.ink, primary.fill)).toBeGreaterThanOrEqual(4.5);
    });

    it("keeps Doto for an outlined label", async () => {
        await renderChoice(choice, <FillLabel filled={false} color={palette.text}>ADD TO SHELF</FillLabel>);
        const label = screen.getByText("ADD TO SHELF");
        expect(style(label).color).toBe(palette.text);
        expect(DOTO.has(String(style(label).fontFamily))).toBe(true);
    });
});

/**
 * The editor's BREW and the selected deck tab are filled with the recipe's own
 * colour, and most of those are light or bright (the stock light blue, say)
 * with dark ink. So they take the body face too, in every theme and with both
 * recipe-colour choices, and every accent's ink must still read as a solid
 * stroke on its fill.
 */
const RECIPE_CHOICES: AppearanceChoice[] = THEME_IDS.flatMap(theme =>
    (["original", "themed"] as const).map(recipeColours => ({theme, recipeColours})));
const ACCENTS = [...accents.coffee, ...accents.tea];

describe.each(RECIPE_CHOICES)("recipe-filled labels, $theme theme with $recipeColours recipe colours", choice => {
    const appearance = resolveAppearance(choice);
    const {palette} = appearance;

    it.each(ACCENTS)("draws BREW and its split on %s in the fill's ink, in the body face", async accent => {
        const {fill, onAccent} = appearance.recipe(accent);
        await renderChoice(choice, <SplitBrewButton enabled accent={accent} flex={2} quickEditOpen={false}
                                                    onBrew={() => {}} onToggleQuickEdit={() => {}}/>);
        for (const text of ["BREW", "▲"]) {
            const label = screen.getByText(text);
            expect(style(label).color).toBe(onAccent.text);
            expect(DOTO.has(String(style(label).fontFamily))).toBe(false);
        }
        expect(contrast(onAccent.text, fill)).toBeGreaterThanOrEqual(4.5);
        // Accessibility names are the control's, not the face's.
        expect(screen.getByRole("button", {name: "Brew"})).toBeTruthy();
        expect(screen.getByRole("button", {name: "Quick edit brew"})).toBeTruthy();
    });

    it("keeps a refused BREW in Doto, unfilled and muted", async () => {
        await renderChoice(choice, <SplitBrewButton enabled={false} accent={ACCENTS[0]} flex={2}
                                                    quickEditOpen={false}
                                                    onBrew={() => {}} onToggleQuickEdit={() => {}}/>);
        const label = screen.getByText("BREW");
        expect(style(label).color).toBe(palette.muted);
        expect(DOTO.has(String(style(label).fontFamily))).toBe(true);
    });

    it.each(ACCENTS)("draws the selected deck tab on %s in the body face, the others in Doto", async accent => {
        const {fill, onAccent} = appearance.recipe(accent);
        await renderChoice(choice, <DeckSwitch deck="stages" stageCount={3} accent={accent}
                                               onChange={() => {}}/>);
        const selected = screen.getByText("STAGES · 3");
        expect(style(selected).color).toBe(onAccent.text);
        expect(DOTO.has(String(style(selected).fontFamily))).toBe(false);
        expect(contrast(onAccent.text, fill)).toBeGreaterThanOrEqual(4.5);
        for (const text of ["BREW", "ABOUT"]) {
            const label = screen.getByText(text);
            expect(style(label).color).toBe(palette.dim);
            expect(DOTO.has(String(style(label).fontFamily))).toBe(true);
        }
        expect(screen.getByRole("tab", {name: "Stages, 3"})).toBeTruthy();
    });
});
