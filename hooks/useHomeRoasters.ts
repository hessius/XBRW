import {useState} from "react";

import {useSetting} from "@/hooks/useSetting";
import {
    browsable, homeCatalogues, homeStrip, searchRoasters, stripRows, type RoasterMatch
} from "@/library/roasterHome";
import type {Settings} from "@/library/Settings";

/**
 * The subscribed roasters, as the home screen uses them.
 *
 * Subscribed to the three settings a sync or a visit rewrites, so the strip's
 * counts and the search follow them without a remount. Everything else is
 * `library/roasterHome.ts`. With no subscriptions `subscribed` is false and
 * every list is empty, which is how the home screen stays exactly as it was
 * for somebody who never opened a roaster's link.
 */
export function useHomeRoasters(settings?: Settings, now?: () => number) {
    const [subs] = useSetting("roasterSubscriptions", settings);
    const [catalogue] = useSetting("roasterCatalogue", settings);
    const [alerts] = useSetting("roasterAlerts", settings);
    // Off hides the strip and the empty library's button. The search still
    // looks through the roasters: it shows them only when somebody types.
    const [shown] = useSetting("showRoastersOnHome", settings);
    // Read once, as the ROASTERS list does: the only clock-dependent words
    // are a failing feed's "Updated 3 d ago", which minutes do not change.
    const [at] = useState(() => (now ?? Date.now)());
    const catalogues = homeCatalogues(subs, catalogue);
    return {
        subscribed:    catalogues.length > 0,
        subscriptions: catalogues.map((entry) => entry.sub),
        /** Subscriptions with coffees to show: the empty library's button. */
        browsable:     shown ? browsable(catalogues) : [],
        strip:         shown ? homeStrip(stripRows(catalogues, alerts, at)) : homeStrip([]),
        /** Cached feeds only: safe to call on every settled search term. */
        search:        (term: string): RoasterMatch[] => searchRoasters(catalogues, term)
    };
}
