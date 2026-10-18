/**
 * A bag of coffee somebody bought for one recipe, and what is left in it.
 *
 * Pure and free of React. Storage is `CoffeeBagDatabase`; this module owns the
 * shape, the arithmetic and the words.
 *
 * Three decisions shape everything below.
 *
 * **The grams left are derived, not stored.** A bag stores the grams it held
 * at one moment (`gramsAtCount` at `countedFrom`). What is left now is that
 * figure minus the dose of every counted brew of the recipe that started at or
 * after that moment, read from the `brews` table at query time. Nothing in the
 * brew path writes to a bag, so a brew can never be counted twice, a restore
 * that brings brews back brings their doses back with them, and a manual
 * correction is simply a new anchor: "there are 120 g left as of now".
 *
 * **Counted means `COUNTED_SQL`**, the population the recipe's brew count
 * already uses (`done` and `endedOnMachine`). A cancelled, failed or
 * lost-contact brew costs nothing here. A brew logged by hand carries no dose
 * (`unobservedBrew` writes none), so it costs nothing either: the app cannot
 * say how much coffee went into a cup it did not watch.
 *
 * **One tracker at a time.** Beanconqueror already tracks a bag and subtracts
 * each brew this app hands it. Two trackers counting one bag drift, so the
 * `bagTracker` setting picks one. In `beanconqueror` mode this app keeps the
 * bag's facts (size, roast date, buy date, price, the bean's name) but draws
 * no grams estimate and no running-low state; the bag was handed to
 * Beanconqueror with `ADD_USER_BEAN` and lives there.
 *
 * `roastedOn` is kept in both modes. It is the one field another feature
 * (rest and peak reminders) is expected to build on, so it has a fixed format
 * and two helpers below rather than being left for each reader to parse.
 * The rest and peak figures it is read against (`restDays`, `peakDay`,
 * `bestUntilDay`) are stored on the bag too; `restPeak.ts` owns what they mean.
 */
import {reviveRoastAdvice, type RoastAdvice} from "@/library/roastAdvice";

/** Where a bag is counted. */
export type BagTracker = "xbrw" | "beanconqueror";

/** The stored setting: `auto` follows the Beanconqueror handoff switch. */
export type BagTrackerSetting = "auto" | BagTracker;

export const BAG_TRACKER_SETTINGS: readonly BagTrackerSetting[] = ["auto", "xbrw", "beanconqueror"];

export function isBagTrackerSetting(value: unknown): value is BagTrackerSetting {
    return typeof value === "string" && (BAG_TRACKER_SETTINGS as readonly string[]).includes(value);
}

/**
 * Which tracker is in charge.
 *
 * `auto` is Beanconqueror exactly when brews are being handed to it, because
 * that is when Beanconqueror is already subtracting doses. Anything else,
 * including an unreadable stored value, is this app.
 */
export function resolveBagTracker(setting: unknown, beanconquerorHandoff: boolean): BagTracker {
    if (setting === "xbrw" || setting === "beanconqueror") return setting;
    return beanconquerorHandoff ? "beanconqueror" : "xbrw";
}

export type CoffeeBag = {
    id: string;
    /** The recipe this bag is for. Brews of this recipe draw it down. */
    recipeUuid: string;
    /** What the bag held when it was bought, in whole grams. */
    sizeGrams: number;
    /**
     * The day the coffee was roasted, as a calendar day `YYYY-MM-DD`.
     *
     * A day and not a timestamp, because that is what a bag label says and
     * what a roaster knows. Read it through `roastedOnDate` / `daysSinceRoast`
     * rather than `new Date(roastedOn)`, which parses a bare date as UTC
     * midnight and is a day out west of Greenwich.
     */
    roastedOn?: string;
    /** The day the bag was bought, `YYYY-MM-DD`. Beanconqueror's `buyDate`. */
    boughtOn: string;
    /** What it cost, in whatever currency the user thinks in. Optional. */
    price?: number;
    /**
     * The bean name this bag was handed to Beanconqueror under.
     *
     * Beanconqueror links a brew to a bean by name, so the brew handoff offers
     * this name for this recipe while the bag is open. Absent when the bag was
     * never sent there.
     */
    beanName?: string;
    /** Epoch ms the bag was added. */
    addedAt: number;
    /** Epoch ms from which brews count against `gramsAtCount`. */
    countedFrom: number;
    /** Grams in the bag at `countedFrom`. The bag size, until a manual correction. */
    gramsAtCount: number;
    /** Epoch ms the bag was marked finished. Absent while it is open. */
    finishedAt?: number;
} & RoastAdvice;

/** Sizes a roaster commonly sells, offered as one-tap choices. */
export const BAG_PRESETS: readonly number[] = [160, 250, 320, 480, 1000];

/** Whole grams. Five kilos is a sack, not a bag, and the cap keeps a typo out. */
export const BAG_GRAMS = {min: 1, max: 5000} as const;

