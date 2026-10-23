import {
    reviveRoastAdvice, roastAdviceProblem, type AdviceSource
} from "@/library/roastAdvice";
export type {AdviceSource} from "@/library/roastAdvice";

export type BagTracker = "xbrw" | "beanconqueror";
export type BagTrackerSetting = "auto" | BagTracker;
export const BAG_TRACKER_SETTINGS: readonly BagTrackerSetting[] =
    ["auto", "xbrw", "beanconqueror"];

export function isBagTrackerSetting(value: unknown): value is BagTrackerSetting {
    return value === "auto" || value === "xbrw" || value === "beanconqueror";
}

export function resolveBagTracker(setting: unknown, beanconquerorHandoff: boolean): BagTracker {
    if (setting === "xbrw" || setting === "beanconqueror") return setting;
    return beanconquerorHandoff ? "beanconqueror" : "xbrw";
}

export type CoffeeBag = {
    id: string;
    name: string;
    sizeGrams: number;
    boughtOn: string;
    addedAt: number;
    roastedOn?: string;
    price?: number;
    beanName?: string;
    finishedAt?: number;
    restDays?: number;
    peakDay?: number;
    bestUntilDay?: number;
    adviceSource?: AdviceSource;
};

export type BagInput = Omit<CoffeeBag, "id" | "addedAt" | "finishedAt">;

export type BagBalance =
    | {kind: "estimate"; remainingGrams: number; usedGrams: number;
       brewsLeft: number | null; low: boolean; empty: boolean}
    | {kind: "needsCheck"}
    | {kind: "external"};

export const BAG_PRESETS = [160, 250, 320, 480, 1000] as const;
export const BAG_GRAMS = {min: 1, max: 5000} as const;
export const BAG_PRICE = {min: 0, max: 100000} as const;
export const BAG_NAME_MAX = 160;
export const BAG_BEAN_NAME_MAX = 40;

export function isBagId(value: unknown): value is string {
    return typeof value === "string" && value.trim().length > 0 && value.length <= 100;
}

export function isBagRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isBagGrams(value: unknown): value is number {
    return typeof value === "number" && Number.isInteger(value)
        && value >= BAG_GRAMS.min && value <= BAG_GRAMS.max;
}

export function isGramsLeft(value: unknown): value is number {
    return typeof value === "number" && Number.isInteger(value)
        && value >= 0 && value <= BAG_GRAMS.max;
}

export function isBagPrice(value: unknown): value is number {
    return typeof value === "number" && Number.isFinite(value)
        && value >= BAG_PRICE.min && value <= BAG_PRICE.max;
}

export function reviveBag(value: unknown): CoffeeBag | null {
    if (!isBagRecord(value) || !isBagId(value.id)
        || typeof value.name !== "string" || !value.name.trim()
        || value.name.trim().length > BAG_NAME_MAX
        || !isBagGrams(value.sizeGrams)
        || typeof value.addedAt !== "number"
        || !Number.isFinite(value.addedAt) || value.addedAt < 0) return null;
    const boughtOn = calendarDay(value.boughtOn);
    const roastedOn = calendarDay(value.roastedOn);
    if (boughtOn === undefined) return null;
    if (value.roastedOn !== undefined && roastedOn === undefined) return null;
    if (value.price !== undefined && !isBagPrice(value.price)) return null;
    if (value.beanName !== undefined && (
        typeof value.beanName !== "string" || !value.beanName.trim()
        || value.beanName.trim().length > BAG_BEAN_NAME_MAX
    )) return null;
    if (value.finishedAt !== undefined && (
        typeof value.finishedAt !== "number"
        || !Number.isFinite(value.finishedAt) || value.finishedAt <= 0
    )) return null;
    const source = value.adviceSource;
    if (source !== undefined && source !== "coffee"
        && source !== "estimate" && source !== "user") return null;
    const advice = reviveRoastAdvice(value);
    for (const key of ["restDays", "peakDay", "bestUntilDay"] as const) {
        if (value[key] !== undefined && advice[key] === undefined) return null;
    }
    if (roastAdviceProblem(advice) !== null) return null;
    return {
        id: value.id, name: value.name.trim(), sizeGrams: value.sizeGrams,
        boughtOn, addedAt: value.addedAt,
        ...(roastedOn !== undefined ? {roastedOn} : {}),
        ...(isBagPrice(value.price) ? {price: value.price} : {}),
        ...(typeof value.beanName === "string" ? {beanName: value.beanName.trim()} : {}),
        ...(typeof value.finishedAt === "number" ? {finishedAt: value.finishedAt} : {}),
        ...(source !== undefined ? {adviceSource: source} : {}),
        ...advice
    };
}

export function newBagId(): string {
    return `bag-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
}

export function newBag(input: BagInput, now = Date.now(), id = newBagId()): CoffeeBag {
    const bag = reviveBag({...input, id, addedAt: now});
    if (bag === null) throw new Error("The bag details are invalid.");
    return bag;
}

export function balanceLine(balance: BagBalance): string {
    if (balance.kind === "needsCheck") return "Check remaining coffee";
    if (balance.kind === "external") return "Tracked in Beanconqueror";
    return `Approx. ${balance.remainingGrams} g remaining`;
}

const CALENDAR_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

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

export function dayOf(ms: number): string {
    const date = new Date(ms);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function roastDayFromCoffee(roastingDate: string | undefined): string | undefined {
    return roastingDate === undefined ? undefined : calendarDay(roastingDate.slice(0, 10));
}

export function roastedOnDate(bag: Pick<CoffeeBag, "roastedOn">): Date | null {
    const day = calendarDay(bag.roastedOn);
    if (day === undefined) return null;
    const [y, m, d] = day.split("-").map(Number);
    return new Date(y, m - 1, d);
}

export function daysSinceRoast(
    bag: Pick<CoffeeBag, "roastedOn">, now = Date.now()
): number | null {
    const roasted = roastedOnDate(bag);
    if (roasted === null) return null;
    const today = new Date(now);
    const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
    const roastUtc = Date.UTC(roasted.getFullYear(), roasted.getMonth(), roasted.getDate());
    return Math.round((todayUtc - roastUtc) / 86_400_000);
}

export function dayDate(day: string): Date | null {
    return roastedOnDate({roastedOn: day});
}

export const ROAST_DAY_LOOKBACK_YEARS = 1;

export function roastDayRange(today: string, picked?: string): {min: string; max: string} {
    const [y, m, d] = today.split("-").map(Number);
    const yearBack = dayOf(new Date(y - ROAST_DAY_LOOKBACK_YEARS, m - 1, d).getTime());
    const stored = calendarDay(picked);
    return {min: stored !== undefined && stored < yearBack ? stored : yearBack, max: today};
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS_SPOKEN = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS_SPOKEN = ["January", "February", "March", "April", "May", "June", "July",
    "August", "September", "October", "November", "December"];

export function roastDayLabel(day: string, today: string, spoken = false): string {
    const date = dayDate(day);
    if (date === null) return day;
    const weekdays = spoken ? WEEKDAYS_SPOKEN : WEEKDAYS;
    const months = spoken ? MONTHS_SPOKEN : MONTHS;
    const short = `${date.getDate()} ${months[date.getMonth()]}`;
    const offset = daysSinceRoast({roastedOn: day}, dayDate(today)?.getTime() ?? Date.now());
    if (offset === 0) return `Today, ${short}`;
    if (offset === 1) return `Yesterday, ${short}`;
    return `${weekdays[date.getDay()]} ${short} ${date.getFullYear()}`;
}
