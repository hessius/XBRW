import {accents, machineColours, mix, onAccent, onBrand, palette, switchColours} from "@/constants/colors";
import {contrast, over} from "@/test-utils/contrast";

const everyAccent = [...accents.coffee, ...accents.tea];

describe("contrast helper", () => {
    it("computes the reference ratio for black on white", () => {
        expect(contrast("#000000", "#FFFFFF")).toBeCloseTo(21, 1);
    });

    it("computes 1 for a colour on itself", () => {
        expect(contrast("#4A7BC8", "#4A7BC8")).toBeCloseTo(1, 5);
    });

    it("composites a translucent foreground over its background", () => {
        // Fully transparent black over white is white: no contrast at all. This
        // is what stops the suite from silently ignoring alpha and grading every
        // translucent ink as pure black.
        expect(contrast("rgba(0,0,0,0)", "#FFFFFF")).toBeCloseTo(1, 5);
    });
});

describe("accent inks", () => {
    it.each(everyAccent)("carries readable value text on %s", (accent) => {
        expect(contrast(onAccent.text, accent)).toBeGreaterThanOrEqual(4.5);
    });

    it.each(everyAccent)("carries readable micro-labels on %s", (accent) => {
        // 11 px, and the only cue to what the number beneath it means, so it is
        // held to the same 4.5:1 as body text rather than the large-text 3:1.
        expect(contrast(onAccent.label, accent)).toBeGreaterThanOrEqual(4.5);
    });

    it.each(everyAccent)("carries a distinguishable beverage marker on %s", (accent) => {
        expect(contrast(onAccent.marker, accent)).toBeGreaterThanOrEqual(4.5);
    });

    it.each(everyAccent)("draws the pour profile stroke visibly on %s", (accent) => {
        // A stroke is a graphical object, which AA holds to 3:1.
        expect(contrast(onAccent.profileStroke, accent)).toBeGreaterThanOrEqual(3);
    });
});

describe("the action key on an accent card", () => {
    // The key is a translucent black well punched into the accent, and the tone
    // ink is drawn on top of it. Two composites deep, so neither ratio can be
    // reasoned about from the palette alone.
    it.each(everyAccent)("takes the duplicate ink on %s", (accent) => {
        expect(contrast(palette.success, over(onAccent.key, accent)))
            .toBeGreaterThanOrEqual(3);
    });

    it.each(everyAccent)("takes the delete ink on %s", (accent) => {
        expect(contrast(palette.danger, over(onAccent.key, accent)))
            .toBeGreaterThanOrEqual(3);
    });

    it.each(everyAccent)("stays distinguishable from the accent itself on %s", (accent) => {
        // A key that matched the card would leave the glyph floating with no
        // suggestion that it is a separate, pressable thing.
        expect(contrast(onAccent.key, accent)).toBeGreaterThanOrEqual(3);
    });
});

describe("the row actions revealed by a swipe", () => {
    // Colour appears here only as ink: the tile is the app's own surface. The
    // caption is 10 px Doto, which is small text and held to 4.5:1 — the glyph
    // beside it would pass at 3:1 and the caption would not.
    it("carries the duplicate caption on the tile", () => {
        expect(contrast(palette.success, palette.surface)).toBeGreaterThanOrEqual(4.5);
    });

    it("carries the delete caption on the tile", () => {
        expect(contrast(palette.danger, palette.surface)).toBeGreaterThanOrEqual(4.5);
    });
});