/** A price a person might type. The cap keeps a stray keystroke out. */
export const BAG_PRICE = {min: 0, max: 100000} as const;

/** The bean name field, the same cap the brew handoff's name sheet uses. */
export const BAG_BEAN_NAME_MAX = 40;

export function isBagGrams(value: unknown): value is number {
    return typeof value === "number" && Number.isInteger(value)
        && value >= BAG_GRAMS.min && value <= BAG_GRAMS.max;
}

/**
 * A grams-left figure, which may be nought: an empty bag is a real state.
 */
export function isGramsLeft(value: unknown): value is number {
    return typeof value === "number" && Number.isInteger(value)
        && value >= 0 && value <= BAG_GRAMS.max;
}

export function isBagPrice(value: unknown): value is number {
    return typeof value === "number" && Number.isFinite(value)
        && value >= BAG_PRICE.min && value <= BAG_PRICE.max;
}

const CALENDAR_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * A real calendar day in `YYYY-MM-DD`, or undefined.
 *
 * Stricter than `isoDate` in `podCoffee.ts` on purpose: a bag's dates are
 * typed here or copied from a pod's roast date, and storing exactly one shape
 * means the rest/peak feature never has to wonder about a time or a zone.
 */
export function calendarDay(value: unknown): string | undefined {
    if (typeof value !== "string") return undefined;
    const match = CALENDAR_DAY.exec(value.trim());
    if (match === null) return undefined;
    const [, y, m, d] = match.map(Number);
    const date = new Date(y, m - 1, d);
    if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) {
        return undefined;
    }
    return match[0];
}

