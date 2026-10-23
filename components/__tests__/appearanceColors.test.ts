import {
    accents, cupLineFor, machineColours, onAccent, onBrand, palette,
    resolveAppearance, switchColours, type Appearance, type DisplayRecipeColour
} from "@/constants/colors";
import {THEME_IDS, type AppearanceChoice} from "@/library/appearance";
import {contrast, over} from "@/test-utils/contrast";

// Independent, ordered fixtures: never take expected mappings from the resolver.
const stock = [
    "#9FC3F0", "#F0B98E", "#F0A0AB", "#B4D6A8", "#97D8C4", "#BDB2E8",
    "#A6D6E8", "#E7A9C9", "#CFD6A3", "#DCC194", "#D9CF9A", "#E0AEA6"
];
const slots = {
    original: stock,
    light: [
        "#254E83", "#8B463A", "#8B3656", "#426039", "#255F58", "#654581",
        "#286076", "#83465E", "#46613D", "#725429", "#685D25", "#84433F"
    ],
    blue: [
        "#A9C1FF", "#7296E8", "#8CA9ED", "#BACDFB", "#86BBD9", "#B7B1F0",
        "#C6DFFF", "#8E9BD9", "#CED7F5", "#AABCD9", "#D6E4EE", "#9EADD3"
    ],
    magenta: [
        "#F4A0CA", "#CC7AA7", "#EAB0D0", "#BA95B6", "#D9A0C2", "#D1A5D8",
        "#E7C0D5", "#DC8EBA", "#DFCBD8", "#BBA2B2", "#F1DAE8", "#CBADB9"
    ]
};
const overrides = {
    original: {},
    light: {
        base: "#F5F4F0", surface: "#FFFFFF", raised: "#ECEBE6", control: "#DCDAD5",
        line: "#C5C3BD", text: "#171717", dim: "#595959", placeholder: "#595959",
        muted: "#78736B", brand: "#AD0057", brandFill: "#D10069",
        success: "#1F6A3B", warn: "#785B00", danger: "#AF2118", info: "#254E83",
        dangerFaint: "#956C66", successMuted: "#42664C", warnMuted: "#71623F"
    },
    blue: {
        base: "#0015B8", surface: "#061FA8", raised: "#0D28B8", control: "#1936C2",
        line: "#3455CC", text: "#FFFFFF", dim: "#CED7FF", placeholder: "#CED7FF",
        muted: "#7F98E4", brand: "#FFB5D8", success: "#9AF1B3", warn: "#FFE58F",
        danger: "#FFB0A5", info: "#C6DFFF", dangerFaint: "#D3A3AA",
        successMuted: "#B4DCC2", warnMuted: "#E1D7B5"
    },
    magenta: {
        base: "#260B1D", surface: "#331127", raised: "#401831", control: "#50213F",
        line: "#6A3153", text: "#FFFFFF", dim: "#D7BECE", placeholder: "#D7BECE",
        muted: "#9A748A", brand: "#FF76BA", success: "#9AF1B3", warn: "#FFE58F",
        danger: "#FFB0A5", info: "#E7C0D5", dangerFaint: "#BD969F",
        successMuted: "#B4DCC2", warnMuted: "#E1D7B5"
    }
};
const primary = {
    original: ["#FF007F", "#0C0C0C"],
    light: ["#D10069", "#FFFFFF"],
    blue: ["#E0ECFF", "#091536"],
    magenta: ["#FF76BA", "#250B1B"]
};
const choices: AppearanceChoice[] = THEME_IDS.flatMap(theme =>
    (["original", "themed"] as const).map(recipeColours => ({theme, recipeColours})));
const canonicalBefore = JSON.stringify({palette, onAccent, onBrand, accents, switchColours, machineColours});