describe("the support tile, filled with the deepened brand magenta", () => {
    // `brandFill` is not one of the twelve recipe accents, and unlike them it
    // is dark and takes white ink, so nothing the "accent inks" block above
    // proves applies to it and each ink is measured against it separately.
    it("carries both lines of copy in solid white", () => {
        expect(contrast(onBrand.text, palette.brandFill)).toBeGreaterThanOrEqual(4.5);
    });

    // The reason the fill is a second token rather than a change to `brand`.
    // White on `brand` itself is 3.78:1 and misses AA, so anyone simplifying
    // the two tokens back into one takes the tile's copy below the floor.
    it("cannot be filled with the ink magenta, which is too light for white", () => {
        expect(contrast(onBrand.text, palette.brand)).toBeLessThan(4.5);
    });

    // The other half of that squeeze, pinned so the pair cannot be collapsed
    // from the other end either: `brandFill` is too dark to be used as ink.
    it("cannot be used as ink, which is what keeps the two tokens apart", () => {
        expect(contrast(palette.brandFill, palette.base)).toBeLessThan(4.5);
    });

    // The chevron is a graphic, not text, so 3:1 is its floor.
    it("carries the chevron", () => {
        expect(contrast(onBrand.marker, palette.brandFill)).toBeGreaterThanOrEqual(3);
    });
});

describe("palette inks on the base background", () => {
    it.each([
        ["text", palette.text],
        ["dim", palette.dim],
        ["success", palette.success],
        ["danger", palette.danger],
        ["warn", palette.warn],
        ["info", palette.info],
        ["brand", palette.brand]
    ])("keeps %s readable", (_name, colour) => {
        expect(contrast(colour, palette.base)).toBeGreaterThanOrEqual(4.5);
    });

    it("keeps the brand magenta readable on a raised card too", () => {
        // It is used for the wordmark's `++` and for section headings, both of
        // which sit on `raised` as often as on `base`.
        expect(contrast(palette.brand, palette.raised)).toBeGreaterThanOrEqual(4.5);
    });

    it("keeps the line colour below text contrast, as a divider not an ink", () => {
        // A guard against someone "fixing" the divider by brightening it into
        // something that reads as text.
        expect(contrast(palette.line, palette.base)).toBeLessThan(4.5);
    });
});

describe("mix", () => {
    it("returns each end at the ends", () => {
        expect(mix("#000000", "#ffffff", 0)).toBe("#000000");
        expect(mix("#000000", "#ffffff", 1)).toBe("#ffffff");
    });

    it("blends halfway", () => {
        expect(mix("#000000", "#ffffff", 0.5)).toBe("#808080");
    });

    it("clamps rather than extrapolating past either end", () => {
        expect(mix("#000000", "#ffffff", -3)).toBe("#000000");
        expect(mix("#000000", "#ffffff", 9)).toBe("#ffffff");
    });

    it("blends each channel independently", () => {
        expect(mix("#ff0000", "#0000ff", 0.5)).toBe("#800080");
    });

    it("always returns a six-digit hex, padding a small channel", () => {
        expect(mix("#000000", "#0f0f0f", 0.5)).toBe("#080808");
    });
});

