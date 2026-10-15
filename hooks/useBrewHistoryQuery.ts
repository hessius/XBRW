import {useState} from "react";

import {useSetting} from "@/hooks/useSetting";
import {
    asHistorySort, asHistorySortDirection,
    type HistoryQuery, type HistorySort, type HistorySortDirection
} from "@/library/brew/historyQuery";
import type {Settings} from "@/library/Settings";

/** Sort preferences survive visits; the two independent narrowings do not. */
export function useBrewHistoryQuery(recipeUuid?: string, settings?: Settings) {
    const [sortRaw, setSort] = useSetting("brewHistorySort", settings);
    const [directionRaw, setDirection] = useSetting("brewHistorySortDirection", settings);
    const [hideUnsuccessful, setHideUnsuccessful] = useState(false);
    const [ratedOnly, setRatedOnly] = useState(false);
    const query: HistoryQuery = {
        sort: asHistorySort(sortRaw),
        direction: asHistorySortDirection(directionRaw),
        hideUnsuccessful, ratedOnly, recipeUuid
    };

    function onSortChange(sort: HistorySort, direction: HistorySortDirection) {
        setSort(sort);
        setDirection(direction);
    }

    function clearFilters() {
        setHideUnsuccessful(false);
        setRatedOnly(false);
    }

    return {
        query, onSortChange, clearFilters,
        toggleHideUnsuccessful: () => setHideUnsuccessful((current) => !current),
        toggleRatedOnly: () => setRatedOnly((current) => !current)
    };
}
