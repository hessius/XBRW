import {
    DEFAULT_APPEARANCE,
    THEME_IDS,
    isRecipeColourMode,
    isThemeId,
    readAppearanceChoice,
    type AppearanceChoice,
    type RecipeColourMode
} from "@/library/appearance";

const recipeColourModes: readonly RecipeColourMode[] = ["original", "themed"];
const invalidValues: unknown[] = [
    null, undefined, 1, "", "Original", "system", " original ", true, {}
];

describe("appearance", () => {
    it("defines exactly four theme IDs and the original defaults", () => {
        expect(THEME_IDS).toEqual(["original", "light", "blue", "magenta"]);
        expect(DEFAULT_APPEARANCE).toEqual({
            theme: "original",
            recipeColours: "original"
        });
    });

    it.each(["original", "light", "blue", "magenta"])("accepts theme %s", (theme) => {
        expect(isThemeId(theme)).toBe(true);
    });

    it.each(recipeColourModes)("accepts recipe colour mode %s", (mode) => {
        expect(isRecipeColourMode(mode)).toBe(true);
    });

    it.each(invalidValues)("rejects invalid theme %p", (value) => {
        expect(isThemeId(value)).toBe(false);
    });

    it.each([...invalidValues, "light", "blue", "magenta", "Themed", " themed "])(
        "rejects invalid recipe colour mode %p",
        (value) => {
            expect(isRecipeColourMode(value)).toBe(false);
        }
    );

    describe.each(["original", "light", "blue", "magenta"])("theme %s", (theme) => {
        it.each(recipeColourModes)("preserves recipe colour mode %s", (recipeColours) => {
            expect(readAppearanceChoice(theme, recipeColours)).toEqual({
                choice: {theme, recipeColours},
                invalidKeys: []
            });
        });
    });

    it("recovers both invalid values with explicit ordered keys", () => {
        expect(readAppearanceChoice("system", null)).toEqual({
            choice: {theme: "original", recipeColours: "original"},
            invalidKeys: ["appearanceTheme", "recipeColourMode"]
        });
    });

    it.each(recipeColourModes)("preserves valid mode %s when the theme is invalid", (recipeColours) => {
        expect(readAppearanceChoice("system", recipeColours)).toEqual({
            choice: {theme: "original", recipeColours},
            invalidKeys: ["appearanceTheme"]
        });
    });

    it.each(["original", "light", "blue", "magenta"])(
        "preserves valid theme %s when the recipe colour mode is invalid",
        (theme) => {
            expect(readAppearanceChoice(theme, false)).toEqual({
                choice: {theme, recipeColours: "original"},
                invalidKeys: ["recipeColourMode"]
            });
        }
    );

    it("leaves input objects and defaults unchanged during recovery", () => {
        const theme = Object.freeze({theme: "blue"});
        const recipeColours = Object.freeze({recipeColours: "themed"});
        const defaults: AppearanceChoice = {...DEFAULT_APPEARANCE};

        const result = readAppearanceChoice(theme, recipeColours);

        expect(result.choice).not.toBe(DEFAULT_APPEARANCE);
        expect(theme).toEqual({theme: "blue"});
        expect(recipeColours).toEqual({recipeColours: "themed"});
        expect(DEFAULT_APPEARANCE).toEqual(defaults);
    });
});
