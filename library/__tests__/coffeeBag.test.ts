import {
    balanceLine, calendarDay, daysSinceRoast, isBagGrams, isBagPrice,
    isGramsLeft, newBag, resolveBagTracker, reviveBag, roastedOnDate
} from "@/library/coffeeBag";
import {roastAdviceProblem} from "@/library/roastAdvice";

const facts = {
    id: "bag-a", name: "Colombia, roasted 12 Oct", sizeGrams: 250,
    boughtOn: "2026-10-23", addedAt: 1_000
};

describe("independent physical bag facts", () => {
    it("creates a physical bag without recipe ownership or a counter", () => {
        const bag = newBag({
            name: facts.name, sizeGrams: 250, boughtOn: facts.boughtOn
        }, 1_000, "bag-a");
        expect(bag).toEqual(facts);
        expect(bag).not.toHaveProperty("recipeUuid");
        expect(bag).not.toHaveProperty("gramsAtCount");
    });

    it("reconstructs only known facts and normalises display whitespace", () => {
        expect(reviveBag({...facts, name: " Coffee ", recipeUuid: "old", gramsAtCount: 90}))
            .toEqual({...facts, name: "Coffee"});
    });

    it.each([NaN, Infinity, -1, 0, 5001, 250.5, "250"])(
        "rejects invalid purchase size %s", sizeGrams => {
            expect(reviveBag({...facts, sizeGrams})).toBeNull();
        }
    );

    it.each([
        {id: ""}, {id: " "}, {id: "x".repeat(101)}, {name: ""},
        {name: " "}, {name: "x".repeat(161)}, {boughtOn: "2026-02-31"},
        {roastedOn: "2026-02-29"}, {beanName: ""}, {beanName: "x".repeat(41)},
        {price: -1}, {price: Infinity}, {addedAt: NaN}, {addedAt: -1},
        {finishedAt: 0}, {finishedAt: -1}, {adviceSource: "certain"},
        {restDays: 541}, {peakDay: 1.5}, {restDays: 14, peakDay: 7},
        {restDays: 14, bestUntilDay: 7}, {peakDay: 20, bestUntilDay: 10}
    ])("rejects malformed supplied fields %j", changes => {
        expect(reviveBag({...facts, ...changes})).toBeNull();
    });

    it("preserves distinct identities and complete saved advice", () => {
        const first = reviveBag({
            ...facts, beanName: "Colombia Oct 12", roastedOn: "2026-10-12",
            price: 13.5, restDays: 7, peakDay: 18, bestUntilDay: 27,
            adviceSource: "user", finishedAt: 2_000
        });
        expect(first).toMatchObject({
            id: "bag-a", beanName: "Colombia Oct 12", restDays: 7,
            peakDay: 18, bestUntilDay: 27, adviceSource: "user", finishedAt: 2_000
        });
        expect(reviveBag({...first, id: "bag-b"})?.id).toBe("bag-b");
    });

    it("rejects invalid constructor input explicitly", () => {
        expect(() => newBag({...facts, sizeGrams: 0})).toThrow(/invalid/i);
    });
});

describe("bag quantities and ownership", () => {
    it("distinguishes a zero correction from an invalid purchase size", () => {
        expect(isGramsLeft(0)).toBe(true);
        expect(isBagGrams(0)).toBe(false);
        expect(isGramsLeft(5000)).toBe(true);
        expect(isGramsLeft(5001)).toBe(false);
        expect(isGramsLeft(NaN)).toBe(false);
        expect(isBagPrice(0)).toBe(true);
        expect(isBagPrice(12.5)).toBe(true);
        expect(isBagPrice(Infinity)).toBe(false);
    });

    it("follows the explicit tracker before the handoff preference", () => {
        expect(resolveBagTracker("auto", true)).toBe("beanconqueror");
        expect(resolveBagTracker("auto", false)).toBe("xbrw");
        expect(resolveBagTracker("xbrw", true)).toBe("xbrw");
        expect(resolveBagTracker("beanconqueror", false)).toBe("beanconqueror");
    });

    it("never presents uncertain or externally owned counts as numbers", () => {
        expect(balanceLine({kind: "needsCheck"})).toBe("Check remaining coffee");
        expect(balanceLine({kind: "external"})).toBe("Tracked in Beanconqueror");
        expect(balanceLine({
            kind: "estimate", remainingGrams: 232, usedGrams: 18,
            brewsLeft: 12, low: false, empty: false
        })).toBe("Approx. 232 g remaining");
    });
});

describe("local calendar days and advice", () => {
    it("validates real dates rather than rolling invalid days forward", () => {
        expect(calendarDay(" 2024-02-29 ")).toBe("2024-02-29");
        expect(calendarDay("2026-02-29")).toBeUndefined();
        expect(calendarDay("2026-02-31")).toBeUndefined();
        expect(calendarDay("2026-13-01")).toBeUndefined();
        expect(calendarDay("2026-10-12T12:00:00Z")).toBeUndefined();
    });

    it("reads the roast label at local midnight and counts calendar days", () => {
        const bag = {...facts, roastedOn: "2026-10-12"};
        const roast = roastedOnDate(bag);
        expect(roast?.getFullYear()).toBe(2026);
        expect(roast?.getMonth()).toBe(9);
        expect(roast?.getDate()).toBe(12);
        expect(roast?.getHours()).toBe(0);
        expect(daysSinceRoast(bag, new Date(2026, 9, 23, 23, 59).getTime())).toBe(11);
        expect(daysSinceRoast({}, Date.now())).toBeNull();
    });

    it("checks advice ordering even when the middle field is absent", () => {
        expect(roastAdviceProblem({restDays: 14, peakDay: 7})).not.toBeNull();
        expect(roastAdviceProblem({restDays: 14, bestUntilDay: 7})).not.toBeNull();
        expect(roastAdviceProblem({peakDay: 20, bestUntilDay: 10})).not.toBeNull();
        expect(roastAdviceProblem({restDays: 0, peakDay: 0, bestUntilDay: 0})).toBeNull();
        expect(roastAdviceProblem({restDays: 14, peakDay: 35, bestUntilDay: 52})).toBeNull();
        expect(roastAdviceProblem({})).toBeNull();
    });
});
