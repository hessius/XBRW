import {newBag, reviveBag} from "@/library/coffeeBag";
import {parseBrewMindLink} from "@/library/brewmindLink";
import {podCoffeeFromStored} from "@/library/podCoffee";
import {bagFixture} from "@/test-utils/bags";
import {
    PEAK_WINDOW_DAYS,
    ROAST_LEVEL_DEFAULTS,
    figuresFrom,
    figuresProblem,
    freshnessBadge,
    freshnessLine,
    freshnessOf,
    freshnessProblem,
    roastAdviceFromFeed,
    roastDays,
    roastLevelKey,
    shortDay,
    startingFigures,
    withRoastAdvice
} from "@/library/restPeak";

/** Local wall-clock time, so every expectation holds in any time zone. */
const at = (y: number, m: number, d: number, h = 9) => new Date(y, m - 1, d, h).getTime();

/** Roasted 1 Oct 2026, Light defaults: rest 11, peak 28, best until 42. */
const BAG = {roastedOn: "2026-10-01", restDays: 11, peakDay: 28, bestUntilDay: 42};

describe("freshnessOf", () => {
    it("says nothing without a roast day or without rest figures", () => {
        expect(freshnessOf({restDays: 11, peakDay: 28}, at(2026, 10, 5))).toBeNull();
        expect(freshnessOf({roastedOn: "2026-10-01"}, at(2026, 10, 5))).toBeNull();
    });

    it("rests until the rest ends, and is ready on that day", () => {
        expect(freshnessOf(BAG, at(2026, 10, 11))?.state).toBe("resting"); // day 10
        expect(freshnessOf(BAG, at(2026, 10, 12))?.state).toBe("ready");   // day 11
    });

    it("is at its peak within the window either side of the peak day", () => {
        const day = (n: number) => at(2026, 10, 1 + n);
        expect(freshnessOf(BAG, day(28 - PEAK_WINDOW_DAYS - 1))?.state).toBe("ready");
        expect(freshnessOf(BAG, day(28 - PEAK_WINDOW_DAYS))?.state).toBe("peak");
        expect(freshnessOf(BAG, day(28))?.state).toBe("peak");
        expect(freshnessOf(BAG, day(28 + PEAK_WINDOW_DAYS))?.state).toBe("peak");
        expect(freshnessOf(BAG, day(28 + PEAK_WINDOW_DAYS + 1))?.state).toBe("ready");
    });

    it("is past its best only after the best-until day", () => {
        expect(freshnessOf(BAG, at(2026, 11, 12))?.state).toBe("ready"); // day 42
        expect(freshnessOf(BAG, at(2026, 11, 13))?.state).toBe("past");  // day 43
    });

    it("counts calendar days in local time, whatever the hour", () => {
        expect(freshnessOf(BAG, at(2026, 10, 12, 0))?.days).toBe(11);
        expect(freshnessOf(BAG, at(2026, 10, 12, 23))?.days).toBe(11);
        expect(freshnessOf(BAG, at(2026, 10, 11, 23))?.state).toBe("resting");
    });

    it("dates the ready and peak days locally across a month end and daylight saving", () => {
        // 4 Oct 2026 is a daylight saving change in south-east Australia.
        const reading = freshnessOf(BAG, at(2026, 10, 2));
        expect(reading?.readyOn).toEqual(new Date(2026, 9, 12));
        expect(reading?.peakOn).toEqual(new Date(2026, 9, 29));
        expect(shortDay(reading!.readyOn)).toBe("12 Oct");
    });

    it("offers a correction rather than a readiness prediction for a future roast day", () => {
        expect(freshnessOf(BAG, at(2026, 9, 28))).toBeNull();
        expect(freshnessProblem(BAG, at(2026, 9, 28))).toMatch(/future/);
    });

    it("does not derive freshness from inconsistent guidance", () => {
        expect(freshnessOf({...BAG, restDays: 30, peakDay: 10}, at(2026, 10, 12))).toBeNull();
        expect(freshnessOf({...BAG, restDays: 1.5}, at(2026, 10, 12))).toBeNull();
    });

    it("never goes past its best without a best-until day", () => {
        const bag = {roastedOn: "2026-01-01", restDays: 7, peakDay: 18};
        expect(freshnessOf(bag, at(2026, 10, 1))?.state).toBe("ready");
    });
});

