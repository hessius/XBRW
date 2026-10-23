import type {CoffeeBag} from "@/library/coffeeBag";
import Recipe from "@/library/Recipe";
import type {BagRunSnapshot} from "@/library/bagRun";
import type {BrewRecord} from "@/library/brew/BrewRecord";

export const BAG_NOW = 1_792_756_800_000;

export function bagFixture(changes: Partial<CoffeeBag> = {}): CoffeeBag {
    return {
        id: "bag-a", name: "Colombia, roasted 12 Oct", sizeGrams: 250,
        boughtOn: "2026-10-23", roastedOn: "2026-10-12", addedAt: BAG_NOW,
        ...changes
    };
}

export function bagRecipe(uuid = "recipe-a"): Recipe {
    const recipe = new Recipe();
    recipe.uuid = uuid;
    recipe.name = `Coffee ${uuid}`;
    recipe.dosage = 18;
    recipe.ratio = 16;
    return recipe;
}

export function bagRunFixture(changes: Partial<BagRunSnapshot> = {}): BagRunSnapshot {
    return {
        runId: "run-a", bagId: "bag-a", bagName: "Colombia Oct 12",
        recipeUuid: "a", dose: 18, tracker: "xbrw", acceptedAt: BAG_NOW,
        ...changes
    };
}

export function bagBrewFixture(changes: Partial<BrewRecord> = {}): BrewRecord {
    return {
        id: "brew-a", recipeUuid: "a", recipeName: "Colombia", accent: "#C86A3B",
        startedAt: BAG_NOW, endedAt: BAG_NOW + 60_000, outcome: "done", failure: null,
        pours: 1, waterTotal: 288, cupTotal: 280, heldSeconds: 0,
        ...changes
    };
}
