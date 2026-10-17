import type {PodCoffee} from "@/library/podCoffee";

/**
 * What the ABOUT deck says about a recipe's coffee.
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
};

export type CoffeeDetails = {
    /**
     * The coffee's name, only when nothing else on the screen already says it.
     * An xPod's coffee is usually the pod, and the XPOD section names the pod.
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

/**
 * The rows for a coffee, in groups, with empty fields and empty groups gone.
 *
 * `origin` is the pod's own one-line origin. It is kept beside the finer
 * country, region and farm, but dropped when it says no more than the country.
 */
function groupsFor(coffee: PodCoffee): CoffeeDetailRow[][] {
    const country = said(coffee.country);
    const origin = said(coffee.origin);
    const roastingDate = said(coffee.roastingDate);
    const originAddsSomething = origin !== undefined &&
        (country === undefined || folded(origin) !== folded(country));

    const roaster = row("roaster", "ROASTER", "Roaster", coffee.roaster);

    const place = [
        ...row("origin", "ORIGIN", "Origin", originAddsSomething ? origin : undefined),
        ...row("country", "COUNTRY", "Country", country),
        ...row("region", "REGION", "Region", coffee.region),
        ...row("farm", "FARM", "Farm", coffee.farm),
        ...row("farmer", "PRODUCER", "Producer", coffee.farmer),
        ...row("elevation", "ELEVATION", "Elevation",
               typeof coffee.elevation === "number" && coffee.elevation > 0
                   ? formatElevation(coffee.elevation)
                   : undefined)
    ];

    const bean = [
        ...row("processing", "PROCESS", "Process", coffee.processing),
        ...row("fermentation", "FERMENT", "Fermentation", coffee.fermentation),
        ...row("variety", "VARIETY", "Variety", coffee.variety),
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
        ...row("aromatics", "FLAVOUR", "Tasting notes", coffee.aromatics),
        ...row("cupping_points", "SCORE", "Cupping score",
               typeof coffee.cupping_points === "number" && coffee.cupping_points > 0
                   ? `${formatCuppingPoints(coffee.cupping_points)} points`
                   : undefined)
    ];

    return [roaster, place, bean, roast, cup].filter((group) => group.length > 0);
}

/**
 * What the section should draw, or null when it should not be drawn at all.
 *
 * `shownNames` are the names already on screen for this recipe: the pod name
 * in XPOD and the title in the header. The coffee's name is repeated only when
 * it matches neither. `recipeUrl` is the page FROM already links to; the
 * coffee's own link is dropped when it is the same page, so one destination
 * never has two buttons.
 *
 * Null for a recipe without a coffee, and for one whose coffee carries nothing
 * beyond a name the screen already shows. An empty heading is worse than none.
 */
export function coffeeDetails(
    coffee: PodCoffee | undefined,
    {shownNames, recipeUrl}: {shownNames: readonly string[]; recipeUrl?: string}
): CoffeeDetails | null {
    if (coffee === undefined) return null;

    const groups = groupsFor(coffee);
    const note = said(coffee.note);
    const coffeeUrl = said(coffee.url);
    const url = coffeeUrl !== undefined && coffeeUrl !== said(recipeUrl) ? coffeeUrl : undefined;

    const name = said(coffee.name);
    const alreadyShown = name !== undefined && shownNames.some(
        (shown) => said(shown) !== undefined && folded(shown) === folded(name)
    );
    const newName = alreadyShown ? undefined : name;

    if (groups.length === 0 && note === undefined && url === undefined && newName === undefined) {
        return null;
    }

    const details: CoffeeDetails = {groups};
    if (newName !== undefined) details.name = newName;
    if (note !== undefined) details.note = note;
    if (url !== undefined) details.url = url;
    return details;
}
