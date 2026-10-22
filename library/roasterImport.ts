import type {RoasterSubscription} from "@/library/roasterSubscription";

export const IMPORT_ROASTER_LIMIT = 3;

/** Explicit choices only, in selection order; legacy extra pins remain stored. */
export function selectedImportRoasters(
    subscriptions: readonly RoasterSubscription[]
): RoasterSubscription[] {
    return subscriptions.filter((sub) => sub.pinnedAt !== undefined && sub.pinnedAt > 0)
        .sort((a, b) => a.pinnedAt! - b.pinnedAt!)
        .slice(0, IMPORT_ROASTER_LIMIT);
}
