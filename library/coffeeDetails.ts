import type {PodCoffee} from "@/library/podCoffee";

/**
 * What the XPOD section on ABOUT says about a recipe's coffee.
 *
 * Pure and React-free, so the decisions the section makes can be tested as
 * decisions: which fields are worth a row, in which order, and how a height, a
 * score and a date are written. The component only draws what this returns.
 *
 * Every row is optional. A coffee arrives from an xPod, from an import link or
 * from a backup, and none of them fills every field, so a field with nothing
 * in it is left out rather than drawn as an empty row.
 */

/** One label and value pair. */
export type CoffeeDetailRow = {
    /** Stable key, the `PodCoffee` field the row reads. */
    field: keyof PodCoffee;
    /** Doto caption, upper case. */
    label: string;
    /** What a screen reader says in place of the caption. */
    spokenLabel: string;
    value: string;
    detail?: string;
};

export type CoffeeDetails = {
    /**
     * The coffee's name, only when it is not the pod name XPOD already shows.
     */
    name?: string;
    /** Rows in reading order, grouped: roaster, origin, bean, roast, cup. */
    groups: CoffeeDetailRow[][];
    /** The producer's longer text, if any. */
    note?: string;
    /** The coffee's own page, when it is not the recipe page FROM links to. */
    url?: string;
};

/**
 * A note longer than this is folded behind a control.
 *
 * A pod's `introduce` can run to several hundred words, which on a phone is a
 * screen of prose between the pod and FROM. Short notes are cheaper to show
 * than to hide, so they are drawn as they are.
 */
export const NOTE_INLINE_MAX = 200;

/** Case and spacing folded, so "Ethiopia  guji" and "ethiopia Guji" agree. */
function folded(value: string): string {
    return value.trim().replace(/\s+/g, " ").toLowerCase();
}

/** A trimmed string, or undefined for a blank or missing one. */
function said(value: string | undefined): string | undefined {
    const trimmed = value?.trim() ?? "";
    return trimmed === "" ? undefined : trimmed;
}

/**
 * Whole metres with thousands grouped: `1,730 m`.
 *
 * Grouped by hand rather than through `toLocaleString`, so the result does not
 * depend on the Intl data Hermes was built with, and so it matches the way a
 * bag prints a height (the importer reads `1,730` back for the same reason).
 * The space before the unit follows the app's `18 g`.
 */
export function formatElevation(metres: number): string {
    const whole = String(Math.round(metres));
    return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")} m`;
}

/**
 * A cupping score as written on a card: `86`, `86.5`, `86.25`.
 *
 * Two decimal places at most, with trailing zeros dropped, because a score
 * runs to a quarter point and a float can carry noise past that.
 */
export function formatCuppingPoints(points: number): string {
    return String(Number(points.toFixed(2)));
}

/**
 * The calendar date of a roast, `2026-09-03`, in the form brew dates take.
 *
 * `roastingDate` is ISO 8601 and may carry a time. Only the date part is kept,
 * exactly as the roaster wrote it: converting a timestamp to this phone's time
 * zone could move a roast to the day before, which is not the day on the bag.
 */
export function formatRoastingDate(iso: string): string {
    return iso.slice(0, 10);
}

/** A row, or nothing when the value is blank. */
function row(
    field: keyof PodCoffee, label: string, spokenLabel: string, value: string | undefined
): CoffeeDetailRow[] {
    const shown = said(value);
    return shown === undefined ? [] : [{field, label, spokenLabel, value: shown}];
}

function flavourRow(coffee: PodCoffee): CoffeeDetailRow[] {
    const flavours = coffee.flavours ?? [];
    if (flavours.length === 0) return row("aromatics", "FLAVOUR", "Flavour", coffee.aromatics);
    const value = flavours.join(", ");
    const notes = said(coffee.aromatics);
    const detail = notes !== undefined && folded(notes) !== folded(value) ? notes : undefined;
    return [{field: "aromatics", label: "FLAVOUR", spokenLabel: "Flavour", value,
        ...(detail !== undefined ? {detail} : {})}];
}

/**
 * Empty fields/groups are omitted. Finer country metadata replaces the pod's
 * one-line origin when supplied, so the same place is not drawn twice.
 */
