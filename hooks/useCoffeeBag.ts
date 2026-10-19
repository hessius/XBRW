import {useEffect, useState} from "react";

import {sharedBagDatabase, type StoredBagReading} from "@/library/CoffeeBagDatabase";
import type {CoffeeBag} from "@/library/coffeeBag";

/** The part of `CoffeeBagDatabase` the editor needs. Injected by tests. */
export type BagStore = {
    openFor: (recipeUuid: string) => StoredBagReading | null;
    save: (bag: CoffeeBag, now?: number) => void;
    finish: (id: string, now?: number) => void;
    remove: (id: string) => void;
};

/**
 * One recipe's open bag, read synchronously and re-read whenever the screen
 * regains focus.
 *
 * Focus matters here in a way it does not for the brew summary: the editor
 * stays mounted under the brew screen it opens, and the brew it comes back
 * from has just taken a dose out of the bag.
 *
 * The reading is stored with the uuid it was taken for and discarded at
 * render when they disagree, the pattern `useBeanProfile` uses, so a swapped
 * recipe never shows the last one's bag.
 *
 * @param onFocus subscribes to the screen's focus, as
 *   `(listener) => navigation.addListener("focus", listener)`, and returns the
 *   unsubscribe. Passed in rather than read from the router so the hook has no
 *   navigation dependency of its own.
 */
export function useCoffeeBag(
    recipeUuid: string,
    onFocus?: (listener: () => void) => () => void,
    store?: BagStore
) {
    const database = (): BagStore => store ?? sharedBagDatabase();
    // A bag table that cannot be read costs the BAG section its bag and
    // nothing else: the editor must still open the recipe.
    const read = (): StoredBagReading | null => {
        if (recipeUuid === "") return null;
        try {
            return database().openFor(recipeUuid);
        } catch {
            return null;
        }
    };

    const [held, setHeld] = useState<{uuid: string; value: StoredBagReading | null}>(
        () => ({uuid: recipeUuid, value: read()})
    );
    const current = held.uuid === recipeUuid ? held : {uuid: recipeUuid, value: read()};
    if (current !== held) setHeld(current);

    function refresh(): void {
        setHeld({uuid: recipeUuid, value: read()});
    }

    useEffect(() => {
        if (onFocus === undefined) return;
        return onFocus(() => {
            setHeld({uuid: recipeUuid, value: read()});
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [recipeUuid, onFocus]);

    function save(bag: CoffeeBag): void {
        database().save(bag);
        refresh();
    }

    function finish(): void {
        if (current.value === null) return;
        database().finish(current.value.bag.id);
        refresh();
    }

    function remove(): void {
        if (current.value === null) return;
        database().remove(current.value.bag.id);
        refresh();
    }

    return {stored: current.value, save, finish, remove, refresh};
}

export default useCoffeeBag;
