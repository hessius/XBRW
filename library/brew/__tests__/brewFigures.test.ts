import {brewFigureDetails, brewFigures} from "@/library/brew/brewFigures";

describe("brewFigureDetails", () => {
    const observations = {
        grind: {kind: "dial" as const, dial: 53, recipe: 50, savedRecipe: 48},
        drawdown: 0, drawdownRate: 0, delay: 0, reserveDrawdown: true
    };

    it("projects tea details without mutating the persisted observations", () => {
        const original = {...observations};
        expect(brewFigureDetails("tea", observations)).toEqual({
            grind: null, drawdown: null, drawdownRate: null, delay: null,
            reserveDrawdown: false
        });
        expect(observations).toEqual(original);
    });

    it.each(["coffee", undefined] as const)("preserves %s figures exactly", (kind) => {
        expect(brewFigureDetails(kind, observations)).toBe(observations);
    });
});

describe("brewFigures", () => {
    it("times from the first drop and weighs the cup", () => {
        expect(brewFigures({
            startedAt: 0, pouringAt: 1_000, endedAt: 873_000, cupTotal: 243.6
        })).toBe("14:32 · 244 G");
    });

    it("falls back to the start where no first drop was recorded", () => {
        expect(brewFigures({
            startedAt: 0, pouringAt: 0, endedAt: 60_000, cupTotal: 200
        })).toBe("1:00 · 200 G");
    });
});
