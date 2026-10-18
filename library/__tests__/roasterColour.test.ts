import {accents, onAccent} from "@/constants/colors";
import {matchAccent} from "@/library/cloud/accentMatch";
import {MAX_HUE_GAP, readRoasterColour, roasterAccent} from "@/library/roasterColour";
import {contrast} from "@/test-utils/contrast";

const COFFEE: Record<string, number> = {
    Sky: 0, Peach: 1, Blossom: 2, Sage: 3, Mint: 4, Lilac: 5, Ice: 6, Rose: 7
};

describe("readRoasterColour", () => {
    it("takes #RRGGBB in either case and returns it upper case", () => {
        expect(readRoasterColour("#1d5f96")).toBe("#1D5F96");
        expect(readRoasterColour("#8A2F35")).toBe("#8A2F35");
        expect(readRoasterColour(" #1F6F78 ")).toBe("#1F6F78");
    });

    it.each([
        ["no hash", "1D5F96"],
        ["shorthand", "#15A"],
        ["alpha", "#1D5F96FF"],
        ["a name", "navy"],
        ["not hex", "#1D5G96"],
        ["css function", "rgb(29,95,150)"],
        ["empty", ""],
        ["two colours", "#1D5F96#8A2F35"]
    ])("refuses %s", (_label, value) => {
        expect(readRoasterColour(value)).toBeUndefined();
    });

    it("refuses anything that is not a string", () => {
        expect(readRoasterColour(0x1d5f96)).toBeUndefined();
        expect(readRoasterColour(null)).toBeUndefined();
        expect(readRoasterColour(undefined)).toBeUndefined();
        expect(readRoasterColour(["#1D5F96"])).toBeUndefined();
    });
});

describe("roasterAccent", () => {
    it.each([
        ["#1D5F96", "Sky"],     // a mid blue
        ["#1F6F78", "Ice"],     // a teal
        ["#8A2F35", "Blossom"], // a deep red
        ["#6B4226", "Peach"],   // a brown
        ["#2E7D32", "Sage"],    // a green
        ["#5B2C83", "Lilac"]    // a purple
    ])("maps the roaster colour %s to %s", (colour, accent) => {
        expect(roasterAccent(colour, "coffee")).toBe(COFFEE[accent]);
    });

    it("finds by hue the label colours the xBloom matcher refuses", () => {
        // The reason this is not `matchAccent`: a label colour is far darker
        // than every pastel accent, so distance refuses all of them.
        for (const colour of ["#1D5F96", "#1F6F78", "#8A2F35"]) {
            expect(matchAccent(colour, "coffee")).toBeNull();
            expect(roasterAccent(colour, "coffee")).not.toBeNull();
        }
    });

    it("gives no answer for a grey, however dark or light", () => {
        expect(roasterAccent("#333333", "coffee")).toBeNull();
        expect(roasterAccent("#808080", "coffee")).toBeNull();
        expect(roasterAccent("#000000", "coffee")).toBeNull();
        expect(roasterAccent("#FFFFFF", "coffee")).toBeNull();
    });

    it("gives no answer for a hue no accent is near", () => {
        // A gold sits in the gap between Peach and Sage. Peach would be a
        // confident wrong answer.
        expect(roasterAccent("#C9A227", "coffee")).toBeNull();
        // The tea half is all warm colours, so a blue has nowhere to go.
        expect(roasterAccent("#1D5F96", "tea")).toBeNull();
    });

    it("answers within the group it is asked about", () => {
        const index = roasterAccent("#8A2F35", "tea");
        expect(index).not.toBeNull();
        expect(index!).toBeLessThan(accents.tea.length);
    });

    it("gives no answer for a malformed colour", () => {
        expect(roasterAccent("1D5F96", "coffee")).toBeNull();
        expect(roasterAccent(undefined, "coffee")).toBeNull();
    });

    it("keeps the hue gap narrow enough that no accent claims a yellow", () => {
        // Peach (59) to Sage (138) is the widest gap, about 79 degrees. A gap
        // of 40 or more would let one of them reach its middle.
        expect(MAX_HUE_GAP).toBeLessThan(40);
    });

    it("lands only on fills the dark card ink reads on at AA", () => {
        // The card's name and values are `onAccent.text`; its micro-labels are
        // `onAccent.label`. Whatever a roaster sends, the fill is a palette
        // accent, so the ink keeps at least 4.5:1.
        const samples = [
            "#1D5F96", "#1F6F78", "#8A2F35", "#6B4226", "#2E7D32", "#5B2C83",
            "#FF0000", "#00FF00", "#0000FF", "#FF00FF", "#00FFFF", "#FFC0CB"
        ];
        let answered = 0;
        for (const group of ["coffee", "tea"] as const) {
            for (const colour of samples) {
                const index = roasterAccent(colour, group);
                if (index === null) continue;
                answered++;
                const fill = accents[group][index];
                expect(contrast(onAccent.text, fill)).toBeGreaterThanOrEqual(4.5);
                expect(contrast(onAccent.label, fill)).toBeGreaterThanOrEqual(4.5);
            }
        }
        // Not vacuous: most of the samples do land on an accent.
        expect(answered).toBeGreaterThan(10);
    });
});
