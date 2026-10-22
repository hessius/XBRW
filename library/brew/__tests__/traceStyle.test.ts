import {accents, cupLineFor, mix, palette, resolveAppearance} from "@/constants/colors";
import {THEME_IDS} from "@/library/appearance";
import {
    channelStyle,
    planInk,
    PLAN_MIN_OPACITY,
    referenceCupColour,
    referenceWaterColour
} from "@/library/brew/traceStyle";

const ACCENT = accents.coffee[1];
const appearance = resolveAppearance({theme: "original", recipeColours: "original"});

function rgb(hex: string): number[] {
    return hex.slice(1).match(/../g)!.map(value => parseInt(value, 16));
}

function contrast(a: string | number[], b: string | number[]): number {
    const luminance = (colour: string | number[]) => {
        const channels = (typeof colour === "string" ? rgb(colour) : colour).map(value => {
            const c = value / 255;
            return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
        });
        return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
    };
    const x = luminance(a), y = luminance(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

describe("explicit chart appearance", () => {
    it("fits the alpha-composited waking minimum across all twelve identities and eight choices", () => {
        let minimum = Infinity;
        for (const theme of THEME_IDS) {
            for (const recipeColours of ["original", "themed"] as const) {
                const appearance = resolveAppearance({theme, recipeColours});
                const {base, muted} = appearance.palette;
                for (const accent of [...accents.coffee, ...accents.tea]) {
                    const ink = planInk(appearance, mix(muted, appearance.recipe(accent).ink, 0),
                        [base], PLAN_MIN_OPACITY);
                    const background = rgb(base);
                    const displayed = rgb(ink).map((channel, i) =>
                        channel * PLAN_MIN_OPACITY + background[i] * (1 - PLAN_MIN_OPACITY));
                    const ratio = contrast(displayed, background);
                    minimum = Math.min(minimum, ratio);
                    expect(ratio).toBeGreaterThanOrEqual(3);
                }
            }
        }
        expect(minimum).toBeGreaterThanOrEqual(3);
    });

    it("fits pale original water and cup strokes on light chrome", () => {
        const appearance = resolveAppearance({theme: "light", recipeColours: "original"});
        const input = {accent: "#9FC3F0", appearance};
        expect(contrast(channelStyle("water", input).stroke, appearance.palette.base)).toBeGreaterThanOrEqual(3);
        expect(contrast(channelStyle("cup", input).stroke, appearance.palette.base)).toBeGreaterThanOrEqual(3);
    });

    it.each(THEME_IDS)("fits all twelve identities in both modes on %s", theme => {
        for (const recipeColours of ["original", "themed"] as const) {
            const appearance = resolveAppearance({theme, recipeColours});
            for (const accent of [...accents.coffee, ...accents.tea]) {
                const input = {accent, appearance};
                expect(channelStyle("water", input).stroke).toBe(appearance.recipe(accent).ink);
                expect(channelStyle("cup", input).stroke).toBe(appearance.recipe(accent).cupInk);
                for (const channel of ["water", "cup", "plan"] as const) {
                    for (const role of ["subject", "reference"] as const) {
                        expect(contrast(channelStyle(channel, {...input, role}).stroke,
                            appearance.palette.base)).toBeGreaterThanOrEqual(3);
                    }
                }
                for (const role of ["subject", "reference"] as const) {
                    const held = channelStyle("water", {...input, holding: true, role});
                    expect(held.stroke).toBe(role === "subject"
                        ? appearance.palette.warn : appearance.palette.muted);
                    expect(contrast(held.stroke, appearance.palette.base)).toBeGreaterThanOrEqual(3);
                }
                const {base, raised} = appearance.palette;
                const stage = appearance.chartInk(appearance.recipe(accent).ink, [base, raised], 4.5);
                for (const ground of [base, raised]) {
                    expect(contrast(stage, ground)).toBeGreaterThanOrEqual(4.5);
                }
                const hatch = appearance.chartInk(mix(stage, base, 0.62), [raised]);
                expect(contrast(hatch, raised)).toBeGreaterThanOrEqual(3);
            }
        }
    });
});

describe("traceStyle", () => {
    it("draws water solid, thick, in the accent", () => {
        expect(channelStyle("water", {accent: ACCENT, appearance})).toEqual({
            stroke:          ACCENT,
            strokeWidth:     2.5,
            strokeDasharray: undefined,
            strokeLinecap:   "round",
            strokeLinejoin:  "round"
        });
    });

    it("turns the water line amber while overflow protection holds it", () => {
        expect(channelStyle("water", {accent: ACCENT, appearance, holding: true}).stroke)
            .toBe(palette.warn);
    });

    it("keeps the reference grey even where that brew was held", () => {
        expect(channelStyle("water", {accent: ACCENT, appearance, holding: true, role: "reference"})
            .stroke).toBe(referenceWaterColour(appearance));
    });

    it("draws cup dotted, in the accent's complement", () => {
        expect(channelStyle("cup", {accent: ACCENT, appearance})).toEqual({
            stroke:          cupLineFor(ACCENT),
            strokeWidth:     2,
            strokeDasharray: "1 3",
            strokeLinecap:   "round",
            strokeLinejoin:  undefined
        });
    });

    it("draws the plan grey and dashed", () => {
        expect(channelStyle("plan", {accent: ACCENT, appearance})).toEqual({
            stroke:          palette.muted,
            strokeWidth:     1.5,
            strokeDasharray: "4 4",
            strokeLinecap:   undefined,
            strokeLinejoin:  undefined
        });
    });

    it("uses a caller's animated plan colour", () => {
        expect(channelStyle("plan", {accent: ACCENT, appearance, planColour: "#ABCDEF"}).stroke)
            .toBe("#ABCDEF");
    });

    it("keeps the plan muted without an animated plan colour", () => {
        expect(channelStyle("plan", {accent: ACCENT, appearance}).stroke).toBe(palette.muted);
    });

    it("keeps the plan's dashes but lets a caller fuse them", () => {
        expect(channelStyle("plan", {accent: ACCENT, appearance, dashed: false}).strokeDasharray)
            .toBeUndefined();
    });

    it("greys the reference brew without changing its line style", () => {
        const subject = channelStyle("cup", {accent: ACCENT, appearance});
        const reference = channelStyle("cup", {accent: ACCENT, appearance, role: "reference"});
        expect(reference.stroke).toBe(referenceCupColour(appearance));
        expect(reference.strokeWidth).toBe(subject.strokeWidth);
        expect(reference.strokeDasharray).toBe(subject.strokeDasharray);
    });

    it("gives the reference cup the brighter grey, because cup leads", () => {
        expect(referenceCupColour(appearance)).toBe(palette.dim);
        expect(referenceWaterColour(appearance)).toBe(palette.muted);
    });
});
