import {
    bagEligible, bagEventForPhase, bagRunParam, captureBagRun, parseBagRunRequest
} from "@/library/bagRun";
import {bagFixture, bagRecipe} from "@/test-utils/bags";
import Pour from "@/library/Pour";

describe("transient bag requests", () => {
    it("distinguishes a saved selection from explicit No bag", () => {
        expect(parseBagRunRequest(undefined)).toEqual({kind: "saved"});
        expect(parseBagRunRequest("null")).toEqual({kind: "explicit", bagId: null});
    });
    it.each(["bag-a", "café", "a\"b\\c"])("round trips opaque ID %s", bagId => {
        expect(parseBagRunRequest(bagRunParam(bagId))).toEqual({kind: "explicit", bagId});
    });
    it.each(["", "{", "true", "[]", "{}", "\"\"", `"${"a".repeat(651)}"`])(
        "rejects invalid route input %s", raw => {
            expect(parseBagRunRequest(raw)).toMatchObject({kind: "invalid"});
        }
    );
});

function context() {
    const recipe = bagRecipe("a");
    recipe.pours = [new Pour(1, 288, 93, 40, 0, 0, 0)];
    const bag = bagFixture({beanName: "External identity"});
    const store = {
        get: jest.fn(() => bag),
        linked: jest.fn(() => [bag]),
        selection: jest.fn(() => ({recipeUuid: "a", bagId: "bag-a", selectedAt: 1})),
        select: jest.fn()
    };
    return {
        recipe, store,
        options: {enabled: true, tracker: "xbrw" as const, acceptedAt: 100, runId: "run-a",
            store: () => store}
    };
}

describe("accepted owner attribution", () => {
    it("copies identity, intended dose and tracker without mutating the recipe", () => {
        const {recipe, store, options} = context();
        recipe.dosage = 21;
        const canonical = JSON.stringify(recipe);
        const captured = captureBagRun(recipe, {kind: "saved"}, options);
        expect(captured).toEqual({kind: "tracked", snapshot: {
            runId: "run-a", recipeUuid: "a", bagId: "bag-a", bagName: bagFixture().name,
            dose: 21, tracker: "xbrw", acceptedAt: 100, beanName: "External identity"
        }});
        store.get().name = "Renamed afterwards";
        expect(captured).toMatchObject({snapshot: {bagName: bagFixture().name}});
        expect(JSON.stringify(recipe)).toBe(canonical);
        expect(store.select).not.toHaveBeenCalled();
    });
    it("does no bag reads when off or explicitly untracked", () => {
        const {recipe, options} = context();
        const store = jest.fn(options.store);
        expect(captureBagRun(recipe, {kind: "saved"}, {...options, enabled: false, store}))
            .toEqual({kind: "untracked"});
        expect(captureBagRun(recipe, {kind: "explicit", bagId: null}, {...options, store}))
            .toEqual({kind: "untracked"});
        expect(store).not.toHaveBeenCalled();
    });
    it("requires coffee, a positive dose and stages, not an enabled grinder", () => {
        const {recipe} = context();
        recipe.grinder = false;
        expect(bagEligible(recipe)).toBe(true);
        recipe.dosage = 0;
        expect(bagEligible(recipe)).toBe(false);
        recipe.dosage = 18;
        recipe.pours = [];
        expect(bagEligible(recipe)).toBe(false);
        recipe.pours = [new Pour(1, 90, 93, 40, 0, 0, 0)];
        recipe.cupType = 3;
        expect(recipe.isTea()).toBe(true);
        expect(bagEligible(recipe)).toBe(false);
    });
    it("does not replace an unlinked transient request with the saved bag", () => {
        const {recipe, store, options} = context();
        expect(captureBagRun(recipe, {kind: "explicit", bagId: "bag-b"}, options))
            .toMatchObject({kind: "unavailable"});
        expect(store.select).not.toHaveBeenCalled();
        expect(store.selection).not.toHaveBeenCalled();
    });
    it("clears a positively known unavailable saved choice, not an unrelated preference", () => {
        const {recipe, store, options} = context();
        store.get().finishedAt = 99;
        expect(captureBagRun(recipe, {kind: "saved"}, options))
            .toMatchObject({kind: "unavailable"});
        expect(store.select).toHaveBeenCalledWith("a", null, 100);
    });
    it("warns on malformed requests and read failures without changing machine inputs", () => {
        const {recipe, store, options} = context();
        expect(captureBagRun(recipe, parseBagRunRequest("{}"), options))
            .toMatchObject({kind: "unavailable"});
        const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
        store.get.mockImplementation(() => { throw new Error("disk unavailable"); });
        expect(captureBagRun(recipe, {kind: "saved"}, options))
            .toMatchObject({kind: "unavailable"});
        expect(store.select).not.toHaveBeenCalled();
        expect(warn).toHaveBeenCalled();
        warn.mockRestore();
    });
});

describe("existing phase accounting bridge", () => {
    it("keeps upload waiting and bypass nonterminal, and unwraps a paused pour", () => {
        expect(bagEventForPhase({name: "armed"})).toBeNull();
        expect(bagEventForPhase({name: "bypass"})).toBeNull();
        expect(bagEventForPhase({name: "paused", pour: 1, pours: 1,
            was: {name: "pouring", pour: 1, pours: 1}})).toBe("pouring");
        expect(bagEventForPhase({name: "failed", reason: "blocked", block: "busy"}))
            .toBe("refused");
        expect(bagEventForPhase({name: "lostContact"})).toBe("ended");
    });
});