function expectCard(c: DisplayRecipeColour, appearance: Appearance) {
    for (const role of ["text", "label", "marker"] as const) {
        expect(contrast(c.onAccent[role], c.fill)).toBeGreaterThanOrEqual(4.5);
    }
    expect(contrast(c.onAccent.profileStroke, c.fill)).toBeGreaterThanOrEqual(3);
    const key = over(c.onAccent.key, c.fill);
    expect(contrast(c.onAccent.key, c.fill)).toBeGreaterThanOrEqual(3);
    for (const ink of Object.values(c.keyInk)) {
        expect(contrast(ink, key)).toBeGreaterThanOrEqual(3);
    }
    for (const ground of [appearance.palette.base, appearance.palette.surface, appearance.palette.raised]) {
        expect(contrast(c.ink, ground)).toBeGreaterThanOrEqual(4.5);
    }
    expect(contrast(c.cupInk, appearance.palette.base)).toBeGreaterThanOrEqual(3);
}

function expectSwitch(pair: Appearance["chromeSwitch"], grounds: string[]) {
    for (const ground of grounds) {
        expect(contrast(pair.on.track, ground)).toBeGreaterThanOrEqual(3);
        expect(contrast(pair.on.ring, ground)).toBeGreaterThanOrEqual(3);
        expect(contrast(pair.off.ring, ground)).toBeGreaterThanOrEqual(3);
        const offTrack = pair.off.track === "transparent" ? ground : pair.off.track;
        expect(contrast(pair.off.thumb, offTrack)).toBeGreaterThanOrEqual(3);
        expect(contrast(pair.on.track, offTrack)).toBeGreaterThanOrEqual(3);
    }
    expect(contrast(pair.on.thumb, pair.on.track)).toBeGreaterThanOrEqual(3);
}

function firstPassing(candidate: string, grounds: string[], floor: number): string {
    const endpoint = contrast("#000000", grounds[0]) >= contrast("#FFFFFF", grounds[0])
        ? "0,0,0" : "255,255,255";
    for (let step = 0; step <= 100; step++) {
        const ink = step === 0 ? candidate : over(`rgba(${endpoint},${step / 100})`, candidate);
        if (grounds.every(ground => contrast(ink, ground) >= floor)) return ink;
    }
    throw new Error("Test fixture has no passing endpoint");
}