describe("freshnessLine and freshnessBadge", () => {
    it("words each state", () => {
        const line = (now: number) => freshnessLine(freshnessOf(BAG, now)!);
        expect(line(at(2026, 10, 5))).toBe("Resting, estimated ready from 12 Oct.");
        expect(line(at(2026, 10, 14))).toBe("Estimated peak around 29 Oct.");
        expect(line(at(2026, 10, 29))).toBe("Within the estimated peak window.");
        expect(line(at(2026, 11, 5))).toBe("Within the estimated window.");
        expect(line(at(2026, 11, 20))).toBe("Outside the estimated window.");
    });

    it("has a short Doto badge for each state", () => {
        expect((["resting", "ready", "peak", "past"] as const).map(freshnessBadge))
            .toEqual(["REST", "READY", "PEAK", "PAST"]);
    });
});

describe("roast level defaults", () => {
    it("holds the agreed figures", () => {
        expect(ROAST_LEVEL_DEFAULTS).toEqual({
            nordic: {restDays: 14, peakDay: 35, bestUntilDay: 52},
            light:  {restDays: 11, peakDay: 28, bestUntilDay: 42},
            medium: {restDays: 7,  peakDay: 18, bestUntilDay: 27},
            dark:   {restDays: 4,  peakDay: 10, bestUntilDay: 15},
            decaf:  {restDays: 5,  peakDay: 14, bestUntilDay: 21}
        });
    });

    it("reads a level from a coffee's words", () => {
        expect(roastLevelKey("Nordic Ultra-light")).toBe("nordic");
        expect(roastLevelKey("Light")).toBe("light");
        expect(roastLevelKey("Medium-Dark")).toBe("dark");
        expect(roastLevelKey("medium")).toBe("medium");
        expect(roastLevelKey("Light", true)).toBe("decaf");
        expect(roastLevelKey("Swiss Water Decaf")).toBe("decaf");
        expect(roastLevelKey("Omni")).toBeUndefined();
        expect(roastLevelKey(undefined)).toBeUndefined();
    });

    it("uses generic medium figures without inventing a known roast level", () => {
        expect(startingFigures(undefined)).toEqual({
            figures: ROAST_LEVEL_DEFAULTS.medium, source: "estimate"
        });
        expect(startingFigures({roast: "Dark"}).figures).toEqual(ROAST_LEVEL_DEFAULTS.dark);
    });

    it("prefers the coffee's own advice, filling gaps from the level", () => {
        expect(startingFigures({roast: "Light", restDays: 12, peakDay: 30, bestUntilDay: 40}))
            .toEqual({figures: {restDays: 12, peakDay: 30, bestUntilDay: 40}, level: "light", source: "coffee"});
        // Rest alone is not enough to show as the roaster's word.
        expect(startingFigures({roast: "Light", restDays: 12})).toEqual({
            figures: {restDays: 12, peakDay: 28, bestUntilDay: 42}, level: "light", source: "estimate"
        });
        // A stated peak without a best-until moves the window with it.
        expect(startingFigures({roast: "Light", restDays: 12, peakDay: 30}).figures.bestUntilDay).toBe(44);
    });

    it("moves best-until with a typed peak, and checks the pair", () => {
        expect(figuresFrom(10, 20, "medium")).toEqual({restDays: 10, peakDay: 20, bestUntilDay: 29});
        expect(figuresFrom(10, 539, "nordic").bestUntilDay).toBe(540);
        expect(figuresProblem(7, 18)).toBeNull();
        expect(figuresProblem(7, 7)).toBeNull();
        expect(figuresProblem(18, 7)).toBe("The peak day is on or after the rest ends.");
        expect(figuresProblem(undefined, 7)).toBe("Enter whole days, 0 to 540.");
    });

    it("keeps derived advice in the storage range at the maximum peak", () => {
        const {figures} = startingFigures({restDays: 14, peakDay: 540});
        expect(figures.bestUntilDay).toBe(540);
        const bag = newBag({...bagFixture(), roastedOn: "2024-01-01", ...figures}, at(2024, 1, 1));
        expect(reviveBag(JSON.parse(JSON.stringify(bag)))?.bestUntilDay).toBe(540);
        expect(freshnessOf(bag, at(2026, 1, 1))?.state).toBe("past");
    });

    it("moves a saved window with the peak without leaving the storage range", () => {
        expect(figuresFrom(14, 36, ROAST_LEVEL_DEFAULTS.nordic))
            .toEqual({restDays: 14, peakDay: 36, bestUntilDay: 53});
        expect(figuresFrom(14, 540, ROAST_LEVEL_DEFAULTS.nordic).bestUntilDay).toBe(540);
        expect(figuresFrom(0, 0, {restDays: 0, peakDay: 30, bestUntilDay: 5}).bestUntilDay).toBe(0);
    });
});

