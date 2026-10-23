import type {CoffeeBag} from "@/library/coffeeBag";
import Recipe from "@/library/Recipe";

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
