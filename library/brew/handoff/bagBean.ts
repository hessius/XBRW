import type {CoffeeBag} from "@/library/coffeeBag";
import type {PodCoffee} from "@/library/podCoffee";

import {beanNameFromRecipe} from "./beanName";
import type {ShareBean} from "./beanLink";

type RecipeLike = {
    coffee?: PodCoffee;
    recipeUrl?: string;
    displayName: () => string;
};

/**
 * The bean name Beanconqueror will see on this recipe's brews.
 *
 * Beanconqueror links a handed-over brew to a bean by name, so a bag sent
 * under any other name would sit there untouched while the brews went to a
 * different bean. This mirrors `beanFor` in `envelope.ts` exactly: a pod's
 * coffee name always wins, because the brew handoff sends the pod's coffee
 * whatever is typed; otherwise the same guess from the recipe name the brew
 * handoff falls back to, which reads the recorder's snapshot of
 * `displayName()`.
 *
 * Only when that guess finds nothing does it fall back to the whole display
 * name, so the field is never blank. The sheet shows the name so it can be
 * confirmed, and the bag keeps whatever was confirmed for the brew handoff to
 * offer later (`handoffBeanName`).
 */
export function bagBeanName(recipe: RecipeLike): string {
    if (recipe.coffee !== undefined) return recipe.coffee.name;
    const display = recipe.displayName();
    return beanNameFromRecipe(display) ?? display.trim();
}

/** Whether the name is fixed by the pod, so the sheet shows it read-only. */
export function bagBeanNameFixed(recipe: Pick<RecipeLike, "coffee">): boolean {
    return recipe.coffee !== undefined;
}

/**
 * The name the brew handoff should use for this recipe, when a bag says.
 *
 * Undefined means carry on as before (the recipe-name guess). Used by the
 * bean name sheet on the brew and record screens, as its suggestion and as
 * what SKIP sends, so a brew lands on the bean the bag was sent as.
 */
export function handoffBeanName(bag: Pick<CoffeeBag, "beanName"> | null | undefined): string | undefined {
    const name = bag?.beanName?.trim();
    return name === undefined || name === "" ? undefined : name;
}

/** The bean to hand to Beanconqueror for a bag, carrying what the pod knows. */
export function bagShareBean(recipe: RecipeLike, bag: CoffeeBag, name: string): ShareBean {
    const coffee = recipe.coffee;
    const url = coffee?.url ?? recipe.recipeUrl;
    return {
        name,
        buyDate: bag.boughtOn,
        ...(bag.roastedOn !== undefined ? {roastingDate: bag.roastedOn} : {}),
        weight: bag.sizeGrams,
        ...(bag.price !== undefined ? {cost: bag.price} : {}),
        ...(coffee?.roaster !== undefined ? {roaster: coffee.roaster} : {}),
        ...(url !== undefined ? {url} : {}),
        ...(coffee?.country ?? coffee?.origin ? {country: coffee?.country ?? coffee?.origin} : {}),
        ...(coffee?.region !== undefined ? {region: coffee.region} : {}),
        ...(coffee?.farm !== undefined ? {farm: coffee.farm} : {}),
        ...(coffee?.farmer !== undefined ? {farmer: coffee.farmer} : {}),
        ...(typeof coffee?.elevation === "number" ? {elevation: String(coffee.elevation)} : {}),
        ...(coffee?.variety !== undefined ? {variety: coffee.variety} : {}),
        ...(coffee?.processing !== undefined ? {processing: coffee.processing} : {})
    };
}
