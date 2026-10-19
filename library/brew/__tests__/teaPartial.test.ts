import {stageWaterFromSamples} from "@/library/brew/BrewRecord";
import {teaPartialPlan, teaPartialSamples} from "@/library/brew/__tests__/fixtures/teaPartial";

describe("partial three-steep recording landmarks", () => {
    it("has three planned steeps", () => {
        expect(teaPartialPlan).toHaveLength(3);
        expect(teaPartialPlan.map(stage => stage.pourNumber)).toEqual([1, 2, 3]);
    });

    it("has no sample labelled pour three", () => {
        expect(teaPartialSamples.some(sample => sample.pour === 3)).toBe(false);
    });

    it("has rising water and cup readings across the final two samples", () => {
        const [previous, last] = teaPartialSamples.slice(-2);
        expect(last.water).toBeGreaterThan(previous.water);
        expect(last.cup).toBeGreaterThan(previous.cup);
    });

    it("preserves the water attributed to each recorded pour label", () => {
        expect(stageWaterFromSamples(teaPartialSamples, 3))
            .toEqual([139.8875, 150.35000000000002, 0]);
    });
});
