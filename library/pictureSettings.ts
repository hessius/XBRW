type PictureKey = "showRecipeAvatars" | "showRecipeCardPhotos" | "showShelfPhotoPreviews";

export function pictureSettingsFromBackup(
    incoming: Record<string, unknown>
): Partial<Record<PictureKey, boolean>> {
    const result: Partial<Record<PictureKey, boolean>> = {};
    if (typeof incoming.showRecipeAvatars === "boolean") {
        result.showRecipeAvatars = incoming.showRecipeAvatars;
        result.showRecipeCardPhotos = false;
        result.showShelfPhotoPreviews = incoming.showRecipeAvatars;
    }
    for (const key of ["showRecipeCardPhotos", "showShelfPhotoPreviews"] as const) {
        if (typeof incoming[key] === "boolean") result[key] = incoming[key];
    }
    return result;
}
