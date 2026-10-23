import {BAG_BEAN_NAME_MAX, type CoffeeBag} from "@/library/coffeeBag";
import type {BagRunSnapshot} from "@/library/bagRun";
import {httpsUrl, type PodCoffee} from "@/library/podCoffee";
import type {ShareBean} from "./beanLink";

type RecipeLike = {
    coffee?: PodCoffee;
    recipeUrl?: string;
    displayName: () => string;
};

export function bagBeanName(bag: Pick<CoffeeBag, "beanName" | "name">): string {
    return bag.beanName?.trim() || bag.name.trim().slice(0, BAG_BEAN_NAME_MAX);
}

export function handoffBeanName(snapshot: Pick<BagRunSnapshot, "beanName"> | null | undefined): string | undefined {
    return snapshot?.beanName?.trim() || undefined;
}

export function bagShareBean(recipe: RecipeLike, bag: CoffeeBag, name: string): ShareBean {
    const coffee = recipe.coffee;
    const url = httpsUrl(coffee?.url) ?? httpsUrl(recipe.recipeUrl);
    return {
        name, buyDate: bag.boughtOn, weight: bag.sizeGrams,
        ...(bag.roastedOn !== undefined ? {roastingDate: bag.roastedOn} : {}),
        ...(bag.price !== undefined ? {cost: bag.price} : {}),
        ...(coffee?.roaster !== undefined ? {roaster: coffee.roaster} : {}),
        ...(url ? {url} : {}),
        ...(coffee?.country ?? coffee?.origin ? {country: coffee?.country ?? coffee?.origin} : {}),
        ...(coffee?.region !== undefined ? {region: coffee.region} : {}),
        ...(coffee?.farm !== undefined ? {farm: coffee.farm} : {}),
        ...(coffee?.farmer !== undefined ? {farmer: coffee.farmer} : {}),
        ...(typeof coffee?.elevation === "number" ? {elevation: String(coffee.elevation)} : {}),
        ...(coffee?.variety !== undefined ? {variety: coffee.variety} : {}),
        ...(coffee?.processing !== undefined ? {processing: coffee.processing} : {})
    };
}
