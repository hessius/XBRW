import React from "react";
import {StyleSheet} from "react-native";
import {screen, within} from "@testing-library/react-native";

import {BuySection} from "@/components/CatalogueParts";
import {DOTO_FAMILIES} from "@/components/DotMatrixText";
import FillLabel, {DOTO_INK_COVERAGE} from "@/components/FillLabel";
import HubSaveBar from "@/components/HubSaveBar";
import {resolveAppearance} from "@/constants/colors";
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
