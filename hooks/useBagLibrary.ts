import {useSyncExternalStore} from "react";
import {
    bagRevision, subscribeBagChanges, sharedBagDatabase, type default as CoffeeBagDatabase,
    type SelectedBagRecipe
} from "@/library/CoffeeBagDatabase";
import {disabledBagRevision, noBagSubscription, type BagReadProblem} from "@/hooks/useCoffeeBag";
import type {BagTracker} from "@/library/coffeeBag";

export type BagLibraryReading = BagReadProblem | {status: "ready"; rows: SelectedBagRecipe[]};

function read(enabled: boolean, tracker: BagTracker, open: () => CoffeeBagDatabase,
    revision: number, recipeRevision: number): BagLibraryReading {
    void revision;
    void recipeRevision;
    if (!enabled) return {status: "off"};
    try {
        return {status: "ready", rows: open().selectedRecipes(tracker)};
    } catch (error) {
        console.warn("Could not read selected coffee bags.", error);
        return {status: "error", message: "Your coffee bags could not be read. Suggestions are unavailable."};
    }
}

export function useBagLibrary(
    enabled: boolean, tracker: BagTracker, open = sharedBagDatabase, recipeRevision = 0
): BagLibraryReading {
    const revision = useSyncExternalStore(enabled ? subscribeBagChanges : noBagSubscription,
        enabled ? bagRevision : disabledBagRevision);
    return read(enabled, tracker, open, revision, recipeRevision);
}