function groupsFor(coffee: PodCoffee): CoffeeDetailRow[][] {
    const country = said(coffee.country);
    const roastingDate = said(coffee.roastingDate);

    const roaster = row("roaster", "ROASTER", "Roaster", coffee.roaster);

    const place = [
        ...row("origin", "ORIGIN", "Origin", country === undefined ? coffee.origin : undefined),
        ...row("country", "COUNTRY", "Country", country),
        ...row("region", "REGION", "Region", coffee.region),
        ...row("farm", "FARM", "Farm", coffee.farm),
        // FARMER, not producer: elsewhere in this app the producer is whoever
        // made the recipe (FROM, the import link, the brew record).
        ...row("farmer", "FARMER", "Farmer", coffee.farmer),
        ...row("elevation", "ELEVATION", "Elevation",
               typeof coffee.elevation === "number" && coffee.elevation > 0
                   ? formatElevation(coffee.elevation)
                   : undefined)
    ];

    const bean = [
        ...row("processing", "PROCESS", "Process", coffee.processing),
        ...row("fermentation", "FERMENT", "Fermentation", coffee.fermentation),
        // The catalogue's word for the same field.
        ...row("variety", "VARIETAL", "Varietal", coffee.variety),
        ...row("beanMix", "TYPE", "Type", coffee.beanMix)
    ];

    const roast = [
        ...row("roast", "ROAST", "Roast", coffee.roast),
        ...row("roastingDate", "ROASTED", "Roasted on",
               roastingDate === undefined ? undefined : formatRoastingDate(roastingDate)),
        // Only a stated yes. "Not decaf" is what everyone assumes already, and
        // `undefined` means the roaster said nothing at all.
        ...row("decaffeinated", "CAFFEINE", "Caffeine",
               coffee.decaffeinated === true ? "Decaf" : undefined)
    ];

    const cup = [
        ...flavourRow(coffee),
        ...row("cupping_points", "SCORE", "Cupping score",
               typeof coffee.cupping_points === "number" && coffee.cupping_points > 0
                   ? `${formatCuppingPoints(coffee.cupping_points)} points`
                   : undefined)
    ];

    return [roaster, place, bean, roast, cup].filter((group) => group.length > 0);
}

/**
 * A URL in the form the URL parser writes it, so `https://Example.com` and
 * `https://example.com/` compare equal. Undefined for anything unparseable.
 */
function normalisedUrl(value: string | undefined): string | undefined {
    const raw = said(value);
    if (raw === undefined) return undefined;
    try {
        return new URL(raw).href;
    } catch {
        return undefined;
    }
}

/**
 * What to draw under the pod, or null when there is nothing to add.
 *
 * `podName` is the name XPOD already shows on the line above. The coffee's
 * name is repeated only when it differs. `recipeUrl` is the page FROM already
 * links to; the coffee's own link is dropped when it is the same page, so one
 * destination never has two buttons.
 *
 * Null for a recipe without a coffee, and for one whose coffee carries nothing
 * beyond the pod name. Nothing is better than a block that only repeats it.
 */
export function coffeeDetails(
    coffee: PodCoffee | undefined,
    {podName, recipeUrl}: {podName: string; recipeUrl?: string}
): CoffeeDetails | null {
    if (coffee === undefined) return null;

    const groups = groupsFor(coffee);
    const note = said(coffee.note);
    const coffeeUrl = said(coffee.url);
    const sameAsRecipe = coffeeUrl !== undefined &&
        normalisedUrl(coffeeUrl) !== undefined &&
        normalisedUrl(coffeeUrl) === normalisedUrl(recipeUrl);
    const url = coffeeUrl !== undefined && !sameAsRecipe ? coffeeUrl : undefined;

    const name = said(coffee.name);
    const newName = name !== undefined && folded(name) !== folded(podName) ? name : undefined;

    if (groups.length === 0 && note === undefined && url === undefined && newName === undefined) {
        return null;
    }

    const details: CoffeeDetails = {groups};
    if (newName !== undefined) details.name = newName;
    if (note !== undefined) details.note = note;
    if (url !== undefined) details.url = url;
    return details;
}