describe("switch states", () => {
    // WCAG 1.4.11: the parts of a control that show its state need 3:1 against
    // what is next to them. Before these tokens, on and off were two near-equal
    // greys with the same white thumb, and position was the only cue.
    const {dark, accent} = switchColours;
    const grounds = {base: palette.base, surface: palette.surface, raised: palette.raised};

    it.each(Object.entries(grounds))("fills the on track visibly on %s", (_, ground) => {
        expect(contrast(dark.on.track, ground)).toBeGreaterThanOrEqual(3);
    });

    it.each(Object.entries(grounds))("rings the off track visibly on %s", (_, ground) => {
        // The off fill is the quiet `control` grey and stays under 3:1 on
        // purpose; the ring is what carries the edge.
        expect(contrast(dark.off.track, ground)).toBeLessThan(3);
        expect(contrast(dark.off.ring, ground)).toBeGreaterThanOrEqual(3);
    });

    it("tells the on track from the off track", () => {
        expect(contrast(dark.on.track, dark.off.track)).toBeGreaterThanOrEqual(3);
    });

    it("fills the on track with the brighter of the two magentas", () => {
        // `brandFill` would carry the white thumb better, but sits only 2.53:1
        // from the off track. Pinned so it is not swapped in by symmetry with
        // the support tile.
        expect(dark.on.track).toBe(palette.brand);
        expect(contrast(palette.brandFill, dark.off.track)).toBeLessThan(3);
    });

    it("keeps each thumb visible on its own track", () => {
        expect(contrast(dark.on.thumb, dark.on.track)).toBeGreaterThanOrEqual(3);
        expect(contrast(dark.off.thumb, dark.off.track)).toBeGreaterThanOrEqual(3);
    });

    it("pins the measured values", () => {
        // The figures quoted in `switchColours`. A retuned token has to move
        // these on purpose rather than drift past them.
        expect(contrast(dark.on.track, palette.surface)).toBeCloseTo(5.04, 2);
        expect(contrast(dark.on.track, palette.raised)).toBeCloseTo(4.79, 2);
        expect(contrast(dark.on.track, dark.off.track)).toBeCloseTo(3.59, 2);
        expect(contrast(dark.on.thumb, dark.on.track)).toBeCloseTo(3.78, 2);
        expect(contrast(dark.off.ring, palette.surface)).toBeCloseTo(3.73, 2);
        expect(contrast(dark.off.ring, palette.raised)).toBeCloseTo(3.55, 2);
        expect(contrast(dark.off.thumb, dark.off.track)).toBeCloseTo(5.38, 2);
    });

    describe("on a recipe accent", () => {
        it.each(everyAccent)("fills the on track visibly on %s", (fill) => {
            expect(contrast(accent.on.track, fill)).toBeGreaterThanOrEqual(3);
            expect(contrast(accent.on.thumb, accent.on.track)).toBeGreaterThanOrEqual(3);
        });

        it.each(everyAccent)("outlines the off track and thumb visibly on %s", (fill) => {
            // Off is hollow: the accent shows through, so the ring and the
            // thumb are measured against the accent itself, and so is the
            // difference between the filled on track and the empty off one.
            expect(accent.off.track).toBe(palette.none);
            expect(contrast(accent.off.ring, fill)).toBeGreaterThanOrEqual(3);
            expect(contrast(accent.off.thumb, fill)).toBeGreaterThanOrEqual(3);
        });
    });
});

describe("machine colours", () => {
    const surfaces = [["base", palette.base], ["surface", palette.surface],
                      ["raised", palette.raised]] as const;
    const inks = machineColours.flatMap((colour) => [
        [`${colour.name} ink`, colour.ink], [`${colour.name} muted`, colour.muted]
    ] as const);

    it("starts with today's connected green, so one machine draws what it always drew", () => {
        expect(machineColours[0].ink).toBe(palette.success);
        expect(machineColours[0].muted).toBe(palette.successMuted);
    });

    it.each(inks.flatMap(([name, ink]) => surfaces.map(([where, surface]) =>
        [name, where, ink, surface] as const)))(
        "keeps %s readable on %s, as text as well as a dot", (_name, _where, ink, surface) => {
            expect(contrast(ink, surface)).toBeGreaterThanOrEqual(4.5);
        });

    it("spends none of the colours that already mean something", () => {
        // Amber is the machine connecting or stopped, red a fault or a machine
        // not answering, and magenta is the brand, which never marks a state.
        const reserved = [palette.warn, palette.danger, palette.dangerFaint,
                          palette.brand, palette.brandFill];
        for (const colour of machineColours) {
            expect(reserved).not.toContain(colour.ink);
            expect(reserved).not.toContain(colour.muted);
        }
    });

    it("has four distinct colours with distinct names", () => {
        expect(new Set(machineColours.map((colour) => colour.ink)).size).toBe(machineColours.length);
        expect(new Set(machineColours.map((colour) => colour.name)).size).toBe(machineColours.length);
        expect(machineColours).toHaveLength(4);
    });
});
