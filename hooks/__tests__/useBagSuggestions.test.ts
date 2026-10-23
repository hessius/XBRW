import {act, cleanup, renderHook} from "@testing-library/react-native";
import {useBagSuggestions} from "@/hooks/useBagSuggestions";
import CoffeeBagDatabase from "@/library/CoffeeBagDatabase";
import RecipeDatabase from "@/library/RecipeDatabase";
import Pour from "@/library/Pour";
import {bagFixture, bagRecipe} from "@/test-utils/bags";
import {createTestDatabase} from "@/test-utils/sqlite";

let mockDb: ReturnType<typeof createTestDatabase>;
jest.mock("expo-sqlite", () => ({openDatabaseSync: () => mockDb}));
beforeEach(() => {
    mockDb = createTestDatabase();
    jest.useFakeTimers({now: new Date(2026, 9, 23, 23, 59, 50)});
});
afterEach(async () => { await cleanup(); jest.restoreAllMocks(); jest.useRealTimers(); });

function fixture() {
    const recipes = new RecipeDatabase();
    const a = bagRecipe("a");
    const b = bagRecipe("b");
    a.pours = [new Pour(288)];
    b.pours = [new Pour(288)];
    recipes.insertRecipes([a, b]);
    const bags = new CoffeeBagDatabase();
    bags.create(bagFixture({restDays: 7, peakDay: 11, bestUntilDay: 25}));
    bags.select("a", "bag-a", 1);
    bags.select("b", "bag-a", 2);
    return {recipes, a, b, bags};
}

it("opens no inventory and produces no badges or suggestions while disabled", async () => {
    const open = jest.fn(() => { throw new Error("must not open"); });
    const {result} = await renderHook(() => useBagSuggestions(false, "xbrw", 0, open));
    expect(open).not.toHaveBeenCalled();
    expect(result.current).toMatchObject({entry: null, count: 0, badges: {}, today: null});
});

it("deduplicates suggestions while deriving badges for each explicitly selected recipe", async () => {
    const {bags} = fixture();
    const {result} = await renderHook(() => useBagSuggestions(true, "xbrw", 0, () => bags));
    expect(result.current).toMatchObject({count: 1, entry: {recipe: {uuid: "b"}}});
    expect(Object.keys(result.current.badges)).toEqual(["a", "b"]);
    await act(async () => { bags.select("b", null, 3); });
    expect(result.current).toMatchObject({count: 1, entry: {recipe: {uuid: "a"}}});
    expect(result.current.badges.b).toBeUndefined();
});

it("refreshes saved recipe data with the library revision, and resets an invalid candidate cursor", async () => {
    const {bags, recipes, a} = fixture();
    bags.create(bagFixture({id: "bag-b"}));
    bags.select("b", "bag-b", 3);
    const {result, rerender} = await renderHook(({revision}: {revision: number}) =>
        useBagSuggestions(true, "xbrw", revision, () => bags), {initialProps: {revision: 0}});
    await act(async () => { result.current.next(); });
    expect(result.current.entry?.recipe.uuid).toBe("b");
    a.name = "Renamed saved recipe";
    recipes.updateRecipe("a", a);
    await rerender({revision: 1});
    await act(async () => { bags.finish("bag-b", Date.now()); });
    expect(result.current.entry?.recipe.displayName()).toBe("Renamed saved recipe");
    expect(result.current.count).toBe(1);
});

it("changes its dismissal calendar day at local midnight", async () => {
    const {bags} = fixture();
    const {result} = await renderHook(() => useBagSuggestions(true, "xbrw", 0, () => bags));
    expect(result.current.today).toBe("2026-10-23");
    await act(async () => { jest.advanceTimersByTime(10_000); });
    expect(result.current.today).toBe("2026-10-24");
});
