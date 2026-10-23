export const THEME_IDS = ["original", "light", "blue", "magenta"] as const;

export type ThemeId = typeof THEME_IDS[number];
export type RecipeColourMode = "original" | "themed";
export type AppearanceChoice = Readonly<{
    theme: ThemeId;
    recipeColours: RecipeColourMode;
}>;

export const DEFAULT_APPEARANCE: AppearanceChoice = {
    theme: "original",
    recipeColours: "original"
};

export function isThemeId(value: unknown): value is ThemeId {
    return THEME_IDS.some(id => id === value);
}

export function isRecipeColourMode(value: unknown): value is RecipeColourMode {
    return value === "original" || value === "themed";
}

export function readAppearanceChoice(theme: unknown, recipeColours: unknown): {
    choice: AppearanceChoice;
    invalidKeys: string[];
} {
    const invalidKeys: string[] = [];
    if (!isThemeId(theme)) invalidKeys.push("appearanceTheme");
    if (!isRecipeColourMode(recipeColours)) invalidKeys.push("recipeColourMode");
    return {
        choice: {
            theme: isThemeId(theme) ? theme : DEFAULT_APPEARANCE.theme,
            recipeColours: isRecipeColourMode(recipeColours) ? recipeColours : DEFAULT_APPEARANCE.recipeColours
        },
        invalidKeys
    };
}
