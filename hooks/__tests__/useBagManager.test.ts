import {act, cleanup, renderHook} from "@testing-library/react-native";
import {Linking} from "react-native";
import {useBagManager} from "@/hooks/useBagManager";
import CoffeeBagDatabase from "@/library/CoffeeBagDatabase";
import RecipeDatabase from "@/library/RecipeDatabase";
import Pour from "@/library/Pour";
import {bagFixture, bagRecipe, bagRunFixture} from "@/test-utils/bags";
import {createTestDatabase} from "@/test-utils/sqlite";
import {notify} from "@/components/XbrwToast";

jest.mock("@/components/XbrwToast", () => ({notify: jest.fn()}));
let mockDb: ReturnType<typeof createTestDatabase>;
jest.mock("expo-sqlite", () => ({openDatabaseSync: () => mockDb}));
beforeEach(() => { mockDb = createTestDatabase(); jest.clearAllMocks(); jest.useFakeTimers(); });
afterEach(async () => { await cleanup(); jest.restoreAllMocks(); jest.useRealTimers(); });

function fixture(saved = true) {
    const recipe = bagRecipe("a");
    recipe.pours = [new Pour(288)];
    const recipes = new RecipeDatabase();
    if (saved) recipes.insertRecipes([recipe]);
    return {recipe, recipes, store: new CoffeeBagDatabase()};
}

it("opens add-bean only explicitly and saves its confirmed identity after the link opens", async () => {
    const {recipe, store} = fixture();
    store.create(bagFixture());
    const open = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
    const {result} = await renderHook(() => useBagManager(recipe, true, "beanconqueror", () => store));
    await act(async () => { result.current.edit(bagFixture()); });
    expect(open).not.toHaveBeenCalled();
    await act(async () => { await result.current.addBean({
        name: "Physical bag", beanName: "Confirmed second bag", sizeGrams: 250, adviceSource: "estimate"
    }); });
    expect(open).toHaveBeenCalledWith(expect.stringMatching(/^beanconqueror:\/\/ADD_USER_BEAN\?/));
    expect(store.get("bag-a")?.beanName).toBe("Confirmed second bag");
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({message: expect.stringMatching(/Confirm the bag there/)}));
});

it("keeps the form open and does not save an external identity when opening the other app fails", async () => {
    jest.spyOn(console, "warn").mockImplementation(() => {});
    const {recipe, store} = fixture();
    store.create(bagFixture());
    jest.spyOn(Linking, "openURL").mockRejectedValue(new Error("unavailable"));
    const {result} = await renderHook(() => useBagManager(recipe, true, "beanconqueror", () => store));
    await act(async () => { result.current.edit(bagFixture()); });
    await act(async () => { await result.current.addBean({
        name: "Unsaved", beanName: "Unsaved external", sizeGrams: 250, adviceSource: "estimate"
    }); });
    expect(store.get("bag-a")?.beanName).toBeUndefined();
    expect(store.get("bag-a")?.name).toBe(bagFixture().name);
    expect(result.current.panel.kind).toBe("form");
    expect(result.current.beanBusy).toBe(false);
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({tone: "error"}));
});

it("reports that the app opened when its subsequent local save fails, without claiming creation", async () => {
    jest.spyOn(console, "warn").mockImplementation(() => {});
    const {recipe, store} = fixture();
    store.create(bagFixture());
    jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
    jest.spyOn(store, "editAndCorrect").mockImplementation(() => { throw new Error("disk full"); });
    const {result} = await renderHook(() => useBagManager(recipe, true, "beanconqueror", () => store));
    await act(async () => { result.current.edit(bagFixture()); });
    await act(async () => { await result.current.addBean({
        name: "Bag", beanName: "Confirmed", sizeGrams: 250, adviceSource: "estimate"
    }); });
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({
        tone: "error", message: expect.stringMatching(/opened, but the bag could not be saved/)
    }));
    expect(store.get("bag-a")?.beanName).toBeUndefined();
    expect(result.current.panel.kind).toBe("form");
});

it("creates, links and selects a bag without saving unsaved recipe parameters", async () => {
    const {recipe, recipes, store} = fixture();
    recipe.dosage = 17;
    const {result} = await renderHook(() => useBagManager(recipe, true, "xbrw", () => store));
    await act(async () => { result.current.add(); });
    await act(async () => { result.current.save({
        name: "New physical bag", sizeGrams: 250, adviceSource: "estimate"
    }); });
    const selected = store.selection("a")?.bagId;
    expect(selected).toEqual(expect.any(String));
    expect(store.linked("a").map(bag => bag.id)).toEqual([selected]);
    expect(recipes.getRecipe("a")?.dosage).toBe(18);
    expect(result.current.panel.kind).toBe("closed");
});

it("explains the save requirement rather than saving an unsaved recipe implicitly", async () => {
    const {recipe, recipes, store} = fixture(false);
    const {result} = await renderHook(() => useBagManager(recipe, true, "xbrw", () => store));
    await act(async () => { result.current.add(); });
    expect(result.current.panel.kind).toBe("closed");
    expect(recipes.getRecipe("a")).toBeNull();
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({message: expect.stringMatching(/Save this recipe/)}));
});

it("leaves quantity alone when a metadata form was open across a brew", async () => {
    const {recipe, store} = fixture();
    store.create(bagFixture());
    store.select("a", "bag-a", 1);
    const {result} = await renderHook(() => useBagManager(recipe, true, "xbrw", () => store));
    await act(async () => { result.current.edit(bagFixture()); });
    await act(async () => {
        store.beginRun(bagRunFixture());
        store.updateRun("run-a", {consumption: "used", possible: true, closed: true});
    });
    await act(async () => { result.current.save({
        name: "Renamed", sizeGrams: 250, adviceSource: "estimate"
    }); });
    expect(store.balance("bag-a", 18, "xbrw")).toMatchObject({remainingGrams: 232});
    expect(store.get("bag-a")?.name).toBe("Renamed");
});

it("keeps a failed choice open and drops open panels when the experiment is disabled", async () => {
    jest.spyOn(console, "warn").mockImplementation(() => {});
    const {recipe, store} = fixture();
    store.create(bagFixture());
    const {result, rerender} = await renderHook(({enabled}: {enabled: boolean}) =>
        useBagManager(recipe, enabled, "xbrw", () => store), {initialProps: {enabled: true}});
    await act(async () => { result.current.choose(); });
    jest.spyOn(store, "select").mockImplementation(() => { throw new Error("disk full"); });
    await act(async () => { result.current.select("bag-a"); });
    expect(result.current.panel.kind).toBe("picker");
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({tone: "error"}));
    await rerender({enabled: false});
    expect(result.current.covered).toBe(false);
    await rerender({enabled: true});
    expect(result.current.panel.kind).toBe("closed");
});

it("encodes the explicitly selected bag for brewing, and keeps disabled navigation unchanged", async () => {
    const {recipe, store} = fixture();
    store.create(bagFixture());
    store.select("a", "bag-a", 1);
    const {result, rerender} = await renderHook(({enabled}: {enabled: boolean}) =>
        useBagManager(recipe, enabled, "xbrw", () => store), {initialProps: {enabled: true}});
    expect(result.current.paramsFor(recipe)).toEqual({bagSelection: JSON.stringify("bag-a")});
    await act(async () => { store.select("a", null, 2); });
    expect(result.current.paramsFor(recipe)).toEqual({bagSelection: "null"});
    await rerender({enabled: false});
    expect(result.current.paramsFor(recipe)).toEqual({});
});
