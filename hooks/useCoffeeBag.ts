import {useSyncExternalStore} from "react";
import {
    bagRevision, subscribeBagChanges, sharedBagDatabase, type default as CoffeeBagDatabase
} from "@/library/CoffeeBagDatabase";
import {bagEligible} from "@/library/bagRun";
import type {BagBalance, BagTracker, CoffeeBag} from "@/library/coffeeBag";
import type Recipe from "@/library/Recipe";

export const noBagSubscription = () => () => {};
export const disabledBagRevision = () => 0;
export type BagReadProblem = {status: "off"} | {status: "error"; message: string};
export type CoffeeBagReading = BagReadProblem | {
    status: "ready"; store: CoffeeBagDatabase; saved: boolean;
    linked: CoffeeBag[]; all: CoffeeBag[]; selected: CoffeeBag | null; balance: BagBalance | null;
    warning?: string;
};

function read(
    recipe: Recipe | null, enabled: boolean, tracker: BagTracker,
    open: () => CoffeeBagDatabase, revision: number
): CoffeeBagReading {
    void revision;
    if (!enabled || recipe === null || !bagEligible(recipe)) return {status: "off"};
    try {
        const store = open();
        const saved = store.hasRecipe(recipe.uuid);
        const all = store.all();
        const linked = saved ? store.linked(recipe.uuid) : [];
        const choice = saved ? store.selection(recipe.uuid) : null;
        const selected = choice?.bagId == null ? null : linked.find(bag => bag.id === choice.bagId);
        if (selected === undefined || selected?.finishedAt !== undefined) {
            throw new Error("The saved bag selection is no longer available.");
        }
        return {
            status: "ready", store, saved, all, linked, selected,
            balance: selected === null ? null : store.balance(selected.id, recipe.dosage, tracker),
            ...(store.migration.unreadable ? {warning: "Some old bag data needs attention. Keep this device's database."} : {})
        };
    } catch (error) {
        console.warn("Could not read coffee bags.", error);
        return {status: "error", message: "Your coffee bags could not be read. You can still brew without tracking."};
    }
}

export function useCoffeeBag(
    recipe: Recipe | null, enabled: boolean, tracker: BagTracker, open = sharedBagDatabase
): CoffeeBagReading {
    "use no memo";
    // The editor mutates Recipe in place, including the dose used by this reading.
    const revision = useSyncExternalStore(
        enabled ? subscribeBagChanges : noBagSubscription,
        enabled ? bagRevision : disabledBagRevision
    );
    return read(recipe, enabled, tracker, open, revision);
}
