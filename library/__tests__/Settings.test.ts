import {DEFAULTS, Settings, type SettingsStorage} from "../Settings";

/** A storage backend that keeps everything in memory. */
function fakeStorage(seed: Record<string, string> = {}): SettingsStorage {
    const map = new Map(Object.entries(seed));
    return {
        read:  (key) => map.get(key) ?? null,
        write: (key, value) => {
            map.set(key, value);
        }
    };
}

describe("Settings", () => {
    it("keeps solid labels opt-in, including after reopening and switching them back off", () => {
        const storage = fakeStorage();
        expect(new Settings(storage).get("solidControlLabels")).toBe(false);
        new Settings(storage).set("solidControlLabels", true);
        expect(new Settings(storage).get("solidControlLabels")).toBe(true);
        new Settings(storage).set("solidControlLabels", false);
        expect(new Settings(storage).get("solidControlLabels")).toBe(false);
        expect(new Settings(fakeStorage({solidControlLabels: '"true"'}))
            .get("solidControlLabels")).toBe(false);
    });

    it("defaults both appearance preferences independently", () => {
        expect(new Settings(fakeStorage()).get("appearanceTheme")).toBe("original");
        expect(new Settings(fakeStorage()).get("recipeColourMode")).toBe("original");
        expect(new Settings(fakeStorage({appearanceTheme: '"light"'}))
            .get("recipeColourMode")).toBe("original");
        expect(new Settings(fakeStorage({recipeColourMode: '"themed"'}))
            .get("appearanceTheme")).toBe("original");
    });

    it("persists each appearance preference without replacing the other", () => {
        const storage = fakeStorage();
        const settings = new Settings(storage);
        settings.set("appearanceTheme", "light");
        settings.set("recipeColourMode", "themed");
        const reopened = new Settings(storage);
        expect(reopened.get("appearanceTheme")).toBe("light");
        expect(reopened.get("recipeColourMode")).toBe("themed");
    });

    it("does not notify or replace either preference when a theme write fails", () => {
        const storage = fakeStorage();
        const settings = new Settings(storage);
        settings.set("appearanceTheme", "light");
        settings.set("recipeColourMode", "themed");
        const listener = jest.fn();
        settings.subscribe(listener);
        const write = storage.write;
        storage.write = (key, value) => {
            if (key === "appearanceTheme") throw new Error("storage unavailable");
            write(key, value);
        };
        expect(() => settings.set("appearanceTheme", "blue")).toThrow("storage unavailable");
        expect(listener).not.toHaveBeenCalled();
        expect(settings.get("appearanceTheme")).toBe("light");
        expect(settings.get("recipeColourMode")).toBe("themed");
    });

    it("defaults history to newest date and persists both ordering preferences", () => {
        const storage = fakeStorage();
        const settings = new Settings(storage);
        expect(settings.get("brewHistorySort")).toBe("date");
        expect(settings.get("brewHistorySortDirection")).toBe("desc");
        settings.set("brewHistorySort", "ratio");
        settings.set("brewHistorySortDirection", "asc");
        expect(new Settings(storage).get("brewHistorySort")).toBe("ratio");
        expect(new Settings(storage).get("brewHistorySortDirection")).toBe("asc");
    });

    it("returns the default for a setting that was never written", () => {
        expect(new Settings(fakeStorage()).get("showCoffeeMarker"))
            .toBe(DEFAULTS.showCoffeeMarker);
    });

    it("returns a stored value", () => {
        const settings = new Settings(fakeStorage());
        settings.set("showCoffeeMarker", false);
        expect(settings.get("showCoffeeMarker")).toBe(false);
    });

    it("shows temperatures in Celsius unless told otherwise", () => {
        expect(new Settings(fakeStorage()).get("temperatureUnit")).toBe("C");
    });

    it("remembers a switch to Fahrenheit", () => {
        const storage = fakeStorage();
        new Settings(storage).set("temperatureUnit", "F");
        expect(new Settings(storage).get("temperatureUnit")).toBe("F");
    });

    it("round-trips false rather than treating it as unset", () => {
        // The bug this guards: `stored ?? default` is correct, `stored ||
        // default` is not, and for a boolean setting whose default is true the
        // difference is that turning it off does nothing.
        const settings = new Settings(fakeStorage());
        settings.set("showCoffeeMarker", false);
        expect(new Settings(fakeStorage({showCoffeeMarker: "false"}))
            .get("showCoffeeMarker")).toBe(false);
    });

    it("falls back to the default when a stored value is corrupt", () => {
        const settings = new Settings(fakeStorage({showCoffeeMarker: "not json"}));
        expect(settings.get("showCoffeeMarker")).toBe(DEFAULTS.showCoffeeMarker);
    });

    it("falls back to the default when a stored value is the wrong type", () => {
        // Parseable but nonsense: a settings row edited by hand, or written by
        // a future version that changed the type.
        const settings = new Settings(fakeStorage({showCoffeeMarker: '"yes"'}));
        expect(settings.get("showCoffeeMarker")).toBe(DEFAULTS.showCoffeeMarker);
    });

    it("persists through the storage backend, not just in memory", () => {
        const map: Record<string, string> = {};
        const storage: SettingsStorage = {
            read:  (key) => map[key] ?? null,
            write: (key, value) => {
                map[key] = value;
            }
        };
        new Settings(storage).set("showCoffeeMarker", false);
        expect(map.showCoffeeMarker).toBe("false");
    });

    it("leaves the dot matrix pour profile off unless it is asked for", () => {
        // A matter of taste, and the flat wash is the quieter of the two. A
        // preference like that belongs off by default.
        expect(new Settings(fakeStorage()).get("dotMatrixProfile")).toBe(false);
        expect(new Settings(fakeStorage()).get("showHints")).toBe(false);
    });

    it("shows recipe pictures by default, and keeps them off once turned off", () => {
        // The default moved from off to on. Only an absent row reads as the
        // default, so a stored false must survive a fresh store on the same
        // storage rather than coming back on.
        const storage = fakeStorage();
        expect(new Settings(storage).get("showRecipeAvatars")).toBe(true);

        new Settings(storage).set("showRecipeAvatars", false);
        expect(new Settings(storage).get("showRecipeAvatars")).toBe(false);
        expect(new Settings(fakeStorage({showRecipeAvatars: "false"}))
            .get("showRecipeAvatars")).toBe(false);
    });

    it("has no help style left to store", () => {
        // Two deliveries for the long-form notes shipped behind this key and
        // both were withdrawn. A key nobody reads is a row that outlives the
        // feature and confuses the next person to read the defaults.
        expect(Object.keys(DEFAULTS)).not.toContain("helpStyle");
    });

    it("animates the brew chart by default", () => {
        expect(new Settings(fakeStorage()).get("animateBrewChart")).toBe(true);
    });

    it("budgets ten megabytes for brew details by default", () => {
        expect(new Settings(fakeStorage()).get("brewTraceBudgetMB")).toBe(10);
    });

    it("ignores the old retention count in stored settings", () => {
        expect(new Settings(fakeStorage({brewTraceRetention: "200"}))
            .get("brewTraceBudgetMB")).toBe(10);
        expect(Object.keys(DEFAULTS)).not.toContain("brewTraceRetention");
    });

    it("round-trips zero for Unlimited rather than falling back to the default", () => {
        // Unlimited is a real choice, and `stored || default` would
        // silently ignore it. The same trap as `false` for a boolean.
        const storage = fakeStorage();
        new Settings(storage).set("brewTraceBudgetMB", 0);
        expect(new Settings(storage).get("brewTraceBudgetMB")).toBe(0);
    });
});