describe("roast advice validation", () => {
    it("takes whole days 0 to 540, from numbers or digit strings", () => {
        expect(roastDays(0)).toBe(0);
        expect(roastDays(540)).toBe(540);
        expect(roastDays("14")).toBe(14);
        expect(roastDays(" 14 ")).toBe(14);
        for (const bad of [541, -1, 1.5, "1.5", "14 days", "-3", "", null, NaN, Infinity, true]) {
            expect(roastDays(bad)).toBeUndefined();
        }
    });

    it("reads the roaster catalogue's roast block, each figure on its own", () => {
        expect(roastAdviceFromFeed({level: "Light", rest_days: 11, peak_day: 28, best_until_day: 42}))
            .toEqual({restDays: 11, peakDay: 28, bestUntilDay: 42});
        expect(roastAdviceFromFeed({rest_days: 11, peak_day: 900, best_until_day: "42"}))
            .toEqual({restDays: 11, bestUntilDay: 42});
        expect(roastAdviceFromFeed(null)).toEqual({});
        expect(roastAdviceFromFeed([1, 2])).toEqual({});
    });

    it("lays catalogue advice over a coffee without touching the rest of it", () => {
        expect(withRoastAdvice({name: "Vinka", roast: "Light"}, {restDays: 11, peakDay: 999}))
            .toEqual({name: "Vinka", roast: "Light", restDays: 11});
    });

    it("keeps valid figures on a stored coffee and drops bad ones", () => {
        expect(podCoffeeFromStored({name: "Vinka", restDays: 11, peakDay: "28", bestUntilDay: -1}))
            .toEqual({name: "Vinka", restDays: 11, peakDay: 28});
    });

    it("keeps valid bag figures through save and restore and rejects damaged advice", () => {
        const bag = newBag({...bagFixture(), roastedOn: "2026-10-01",
                           restDays: 11, peakDay: 28, bestUntilDay: 42}, at(2026, 10, 2));
        expect(bag).toEqual(expect.objectContaining({restDays: 11, peakDay: 28, bestUntilDay: 42}));
        expect(reviveBag(JSON.parse(JSON.stringify(bag)))).toEqual(bag);
        const edited = reviveBag({...bag, restDays: "lots", peakDay: 1000});
        expect(edited).toBeNull();
    });
});

describe("BrewMind link roast params", () => {
    const SHARE = "https://xbloom.com/share?id=abc123";
    const link = (params: Record<string, string>) => {
        const url = new URL("xbrw://import");
        for (const [key, value] of Object.entries({v: "1", source: "brewmind", share: SHARE, ...params})) {
            url.searchParams.set(key, value);
        }
        return url.toString();
    };

    it("reads bean.rest_days, bean.peak_day and bean.best_until_day", () => {
        const parsed = parseBrewMindLink(link({
            "bean.name": "Vinka", "bean.rest_days": "14", "bean.peak_day": "35", "bean.best_until_day": "52"
        }));
        expect(parsed?.coffee).toEqual({name: "Vinka", restDays: 14, peakDay: 35, bestUntilDay: 52});
    });

    it("drops an over-long or out-of-range figure and keeps the rest", () => {
        const parsed = parseBrewMindLink(link({
            "bean.name": "Vinka", "bean.rest_days": "00014", "bean.peak_day": "999", "bean.best_until_day": "52"
        }));
        expect(parsed?.coffee).toEqual({name: "Vinka", bestUntilDay: 52});
    });
});
