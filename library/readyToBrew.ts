import {bagEligible} from "@/library/bagRun";
import type {SelectedBagRecipe} from "@/library/CoffeeBagDatabase";
import {freshnessBadge, spokenFreshness, type FreshnessReading} from "@/library/restPeak";

export type ReadyEntry = SelectedBagRecipe & {freshness: FreshnessReading | null};
export type BagBadge = {label: string; spoken: string};

export function readyToBrew(entries: readonly ReadyEntry[]): ReadyEntry[] {
    const onePerBag = new Map<string, ReadyEntry>();
    for (const entry of entries) {
        if (!bagEligible(entry.recipe) || entry.bag.finishedAt !== undefined
            || entry.freshness?.state === "resting"
            || (entry.balance.kind === "estimate" && entry.balance.empty)) continue;
        const old = onePerBag.get(entry.bag.id);
        if (old === undefined || entry.selectedAt > old.selectedAt
            || (entry.selectedAt === old.selectedAt && entry.recipe.uuid < old.recipe.uuid)) {
            onePerBag.set(entry.bag.id, entry);
        }
    }
    const rank = (entry: ReadyEntry) =>
        entry.freshness?.state === "peak" ? 0 : entry.freshness?.state === "ready" ? 1 : 2;
    return [...onePerBag.values()].sort((a, b) => rank(a) - rank(b)
        || b.selectedAt - a.selectedAt
        || (a.bag.id < b.bag.id ? -1 : a.bag.id > b.bag.id ? 1 : 0));
}

export function selectedBagBadge(entry: ReadyEntry): BagBadge | undefined {
    if (!bagEligible(entry.recipe) || entry.bag.finishedAt !== undefined) return undefined;
    const labels: string[] = [];
    const descriptions = [`Bag ${entry.bag.name}`];
    if (entry.freshness !== null) {
        labels.push(freshnessBadge(entry.freshness.state));
        descriptions.push(spokenFreshness(entry.freshness.state));
    }
    if (entry.balance.kind === "needsCheck") {
        labels.push("CHECK BAG");
        descriptions.push("check the remaining quantity");
    } else if (entry.balance.kind === "estimate" && entry.balance.low) {
        labels.push(entry.balance.empty ? "EMPTY" : "LOW");
        descriptions.push(entry.balance.empty ? "bag is empty" : "bag is running low");
    }
    return labels.length ? {label: labels.join(" · "), spoken: descriptions.join(", ")} : undefined;
}
