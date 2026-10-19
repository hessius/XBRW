import {act, renderHook} from "@testing-library/react-native";

import {useBrewHistoryQuery} from "@/hooks/useBrewHistoryQuery";
import {Settings, type SettingsStorage} from "@/library/Settings";

function settingsWith(raw: Record<string, string> = {}): Settings {
    const map = new Map(Object.entries(raw));
    const storage: SettingsStorage = {
        read: (key) => map.get(key) ?? null,
        write: (key, value) => { map.set(key, value); }
    };
    return new Settings(storage);
}

describe("useBrewHistoryQuery", () => {
    it("defaults old settings to all records newest first within the route scope", async () => {
        const settings = settingsWith();
        const {result} = await renderHook(() => useBrewHistoryQuery("recipe", settings));
        expect(result.current.query).toEqual({
            sort: "date", direction: "desc", hideUnsuccessful: false,
            ratedOnly: false, recipeUuid: "recipe"
        });
    });

    it("remembers sorting across mounts but not filters", async () => {
        const settings = settingsWith();
        const first = await renderHook(() => useBrewHistoryQuery(undefined, settings));
        await act(async () => {
            first.result.current.onSortChange("grind", "asc");
            first.result.current.toggleHideUnsuccessful();
            first.result.current.toggleRatedOnly();
        });
        expect(first.result.current.query).toMatchObject({
            sort: "grind", direction: "asc", hideUnsuccessful: true, ratedOnly: true
        });
        expect(settings.get("brewHistorySort")).toBe("grind");
        expect(settings.get("brewHistorySortDirection")).toBe("asc");
        await first.unmount();
        const next = await renderHook(() => useBrewHistoryQuery(undefined, settings));
        expect(next.result.current.query).toMatchObject({
            sort: "grind", direction: "asc", hideUnsuccessful: false, ratedOnly: false
        });
    });

    it("clears only transient filters, retaining sort and recipe scope", async () => {
        const settings = settingsWith();
        const {result} = await renderHook(() => useBrewHistoryQuery("recipe", settings));
        await act(async () => {
            result.current.onSortChange("dose", "asc");
            result.current.toggleHideUnsuccessful();
            result.current.toggleRatedOnly();
        });
        await act(async () => result.current.clearFilters());
        expect(result.current.query).toEqual({
            sort: "dose", direction: "asc", hideUnsuccessful: false,
            ratedOnly: false, recipeUuid: "recipe"
        });
    });

    it("narrows unknown stored strings back to safe defaults", async () => {
        const settings = settingsWith({
            brewHistorySort: '"unknown"', brewHistorySortDirection: '"sideways"'
        });
        const {result} = await renderHook(() => useBrewHistoryQuery(undefined, settings));
        expect(result.current.query.sort).toBe("date");
        expect(result.current.query.direction).toBe("desc");
    });
});
