import {
    bagBadge,
    calendarDay,
    daysSinceRoast,
    isBagTrackerSetting,
    newBag,
    readBag,
    remainingLine,
    reorderUrl,
    resolveBagTracker,
    reviveBag,
    roastDayFromCoffee,
    roastedOnDate,
    spokenBag,
    withGramsLeft,
    withSize,
    type CoffeeBag
} from "@/library/coffeeBag";

const NOW = new Date(2026, 9, 18, 9, 30).getTime();

function bag(over: Partial<CoffeeBag> = {}): CoffeeBag {
    return {
        id: "bag-1", recipeUuid: "r1", sizeGrams: 250, boughtOn: "2026-10-18",
        addedAt: NOW, countedFrom: NOW, gramsAtCount: 250, ...over
    };
}

describe("which app tracks a bag", () => {
    it("follows the Beanconqueror handoff while the setting is auto", () => {
        expect(resolveBagTracker("auto", false)).toBe("xbrw");
        expect(resolveBagTracker("auto", true)).toBe("beanconqueror");
    });

    it("keeps an explicit choice whatever the handoff says", () => {
        expect(resolveBagTracker("xbrw", true)).toBe("xbrw");
        expect(resolveBagTracker("beanconqueror", false)).toBe("beanconqueror");
    });

    it("reads an unknown stored value as auto", () => {
        expect(resolveBagTracker("sideways", false)).toBe("xbrw");
        expect(resolveBagTracker(undefined, true)).toBe("beanconqueror");
        expect(isBagTrackerSetting("sideways")).toBe(false);
        expect(isBagTrackerSetting("auto")).toBe(true);
    });
});

describe("reading a bag", () => {
    it("says what is left and about how many brews", () => {
        const reading = readBag(bag(), 38, 18);
        expect(reading.remainingGrams).toBe(212);
        expect(reading.brewsLeft).toBe(11);
        expect(remainingLine(reading)).toBe("212 g left, about 11 brews");
        expect(bagBadge(reading)).toBe("212G");
        expect(reading.low).toBe(false);
        expect(reading.empty).toBe(false);
    });

    it("runs low below two doses and is empty below one", () => {
        const low = readBag(bag(), 250 - 30, 18);
        expect(low.low).toBe(true);
        expect(low.empty).toBe(false);
        expect(bagBadge(low)).toBe("LOW");
        expect(remainingLine(low)).toBe("30 g left, about 1 brew");
        expect(spokenBag(low)).toBe("bag running low, 30 grams left");

        const empty = readBag(bag(), 250 - 10, 18);
        expect(empty.empty).toBe(true);
        expect(empty.low).toBe(true);
        expect(remainingLine(empty)).toBe("10 g left, not enough for another brew");
    });

    it("exactly two doses left is not yet low", () => {
        expect(readBag(bag(), 250 - 36, 18).low).toBe(false);
    });

    it("never goes below nought", () => {
        expect(readBag(bag(), 400, 18).remainingGrams).toBe(0);
    });

    it("makes no brew-count claim without a usable dose", () => {
        const reading = readBag(bag(), 0, -1);
        expect(reading.brewsLeft).toBeNull();
        expect(reading.low).toBe(false);
        expect(remainingLine(reading)).toBe("250 g left");
    });
});

describe("changing a bag", () => {
    it("starts a new bag at its size, counted from now", () => {
        const fresh = newBag("r1", {sizeGrams: 320, roastedOn: "2026-10-12"}, NOW);
        expect(fresh).toMatchObject({
            recipeUuid: "r1", sizeGrams: 320, gramsAtCount: 320, countedFrom: NOW,
            roastedOn: "2026-10-12", boughtOn: "2026-10-18"
        });
        expect(fresh.finishedAt).toBeUndefined();
    });

    it("treats a correction as a new anchor", () => {
        const corrected = withGramsLeft(bag(), 120, NOW + 1000);
        expect(corrected.gramsAtCount).toBe(120);
        expect(corrected.countedFrom).toBe(NOW + 1000);
    });

    it("moves what is left with a corrected size, keeping what was used", () => {
        expect(withSize(bag({gramsAtCount: 200}), 320).gramsAtCount).toBe(270);
        expect(withSize(bag({gramsAtCount: 20}), 160).gramsAtCount).toBe(0);
    });
});

describe("roast day", () => {
    it("accepts a real calendar day and nothing else", () => {
        expect(calendarDay("2026-10-12")).toBe("2026-10-12");
        expect(calendarDay("2026-02-31")).toBeUndefined();
        expect(calendarDay("12/10/2026")).toBeUndefined();
        expect(calendarDay(20261012)).toBeUndefined();
    });

    it("takes the day a pod's roast timestamp names", () => {
        expect(roastDayFromCoffee("2026-10-12T08:00:00Z")).toBe("2026-10-12");
        expect(roastDayFromCoffee(undefined)).toBeUndefined();
    });

    it("counts calendar days since roast in local time", () => {
        const roasted = bag({roastedOn: "2026-10-12"});
        expect(daysSinceRoast(roasted, NOW)).toBe(6);
        expect(daysSinceRoast(roasted, new Date(2026, 9, 12, 23, 59).getTime())).toBe(0);
        expect(roastedOnDate(roasted)?.getDate()).toBe(12);
        expect(daysSinceRoast(bag(), NOW)).toBeNull();
    });
});

describe("reorder link", () => {
    it("prefers the coffee's own link", () => {
        expect(reorderUrl({
            coffee: {url: "https://roaster.example/bean"},
            recipeUrl: "https://roaster.example/recipe"
        })).toBe("https://roaster.example/bean");
    });

    it("falls back to the recipe's page", () => {
        expect(reorderUrl({recipeUrl: "https://roaster.example/recipe"}))
            .toBe("https://roaster.example/recipe");
    });

    it("offers nothing without an https link", () => {
        expect(reorderUrl({})).toBeUndefined();
        expect(reorderUrl({recipeUrl: "http://roaster.example"})).toBeUndefined();
        expect(reorderUrl({coffee: {url: "not a url"}})).toBeUndefined();
    });
});

describe("reviving a stored bag", () => {
    it("round-trips a bag through JSON", () => {
        const full = bag({roastedOn: "2026-10-12", price: 24.5, beanName: "Ethiopia Guji",
                          finishedAt: NOW + 5});
        expect(reviveBag(JSON.parse(JSON.stringify(full)))).toEqual(full);
    });

    it("refuses a bag missing what it cannot be without", () => {
        expect(reviveBag({...bag(), sizeGrams: 0})).toBeNull();
        expect(reviveBag({...bag(), recipeUuid: ""})).toBeNull();
        expect(reviveBag({...bag(), gramsAtCount: -1})).toBeNull();
        expect(reviveBag("bag")).toBeNull();
    });

    it("drops a malformed optional field and keeps the bag", () => {
        const revived = reviveBag({...bag(), roastedOn: "last week", price: "lots", extra: 1});
        expect(revived).toEqual(bag());
    });
});
