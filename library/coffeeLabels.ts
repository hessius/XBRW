/**
 * A coffee's short labels from outside the app: its `flavours` ("Dark
 * Chocolate", "Blueberry") and its `tags` ("Berry", "Filter").
 *
 * Both arrive from a roaster feed (a JSON array) or an import link's
 * `bean.flavours` / `bean.tags` (comma separated), so one reader takes
 * either. Untrusted, so every label is trimmed and capped and the list is
 * capped too: a label too long to be a label is dropped, not cut.
 */

/** Most labels kept from one list. */
export const MAX_LABELS = 12;
/** Longest label kept, the same cap a recipe tag has. */
export const MAX_LABEL = 32;
/** A link parameter longer than this is not a short list. */
export const MAX_LABEL_PARAM = 500;

/** Case and spacing folded, for spotting the same label twice. */
function key(label: string): string {
    return label.trim().replace(/\s+/g, " ").toLowerCase();
}

/** Labels from an array or a comma separated string, trimmed, capped, de-duplicated. */
export function readLabels(value: unknown): string[] {
    const parts = typeof value === "string"
        ? (value.length <= MAX_LABEL_PARAM ? value.split(",") : [])
        : Array.isArray(value) ? value : [];
    const seen = new Set<string>();
    const kept: string[] = [];
    for (const part of parts) {
        if (typeof part !== "string") continue;
        const label = part.trim().replace(/\s+/g, " ");
        if (label === "" || label.length > MAX_LABEL || seen.has(key(label))) continue;
        seen.add(key(label));
        kept.push(label);
        if (kept.length === MAX_LABELS) break;
    }
    return kept;
}