/** The local calendar day of an instant, `YYYY-MM-DD`. */
export function dayOf(ms: number): string {
    const date = new Date(ms);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * A pod's roast date, cut to the day it names.
 *
 * `PodCoffee.roastingDate` is any ISO 8601 date and may carry a time, so its
 * first ten characters are the day the roaster wrote down.
 */
export function roastDayFromCoffee(roastingDate: string | undefined): string | undefined {
    return roastingDate === undefined ? undefined : calendarDay(roastingDate.slice(0, 10));
}

/**
 * The roast day as local midnight, or null when the bag has none.
 *
 * The API the rest/peak feature should use for "when was this roasted".
 */
export function roastedOnDate(bag: Pick<CoffeeBag, "roastedOn">): Date | null {
    const day = calendarDay(bag.roastedOn);
    if (day === undefined) return null;
    const [y, m, d] = day.split("-").map(Number);
    return new Date(y, m - 1, d);
}

/**
 * Whole days from the roast day to the day of `now`, or null with no roast day.
 *
 * Counted in calendar days, not 24-hour blocks, so a bag roasted yesterday is
 * one day off roast at any hour today, and a daylight-saving change cannot make
 * it zero or two. Negative for a roast day in the future, which a typo can
 * produce; the caller decides what that means.
 */
export function daysSinceRoast(bag: Pick<CoffeeBag, "roastedOn">, now: number = Date.now()): number | null {
    const roasted = roastedOnDate(bag);
    if (roasted === null) return null;
    const today = new Date(now);
    const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
    const roastUtc = Date.UTC(roasted.getFullYear(), roasted.getMonth(), roasted.getDate());
    return Math.round((todayUtc - roastUtc) / 86_400_000);
}

export function newBagId(): string {
    return `bag-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
}

/** What a person fills in to add a bag. */
export type BagInput = {
    sizeGrams: number;
    roastedOn?: string;
    price?: number;
    beanName?: string;
} & RoastAdvice;

/** A fresh, open bag, counted from now. */
export function newBag(recipeUuid: string, input: BagInput, now: number = Date.now()): CoffeeBag {
    return {
        id: newBagId(),
        recipeUuid,
        sizeGrams: input.sizeGrams,
        ...(input.roastedOn !== undefined ? {roastedOn: input.roastedOn} : {}),
        boughtOn: dayOf(now),
        ...(input.price !== undefined ? {price: input.price} : {}),
        ...(input.beanName !== undefined && input.beanName !== "" ? {beanName: input.beanName} : {}),
        ...reviveRoastAdvice(input),
        addedAt: now,
        countedFrom: now,
        gramsAtCount: input.sizeGrams
    };
}

/**
 * The bag with a person's correction to what is left.
 *
 * A new anchor rather than an offset: "there are 120 g left now" is what they
 * said, and it stays true whatever was brewed before it.
 */
export function withGramsLeft(bag: CoffeeBag, grams: number, now: number = Date.now()): CoffeeBag {
    return {...bag, gramsAtCount: grams, countedFrom: now};
}

/**
 * The bag with a new size, keeping what has been used.
 *
 * Changing the size of a bag already part used (a typo at purchase) moves
 * what is left by the same amount, so the brews already counted stay counted.
 */
export function withSize(bag: CoffeeBag, sizeGrams: number): CoffeeBag {
    const delta = sizeGrams - bag.sizeGrams;
    return {...bag, sizeGrams, gramsAtCount: Math.max(0, bag.gramsAtCount + delta)};
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isInstant(value: unknown): value is number {
    return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

/**
 * A stored or restored bag, or null.
 *
 * The one validator for both doors: the row this app wrote and a backup file
 * somebody may have edited. Rebuilt field by field, so a file carrying extra
 * keys cannot add them. The optional fields cost themselves when malformed,
 * never the bag: a bad price is not a reason to lose a roast date.
 */
export function reviveBag(entry: unknown): CoffeeBag | null {
    if (!isPlainObject(entry)) return null;
    const {id, recipeUuid, sizeGrams, boughtOn, addedAt, countedFrom, gramsAtCount} = entry;
    if (typeof id !== "string" || id === "" || id.length > 100) return null;
    if (typeof recipeUuid !== "string" || recipeUuid === "") return null;
    if (!isBagGrams(sizeGrams) || !isGramsLeft(gramsAtCount)) return null;
    if (!isInstant(addedAt) || !isInstant(countedFrom)) return null;
    const bought = calendarDay(boughtOn) ?? dayOf(addedAt);
    const roastedOn = calendarDay(entry.roastedOn);
    const beanName = typeof entry.beanName === "string"
        ? entry.beanName.trim().slice(0, BAG_BEAN_NAME_MAX) : "";
    return {
        id,
        recipeUuid,
        sizeGrams,
        ...(roastedOn !== undefined ? {roastedOn} : {}),
        boughtOn: bought,
        ...(isBagPrice(entry.price) ? {price: entry.price} : {}),
        ...(beanName !== "" ? {beanName} : {}),
        ...reviveRoastAdvice(entry),
        addedAt,
        countedFrom,
        gramsAtCount,
        ...(isInstant(entry.finishedAt) && entry.finishedAt > 0 ? {finishedAt: entry.finishedAt} : {})
    };
}

/** A bag's state, ready to draw. */
export type BagReading = {
    bag: CoffeeBag;
    /** Grams counted brews have taken since `countedFrom`. */
    usedGrams: number;
    /** What is left, never below nought. */
    remainingGrams: number;
    /** Whole brews of the recipe's current dose left, or null with no usable dose. */
    brewsLeft: number | null;
    /** Fewer than two doses left: offer a reorder. */
    low: boolean;
    /** Not enough left for one more brew: offer to finish the bag. */
    empty: boolean;
};

/**
 * Read a bag against the grams its brews used and the recipe's dose.
 *
 * The dose is the recipe's as it stands, because the question is how many more
 * brews of *this* recipe the bag holds. A recipe whose dose is not set yet
 * gets no brew count and no low/empty verdict: either would be a guess.
 */
export function readBag(bag: CoffeeBag, usedGrams: number, dose: number): BagReading {
    const used = Number.isFinite(usedGrams) && usedGrams > 0 ? usedGrams : 0;
    const remainingGrams = Math.max(0, Math.round(bag.gramsAtCount - used));
    const usableDose = Number.isFinite(dose) && dose > 0;
    return {
        bag,
        usedGrams: used,
        remainingGrams,
        brewsLeft: usableDose ? Math.floor(remainingGrams / dose) : null,
        low: usableDose && remainingGrams < 2 * dose,
        empty: usableDose && remainingGrams < dose
    };
}

/** `212 g left, about 11 brews`, the bag's one line. */
export function remainingLine(reading: BagReading): string {
    const grams = `${reading.remainingGrams} g left`;
    if (reading.brewsLeft === null) return grams;
    if (reading.brewsLeft === 0) return `${grams}, not enough for another brew`;
    return reading.brewsLeft === 1
        ? `${grams}, about 1 brew`
        : `${grams}, about ${reading.brewsLeft} brews`;
}

/** The card and tile badge: grams, or LOW once a reorder is due. Doto. */
export function bagBadge(reading: BagReading): string {
    return reading.low ? "LOW" : `${reading.remainingGrams}G`;
}

/** The badge, said aloud. */
export function spokenBag(reading: BagReading): string {
    return reading.low
        ? `bag running low, ${reading.remainingGrams} grams left`
        : `${reading.remainingGrams} grams of coffee left`;
}

/**
 * Where to buy the coffee again, or undefined when nothing says.
 *
 * The coffee's own link first (`coffee.url`, a pod's or a BrewMind link's
 * `bean.url`), then the producer's page for the recipe (`recipe.url`), which
 * for a roaster's recipe is usually the product page. Both are checked to be
 * https where they arrive (`httpsUrl`), and checked again here because this
 * one is handed to the system browser.
 */
export function reorderUrl(recipe: {coffee?: {url?: string}; recipeUrl?: string}): string | undefined {
    for (const candidate of [recipe.coffee?.url, recipe.recipeUrl]) {
        if (typeof candidate !== "string" || candidate === "") continue;
        try {
            if (new URL(candidate).protocol === "https:") return candidate;
        } catch {
            // Not a URL; try the next.
        }
    }
    return undefined;
}
