import {act, renderHook} from "@testing-library/react-native";
import {useCoffeeBag} from "@/hooks/useCoffeeBag";
import {useBagLibrary} from "@/hooks/useBagLibrary";
import CoffeeBagDatabase from "@/library/CoffeeBagDatabase";
import RecipeDatabase from "@/library/RecipeDatabase";
import Pour from "@/library/Pour";
import {bagFixture, bagRecipe, bagRunFixture} from "@/test-utils/bags";
import {createTestDatabase} from "@/test-utils/sqlite";

let mockDb: ReturnType<typeof createTestDatabase>;
jest.mock("expo-sqlite", () => ({openDatabaseSync: () => mockDb}));
beforeEach(() => { mockDb = createTestDatabase(); });
afterEach(() => { jest.restoreAllMocks(); });

function fixture() {
    const recipe = bagRecipe("a");
    recipe.pours = [new Pour(288)];
    new RecipeDatabase().insertRecipes([recipe]);
    return {recipe, store: new CoffeeBagDatabase()};
}

it("does not open either bag reader when disabled", async () => {
    const {recipe} = fixture();
    const open = jest.fn(() => { throw new Error("must not open"); });
    const {result} = await renderHook(() => ({
        recipe: useCoffeeBag(recipe, false, "xbrw", open),
        library: useBagLibrary(false, "xbrw", open)
    }));
    expect(result.current.recipe.status).toBe("off");
    expect(result.current.library.status).toBe("off");
    expect(open).not.toHaveBeenCalled();
});

it("rereads explicit choices and corrections on the shared revision", async () => {
    const {recipe, store} = fixture();
    store.create(bagFixture());
    const {result} = await renderHook(() => useCoffeeBag(recipe, true, "xbrw", () => store));
    expect(result.current).toMatchObject({status: "ready", saved: true, selected: null});
    await act(async () => { store.select("a", "bag-a", 1); });
    expect(result.current).toMatchObject({
        status: "ready", selected: {id: "bag-a"}, balance: {remainingGrams: 250}
    });
    await act(async () => { store.correct("bag-a", 100); });
    expect(result.current).toMatchObject({balance: {remainingGrams: 100}});
    await act(async () => { store.select("a", null, 2); });
    expect(result.current).toMatchObject({status: "ready", selected: null, balance: null});
});

it("distinguishes storage failure from No bag and an unsaved recipe", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const {recipe, store} = fixture();
    const {result} = await renderHook(() => useCoffeeBag(recipe, true, "xbrw", () => {
        throw new Error("disk unavailable");
    }));
    expect(result.current).toMatchObject({status: "error", message: expect.any(String)});
    expect(warn).toHaveBeenCalled();
    const unsaved = bagRecipe("unsaved");
    unsaved.pours = [new Pour(288)];
    const other = await renderHook(() => useCoffeeBag(unsaved, true, "xbrw", () => store));
    expect(other.result.current).toMatchObject({status: "ready", saved: false});
});

it("reads whole-inventory selected recipes including several choices for one physical bag", async () => {
    const {recipe, store} = fixture();
    const second = bagRecipe("b");
    second.pours = [new Pour(288)];
    new RecipeDatabase().insertRecipes([second]);
    store.create(bagFixture());
    store.select(recipe.uuid, "bag-a", 1);
    store.select(second.uuid, "bag-a", 2);
    const {result} = await renderHook(() => useBagLibrary(true, "xbrw", () => store));
    expect(result.current.status).toBe("ready");
    if (result.current.status !== "ready") throw new Error("Expected an inventory");
    expect(result.current.rows.map(row => row.recipe.uuid)).toEqual(["a", "b"]);
    expect(result.current.rows.map(row => row.balance)).toEqual([
        expect.objectContaining({remainingGrams: 250}), expect.objectContaining({remainingGrams: 250})
    ]);
    await act(async () => { store.select("b", null, 3); });
    expect(result.current.status === "ready" && result.current.rows).toHaveLength(1);
});

it("rolls back metadata when an explicitly requested correction cannot be saved", () => {
    const {store} = fixture();
    store.create(bagFixture());
    jest.spyOn(store, "correct").mockImplementation(() => { throw new Error("disk full"); });
    expect(() => store.editAndCorrect({...bagFixture(), name: "Changed"}, 50)).toThrow("disk full");
    expect(store.get("bag-a")?.name).toBe(bagFixture().name);
});

it("uses the same durable arithmetic for grouped selections and individual balances", () => {
    const {recipe, store} = fixture();
    store.create(bagFixture());
    store.select(recipe.uuid, "bag-a", 1);
    function expectSharedBalance() {
        expect(store.selectedRecipes("xbrw")[0].balance).toEqual(store.balance("bag-a", 18, "xbrw"));
        expect(store.selectedRecipes("beanconqueror")[0].balance).toEqual({kind: "external"});
    }
    store.beginRun(bagRunFixture());
    store.updateRun("run-a", {consumption: "used", possible: true, closed: true});
    expectSharedBalance();
    expect(store.selectedRecipes("xbrw")[0].balance).toMatchObject({remainingGrams: 232});
    store.beginRun(bagRunFixture({runId: "uncertain"}));
    store.updateRun("uncertain", {consumption: "uncertain", possible: true, closed: true});
    expectSharedBalance();
    expect(store.selectedRecipes("xbrw")[0].balance).toEqual({kind: "needsCheck"});
    store.correct("bag-a", 100);
    expectSharedBalance();
    store.beginRun(bagRunFixture({runId: "next"}));
    store.updateRun("next", {consumption: "used", possible: true, closed: true});
    expectSharedBalance();
    expect(store.selectedRecipes("xbrw")[0].balance).toMatchObject({remainingGrams: 82});
});
