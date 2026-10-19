import {bagBeanName, bagShareBean} from "@/library/brew/handoff/bagBean";
import {beanLink} from "@/library/brew/handoff/beanLink";
import {newBag, type BagTracker, type CoffeeBag} from "@/library/coffeeBag";
import type Recipe from "@/library/Recipe";
import {bagChoices, variantForGrams} from "@/library/roasterBuy";
import type {FeedCoffee} from "@/library/roasterFeed";

/** What the bag form hands back, the part a new bag is made from. */
export type CatalogueBagInput = {
    sizeGrams: number;
    roastedOn?: string;
    price?: number;
    beanName?: string;
    figures?: Partial<Pick<CoffeeBag, "restDays" | "peakDay" | "bestUntilDay">>;
};

/**
 * The bag a catalogue coffee was shelved with, made the way the editor makes
 * one: the same `newBag`, and in Beanconqueror mode the same bean name, so the
 * brews sent later land on it.
 */
export function catalogueBag(
    recipe: Recipe, input: CatalogueBagInput, tracker: BagTracker, now: number = Date.now()
): CoffeeBag {
    return newBag(recipe.uuid, {
        sizeGrams: input.sizeGrams,
        roastedOn: input.roastedOn,
        price: input.price,
        ...input.figures,
        beanName: tracker === "beanconqueror" ? (input.beanName ?? bagBeanName(recipe)) : undefined
    }, now);
}

/** The Beanconqueror link that adds the bag there, as the editor sends it. */
export function beanconquerorBagLink(recipe: Recipe, bag: CoffeeBag): string {
    return beanLink(bagShareBean(recipe, bag, bag.beanName ?? bagBeanName(recipe)));
}

/** The bag form's sizes, first size and prices for a catalogue coffee. */
export function bagFormFor(coffee: FeedCoffee): {
    sizes: number[];
    suggestedSize?: number;
    priceFor: (grams: number) => number | undefined;
} {
    const sizes = bagChoices(coffee);
    const onSale = sizes.find((grams) => variantForGrams(coffee, grams)?.available) ?? sizes[0];
    return {
        sizes,
        ...(onSale !== undefined ? {suggestedSize: onSale} : {}),
        priceFor: (grams) => variantForGrams(coffee, grams)?.price
    };
}
