import {pictureSettingsFromBackup} from "../pictureSettings";
import {Settings, type SettingsStorage} from "../Settings";

describe("scoped picture preferences", () => {
    it.each([false, true])("translates legacy %s even over configured devices", (legacy) => {
        expect(pictureSettingsFromBackup({showRecipeAvatars: legacy})).toEqual({
            showRecipeAvatars: legacy, showRecipeCardPhotos: false, showShelfPhotoPreviews: legacy
        });
    });
    it("lets explicit valid new values win and ignores malformed values", () => {
        expect(pictureSettingsFromBackup({
            showRecipeAvatars: false, showRecipeCardPhotos: true, showShelfPhotoPreviews: true
        })).toEqual({showRecipeAvatars: false, showRecipeCardPhotos: true, showShelfPhotoPreviews: true});
        expect(pictureSettingsFromBackup({showRecipeAvatars: "false", showRecipeCardPhotos: 1})).toEqual({});
        expect(pictureSettingsFromBackup({showHints: false})).toEqual({});
    });
    it("materializes an absent shelf choice only once", () => {
        const rows = new Map([["showRecipeAvatars", "false"]]);
        const storage: SettingsStorage = {
            read: key => rows.get(key) ?? null,
            write: (key, value) => { rows.set(key, value); }
        };
        const settings = new Settings(storage);
        expect(settings.get("showShelfPhotoPreviews")).toBe(false);
        expect(settings.get("showRecipeCardPhotos")).toBe(false);
        settings.set("showRecipeAvatars", true);
        expect(new Settings(storage).get("showShelfPhotoPreviews")).toBe(false);
        rows.set("showShelfPhotoPreviews", '"bad"');
        expect(new Settings(storage).get("showShelfPhotoPreviews")).toBe(true);
    });
    it.each([false, true])("preserves explicit new stored choices with legacy %s", legacy => {
        const rows = new Map(Object.entries({
            showRecipeAvatars: JSON.stringify(legacy),
            showRecipeCardPhotos: "true",
            showShelfPhotoPreviews: JSON.stringify(!legacy)
        }));
        const storage: SettingsStorage = {
            read: key => rows.get(key) ?? null,
            write: (key, value) => { rows.set(key, value); }
        };
        const settings = new Settings(storage);
        expect(settings.get("showRecipeCardPhotos")).toBe(true);
        expect(settings.get("showShelfPhotoPreviews")).toBe(!legacy);
        settings.set("showRecipeAvatars", !legacy);
        expect(settings.get("showShelfPhotoPreviews")).toBe(!legacy);
    });
});
