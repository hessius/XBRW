/**
 * Builders for roaster feed tests: a feed in the published shape, a parsed
 * one, and an in-memory library standing in for the recipe table and the
 * share endpoint.
 */
import Pour from "@/library/Pour";
import Recipe from "@/library/Recipe";
import {parseRoasterFeed, type RoasterFeed} from "@/library/roasterFeed";
import type {LibraryDeps} from "@/library/roasterRecipes";
import {Settings, type SettingsStorage} from "@/library/Settings";

export const FEED_URL = "https://roaster.example/collections/coffee?view=xbrw";

export function share(id: string): string {
    return `https://share-h5.xbloom.com/?id=${encodeURIComponent(id)}`;
}

export type CoffeeSpec = {
    id: string;
    available?: boolean;
    sizes?: string[];
    name?: string;
    /** Sent as `bean.colour` when given. */
    colour?: string;
};

/** One coffee as a roaster would publish it. Share ids are `${id}-${size}`. */
export function feedCoffee({id, available = true, sizes = ["18g", "15g"], name, colour}: CoffeeSpec) {
    return {
        id,
        name:      name ?? `Coffee ${id}`,
        url:       `https://roaster.example/products/${id}`,
        available,
        image:     `https://roaster.example/cdn/${id}.png`,
        recipes:   sizes.map((size) => ({size, share: share(`${id}-${size}`)})),
        roast:       {level: "Light", rest_days: 11, peak_day: 28, best_until_day: 42},
        bag_sizes_g: [320, 160],
        bean: {
            roaster:        "Test Roaster",
            country:        "Peru",
            elevation:      "1590",
            processing:     "Washed",
            cupping_points: "88.0",
            decaffeinated:  false,
            ...(colour === undefined ? {} : {colour})
        }
    };
}

export function feedJson(coffees: CoffeeSpec[], roaster = "Test Roaster"): string {
    return JSON.stringify({
        version: 1,
        roaster: {name: roaster, url: "https://roaster.example", feed: FEED_URL},
        coffees: coffees.map(feedCoffee)
    });
}

/** A feed and the body it was read from, as `fetchRoasterFeedBody` returns them. */
export function feedBody(coffees: CoffeeSpec[], roaster?: string): {feed: RoasterFeed; body: string} {
    const body = feedJson(coffees, roaster);
    return {feed: feed(coffees, roaster), body};
}

export function feed(coffees: CoffeeSpec[], roaster?: string): RoasterFeed {
    const parsed = parseRoasterFeed(feedJson(coffees, roaster));
    if (parsed === null) throw new Error("test feed did not parse");
    return parsed;
}

/** A recipe whose card bytes can be built, so `fingerprint()` succeeds. */
export function brewable(shareId = ""): Recipe {
    const recipe = new Recipe();
    recipe.ratio = 16;
    recipe.dosage = 18;
    recipe.grindSize = 50;
    recipe.pours = [new Pour(1, 288, 92, 3, 0, 0, 0)];
    recipe.shareId = shareId;
    return recipe;
}

/**
 * A library in memory, and a share endpoint that answers with a brewable
 * recipe carrying the link's share id. `fail` names share ids that throw.
 */
export function memoryLibrary(initial: Recipe[] = [], fail: Set<string> = new Set()) {
    const recipes = new Map<string, Recipe>(initial.map((recipe) => [recipe.uuid, recipe]));
    const fetched: string[] = [];
    /** What xBloom now serves per share id: a grind, to stand in for a roaster's change. */
    const grinds = new Map<string, number>();
    const deps: LibraryDeps = {
        fetchRecipe: async (link) => {
            const id = new URL(link).searchParams.get("id") ?? "";
            fetched.push(id);
            if (fail.has(id)) throw new Error("network");
            const recipe = brewable(id);
            recipe.grindSize = grinds.get(id) ?? recipe.grindSize;
            return recipe;
        },
        stored: () => [...recipes.values()].map((recipe) => new Recipe(undefined, JSON.stringify(recipe))),
        save:   (recipe) => {
            recipes.set(recipe.uuid, new Recipe(undefined, JSON.stringify(recipe)));
        }
    };
    return {
        deps,
        fetched,
        /** The roaster changes the recipe behind a share link. */
        serve: (shareId: string, grind: number) => {
            grinds.set(shareId, grind);
        },
        all:  () => [...recipes.values()],
        find: (shareId: string) => [...recipes.values()].find((recipe) => recipe.shareId === shareId)
    };
}

/** A real `Settings` over a plain map. */
export function memorySettings(): Settings {
    const map = new Map<string, string>();
    const storage: SettingsStorage = {
        read:  (key) => map.get(key) ?? null,
        write: (key, value) => {
            map.set(key, value);
        }
    };
    return new Settings(storage);
}