describe.each(choices)("$theme / $recipeColours", choice => {
    it("resolves all twelve exact identity slots, including historic case", () => {
        const a = resolveAppearance(choice);
        const expected = choice.recipeColours === "original" ? stock : slots[choice.theme];
        stock.forEach((canonical, index) => {
            expect(a.recipe(canonical).fill).toBe(expected[index]);
            expect(a.recipe(canonical).canonical).toBe(canonical);
            const historic = canonical.toLowerCase();
            expect(a.recipe(historic).canonical).toBe(historic);
            expect(a.recipe(historic).fill).toBe(
                choice.recipeColours === "original" || choice.theme === "original"
                    ? historic : expected[index]);
        });
        expect(new Set(expected.slice(0, 8)).size).toBe(8);
        expect(new Set(expected.slice(8)).size).toBe(4);
    });

    it("pins the complete chrome overrides without changing canonical defaults", () => {
        const a = resolveAppearance(choice);
        expect(a.choice).toEqual(choice);
        expect(a.scheme).toBe(choice.theme === "light" ? "light" : "dark");
        expect(a.palette).toEqual({...palette, ...overrides[choice.theme]});
        expect(a.onBrand).toEqual(onBrand);
    });

    it("keeps primary and neutral selection separate, with unfaded pressed ink", () => {
        const a = resolveAppearance(choice);
        const selection = choice.theme === "light"
            ? ["#202020", "#FFFFFF"] : ["#FFFFFF", "#0C0C0C"];
        for (const [pair, [fill, ink]] of [[a.primary, primary[choice.theme]], [a.selection, selection]] as const) {
            expect(pair.fill).toBe(fill);
            expect(pair.ink).toBe(ink);
            expect(pair.pressedInk).toBe(ink);
            // Independent channel compositing, not production mix.
            const pressed = over(`rgba(${[1, 3, 5].map(i => parseInt(ink.slice(i, i + 2), 16)).join(",")},0.06)`, fill);
            expect(pair.pressedFill).toBe(pressed);
            expect(contrast(pair.ink, pair.fill)).toBeGreaterThanOrEqual(4.5);
            expect(contrast(pair.pressedInk, pair.pressedFill)).toBeGreaterThanOrEqual(4.5);
        }
    });

    it("measures informative text on its actual chrome and support-tile surfaces", () => {
        const {palette: p, onBrand: brand} = resolveAppearance(choice);
        for (const ground of [p.base, p.surface, p.raised]) {
            for (const ink of [p.text, p.dim, p.placeholder, p.success, p.warn, p.danger, p.info, p.brand]) {
                expect(contrast(ink, ground)).toBeGreaterThanOrEqual(4.5);
            }
        }
        for (const ink of [p.dangerFaint, p.successMuted, p.warnMuted]) {
            expect(contrast(ink, p.base)).toBeGreaterThanOrEqual(3);
        }
        expect(contrast(brand.text, p.brandFill)).toBeGreaterThanOrEqual(4.5);
        expect(contrast(brand.marker, p.brandFill)).toBeGreaterThanOrEqual(3);
    });

    it.each(stock)("measures every rendered card layer on %s", canonical => {
        const a = resolveAppearance(choice);
        const c = a.recipe(canonical);
        expectCard(c, a);
        expect(c.ink).toBe(firstPassing(c.fill, [a.palette.base, a.palette.surface, a.palette.raised], 4.5));
        expect(c.cupInk).toBe(firstPassing(cupLineFor(c.fill), [a.palette.base], 3));
        expect(a.onFill(c.fill)).toEqual(c.onAccent);
        const themed = choice.recipeColours === "themed" && choice.theme !== "original";
        if (!themed) {
            expect(c.onAccent).toEqual(onAccent);
            expect(c.keyInk).toEqual({normal: palette.text, success: palette.success, danger: palette.danger});
        } else if (choice.theme === "light") {
            expect(c.onAccent.text).toBe("#FFFFFF");
            expect(c.onAccent.label).toBe("rgba(255,255,255,0.90)");
            expect(c.onAccent.profileStroke).toBe("rgba(255,255,255,0.80)");
            expect(c.onAccent.key).toBe("rgba(255,255,255,0.78)");
        } else {
            expect(c.onAccent.text).toBe("#0C0C0C");
            expect(c.onAccent.label).toBe("rgba(0,0,0,0.80)");
            expect(c.onAccent.profileStroke).toBe("rgba(0,0,0,0.70)");
        }
        expectSwitch(a.switchOn(c.fill), [c.fill]);
    });

    it("uses actual displayed fills, not identity mapping, for badges and neutral controls", () => {
        const a = resolveAppearance(choice);
        for (const fill of [a.palette.info, a.selection.fill, a.primary.fill]) {
            const inks = a.onFill(fill);
            for (const role of ["text", "label", "marker"] as const) {
                expect(contrast(inks[role], fill)).toBeGreaterThanOrEqual(4.5);
            }
        }
        // Already-displayed Light slots are unknown identities, not mapped again.
        expect(a.recipe("#254E83").fill).toBe("#254E83");
    });

    it("measures chrome switches and preserves Original Dark treatment", () => {
        const a = resolveAppearance(choice);
        expectSwitch(a.chromeSwitch, [a.palette.base, a.palette.surface, a.palette.raised]);
        if (choice.theme === "original") expect(a.chromeSwitch).toEqual(switchColours.dark);
        expect(a.switchOn(stock[0])).toEqual(switchColours.accent);
    });

    it("preserves four machine identities and fits both inks on active chrome", () => {
        const a = resolveAppearance(choice);
        const mapped = machineColours.map(c => a.machineColour(c));
        expect(mapped.map(c => c.name)).toEqual(["Green", "Blue", "Violet", "Cyan"]);
        expect(new Set(mapped.map(c => c.ink)).size).toBe(4);
        expect(new Set(mapped.map(c => c.muted)).size).toBe(4);
        for (const c of mapped) {
            for (const ground of [a.palette.base, a.palette.surface, a.palette.raised]) {
                expect(contrast(c.ink, ground)).toBeGreaterThanOrEqual(4.5);
                expect(contrast(c.muted, ground)).toBeGreaterThanOrEqual(4.5);
            }
        }
        if (choice.theme === "original") expect(mapped).toEqual(machineColours);
    });

    it.each(["#C86A3B", "#c86a3b", "#010203", "#FFFFFF", "#757575", "#000000"])(
        "preserves unknown historic %s and fits every real layer", canonical => {
            const a = resolveAppearance(choice);
            const c = a.recipe(canonical);
            expect(c.canonical).toBe(canonical);
            expect(c.fill).toBe(canonical);
            const dark = contrast("#000000", canonical) >= contrast("#FFFFFF", canonical);
            expect(c.onAccent.text).toBe(dark ? "#000000" : "#FFFFFF");
            expectCard(c, a);
            // A raised alpha must be the first passing .01 step, not an
            // arbitrary jump to solid ink that erases the role hierarchy.
            for (const [role, start, floor] of [
                ["label", dark ? 0.65 : 0.90, 4.5],
                ["marker", dark ? 0.70 : 0.90, 4.5],
                ["profileStroke", dark ? 0.50 : 0.80, 3]
            ] as const) {
                const value = c.onAccent[role];
                const alpha = Number(value.slice(value.lastIndexOf(",") + 1, -1));
                expect(alpha).toBeGreaterThanOrEqual(start);
                if (alpha > start) {
                    const previous = value.replace(/,[\d.]+\)$/, `,${(alpha - 0.01).toFixed(2)})`);
                    expect(contrast(previous, c.fill)).toBeLessThan(floor);
                }
            }
            expectSwitch(a.switchOn(c.fill), [c.fill]);
        });

    it.each([
        ["#f00", "#ff0000"],
        ["#F00", "#FF0000"],
        ["#aBc", "#aaBBcc"],
        ["#000", "#000000"],
        ["#FFF", "#FFFFFF"]
    ])("preserves historic shorthand %s while computing with %s", (canonical, expanded) => {
        const a = resolveAppearance(choice);
        const c = a.recipe(canonical);
        const equivalent = a.recipe(expanded);
        expect(c.canonical).toBe(canonical);
        expect(c.fill).toBe(canonical);
        expect(c).toEqual({...equivalent, canonical, fill: canonical});
        // The independent contrast oracle deliberately takes six-digit hex only.
        expectCard({...c, fill: expanded}, a);
        expect(c.ink).toBe(firstPassing(expanded, [a.palette.base, a.palette.surface, a.palette.raised], 4.5));
        expect(c.cupInk).toBe(firstPassing(cupLineFor(expanded), [a.palette.base], 3));
        expect(a.onFill(canonical)).toEqual(equivalent.onAccent);
        expect(a.switchOn(canonical)).toEqual(a.switchOn(expanded));
        expectSwitch(a.switchOn(canonical), [expanded]);
    });

    it.each([
        ["red", "#ff0000"], ["rgb(255,0,0)", "#ff0000"],
        ["hsl(0,100%,50%)", "#ff0000"], ["#FF0000FF", "#ff0000"],
        ["#f00f", "#ff0000"], ["rebeccapurple", "#663399"],
        ["rgba(0,0,0,0.5)", "black-half"],
        ["#f008", "red-half"], ["#FF000080", "red-half"],
        ["rgba(255,0,0,0.5)", "red-half"], ["hsla(0,100%,50%,0.5)", "red-half"],
        ["transparent", "base"]
    ])("preserves RN colour %s and derives from its effective base composite", (canonical, expected) => {
        const a = resolveAppearance(choice);
        // RN quantises .5 alpha to 128/255, and #RGBA's 8 to 136/255.
        // Explicit independent six-digit composites, never parsed from the input.
        const composites = {
            original: {half: "#800000", short: "#880000", black: "#000000"},
            light: {half: "#fa7a78", short: "#fa7270", black: "#7a7a78"},
            blue: {half: "#800a5c", short: "#880a56", black: "#000a5c"},
            magenta: {half: "#93050e", short: "#9a050e", black: "#13050e"}
        }[choice.theme];
        const effective = expected === "base" ? a.palette.base
            : expected === "black-half" ? composites.black
            : expected === "red-half" ? canonical === "#f008" ? composites.short : composites.half
            : expected;
        const c = a.recipe(canonical);
        const equivalent = a.recipe(effective);
        expect(c.canonical).toBe(canonical);
        expect(c.fill).toBe(canonical);
        expect(c).toEqual({...equivalent, canonical, fill: canonical});
        expectCard({...c, fill: effective}, a);
        expect(c.ink).toBe(firstPassing(effective, [a.palette.base, a.palette.surface, a.palette.raised], 4.5));
        expect(c.cupInk).toBe(firstPassing(cupLineFor(effective), [a.palette.base], 3));
        expect(a.onFill(canonical)).toEqual(a.onFill(effective));
        expect(a.switchOn(canonical)).toEqual(a.switchOn(effective));
        expectSwitch(a.switchOn(canonical), [effective]);
    });

    it.each([
        "", "#xyzxyz", "#12345g", "#1234567", "#12", "#12345",
        "#123456789", "#f0g", " #f00", "#f00 ", "not-a-colour", "rgba(nope)"
    ])(
        "rejects invalid RN colour syntax %p explicitly", value => {
            const a = resolveAppearance(choice);
            expect(() => a.recipe(value)).toThrow(/colour/i);
            expect(() => a.onFill(value)).toThrow(/colour/i);
            expect(() => a.switchOn(value)).toThrow(/colour/i);
        });
});

