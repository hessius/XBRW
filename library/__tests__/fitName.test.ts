import {FIT_NAME_MAX, fitName, fitSizedName} from "@/library/fitName";

/** Real coffee names from a roaster's feed that ran over the ceiling with " - 18g". */
const LONG = [
    "Colombia | Las Flores | Jhoan Vergara | Java Hydrohoney (Duo Cherry Velvet) (Competition Coffee)",
    "Colombia | Las Flores | Jhoan Vergara | Chiroso Hydrohoney (Duo Cherry Velvet) (Competition Coffee)",
    "Colombia | El Diviso | Nestor Lasso | Aji Bourbon Natural (Tropical Fruit Forward Lush) (Competition Coffee)",
    "Colombia | Zarza | Jonathan Gasca | Pacamara Natural (Tropical Fruit Forward Lush) (Competition Coffee)",
    "Colombia | Las Flores | Jhoan Vergara | Chiroso Natural (Creamy Cultured Brilliance) (Competition Coffee)",
    "Colombia | Las Flores | Jhoan Vergara | Java Natural (Fruit Forward Berry Ensemble) (Competition Coffee)"
];

describe("fitName", () => {
    it("leaves a name that fits alone", () => {
        expect(fitName("Peru | El Palto | Gesha Washed", " - 18g")).toBe("Peru | El Palto | Gesha Washed - 18g");
    });

    it.each(LONG)("fits %s with its dose, never cutting a word", (name) => {
        const fitted = fitName(name, " - 18g");
        expect(fitted.length).toBeLessThanOrEqual(FIT_NAME_MAX);
        expect(fitted.endsWith(" - 18g")).toBe(true);
        const body = fitted.slice(0, -" - 18g".length).replace(/…$/, "");
        // Whatever is left is the start of the real name, word for word.
        expect(name.startsWith(body)).toBe(true);
        expect(name.charAt(body.length)).toMatch(/^[\s(]?$/);
    });

    it("drops trailing bracketed groups one at a time, keeping what fits", () => {
        expect(fitName(LONG[2], " - 18g"))
            .toBe("Colombia | El Diviso | Nestor Lasso | Aji Bourbon Natural (Tropical Fruit Forward Lush) - 18g");
        expect(fitName(LONG[0], " - 18g"))
            .toBe("Colombia | Las Flores | Jhoan Vergara | Java Hydrohoney (Duo Cherry Velvet) - 18g");
    });

    it("cuts at a whole word with an ellipsis when brackets are not enough", () => {
        const name = "Word ".repeat(30).trim();
        const fitted = fitName(name, " - 15g");
        expect(fitted.length).toBeLessThanOrEqual(FIT_NAME_MAX);
        expect(fitted).toMatch(/^(Word )+Word… - 15g$/);
    });

    it("drops a separator left dangling by the cut", () => {
        const name = `${"Abcdefghi | ".repeat(12)}End`;
        expect(fitName(name, " - 18g", 40)).toBe("Abcdefghi | Abcdefghi | Abcdefghi… - 18g");
    });

    it("folds whitespace", () => {
        expect(fitName("  A \n B  ", " - 18g")).toBe("A B - 18g");
    });
});

describe("fitSizedName", () => {
    it("keeps a link's dose suffix and fits the part before it", () => {
        expect(fitSizedName(`${LONG[0]} - 18g`))
            .toBe("Colombia | Las Flores | Jhoan Vergara | Java Hydrohoney (Duo Cherry Velvet) - 18g");
        expect(fitSizedName("Short - 15g")).toBe("Short - 15g");
    });

    it("fits a name with no suffix as a whole", () => {
        const fitted = fitSizedName(LONG[0].repeat(2));
        expect(fitted.length).toBeLessThanOrEqual(FIT_NAME_MAX);
        expect(fitted.endsWith("…")).toBe(true);
    });
});
