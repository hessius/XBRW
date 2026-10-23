import {useState} from "react";
import {useBagLibrary} from "@/hooks/useBagLibrary";
import {useNow} from "@/hooks/useNow";
import {sharedBagDatabase} from "@/library/CoffeeBagDatabase";
import {dayOf, type BagTracker} from "@/library/coffeeBag";
import {freshnessOf, freshnessProblem} from "@/library/restPeak";
import {readyToBrew, selectedBagBadge, type BagBadge} from "@/library/readyToBrew";

export function useBagSuggestions(
    enabled: boolean, tracker: BagTracker, recipeRevision: number, open = sharedBagDatabase
) {
    const reading = useBagLibrary(enabled, tracker, open, recipeRevision);
    const now = useNow(Date.now, enabled && reading.status === "ready");
    const entries = reading.status === "ready" && now !== null
        ? reading.rows.map(row => ({...row, freshness: freshnessOf(row.bag, now)})) : [];
    const candidates = readyToBrew(entries);
    const badges: Record<string, BagBadge> = {};
    for (const entry of entries) {
        if (entry.bag.finishedAt !== undefined) continue;
        const badge = selectedBagBadge(entry);
        if (badge) badges[entry.recipe.uuid] = badge;
    }
    const key = JSON.stringify(candidates.map(entry => [entry.bag.id, entry.recipe.uuid]));
    const [cursor, setCursor] = useState({key, index: 0});
    const index = cursor.key === key ? cursor.index : 0;
    function next() {
        if (candidates.length > 0) setCursor({key, index: (index + 1) % candidates.length});
    }
    const entry = candidates[index] ?? null;
    return {reading, badges, entry, count: candidates.length,
        problem: entry && now !== null ? freshnessProblem(entry.bag, now) : null,
        today: now === null ? null : dayOf(now), next};
}