it("resolves independently of call order and later mutation of the caller's choice", () => {
    const choice = {theme: "light", recipeColours: "themed"} as const;
    const a = resolveAppearance(choice);
    const before = a.recipe(stock[0]);
    const all = choices.map(c => resolveAppearance(c));
    const snapshots = all.map(a => stock.map(c => a.recipe(c)));
    all.reverse().forEach(other => other.recipe(stock[0]));
    choices.forEach((c, index) => {
        const fresh = resolveAppearance(c);
        expect(stock.map(colour => fresh.recipe(colour))).toEqual(snapshots[index]);
        expect(stock.map(colour => all[all.length - index - 1].recipe(colour))).toEqual(snapshots[index]);
    });
    expect(a.recipe(stock[0])).toEqual(before);
    const mutable: {theme: "light" | "blue"; recipeColours: "themed"} = {...choice};
    const captured = resolveAppearance(mutable);
    mutable.theme = "blue";
    expect(captured.choice).toEqual(choice);
    expect(captured.recipe(stock[0])).toEqual(before);
    expect(JSON.stringify({palette, onAccent, onBrand, accents, switchColours, machineColours})).toBe(canonicalBefore);
    expect([...accents.coffee, ...accents.tea]).toEqual(stock);
});

it.each(stock)("retains passing Original Dark chrome/chart outputs for %s", canonical => {
    const c = resolveAppearance({theme: "original", recipeColours: "original"}).recipe(canonical);
    expect(c.ink).toBe(canonical);
    expect(c.cupInk).toBe(cupLineFor(canonical));
});
