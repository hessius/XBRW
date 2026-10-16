import type {PlanStage, TeaCycleObservation} from "@/library/brew/BrewRecord";
import {buildTeaCycleViews} from "@/library/brew/teaCycle";

const plan: PlanStage[] = [
    {pourNumber: 1, volume: 90, temperature: 92, flowRate: 35,
        agitation: 0, pourPattern: 2, pauseTime: 45},
    {pourNumber: 2, volume: 90, temperature: 92, flowRate: 35,
        agitation: 0, pourPattern: 0, pauseTime: 60},
    {pourNumber: 3, volume: 90, temperature: 80, flowRate: 35,
        agitation: 0, pourPattern: 0, pauseTime: 90}
];

const complete: TeaCycleObservation[] = [
    {index: 0, fillStartedAt: -684, fillEndedAt: 25656, steepStartedAt: 26158,
        steepEndedAt: 70785, endingEndedAt: 103757, fillMl: 90,
        releaseWaterMl: 42.9125},
    {index: 1, fillStartedAt: 103757, fillEndedAt: 129939, steepStartedAt: 130443,
        steepEndedAt: 189769, endingEndedAt: 221275, fillMl: 89.7125,
        releaseWaterMl: 37.775},
    {index: 2, fillStartedAt: 221275, fillEndedAt: 247635, steepStartedAt: 248144,
        steepEndedAt: 337772, endingEndedAt: 365197, fillMl: 89.425,
        releaseWaterMl: 40.775}
];

describe("tea cycle view model", () => {
    it("presents all three measured cycles from the complete capture", () => {
        const stages = buildTeaCycleViews(plan, complete, {now: 367122});
        expect(stages).toHaveLength(3);
        expect(stages.map((stage) => stage.steep.elapsedSeconds)).toEqual([
            44.627, 59.326, 89.628
        ]);
        expect(stages.map((stage) => stage.fill.measuredMl)).toEqual([
            90, 89.7125, 89.425
        ]);
        expect(stages.map((stage) => stage.ending.releaseWaterMl)).toEqual([
            42.9125, 37.775, 40.775
        ]);
        expect(stages[2].ending).toMatchObject({
            boundary: "unknown", status: "complete", elapsedSeconds: 27.425
        });
        expect(stages[2].ending.drainSeconds).toBeNull();
    });

    it("shows a live steep timer without inferring its completion at plan time", () => {
        const [stage] = buildTeaCycleViews(plan, [{
            index: 0, fillStartedAt: 0, fillEndedAt: 10_000,
            steepStartedAt: 11_000
        }], {now: 56_000});
        expect(stage.steep).toMatchObject({status: "observing", elapsedSeconds: 45});
    });

    it("keeps the combined ending open when release and drain are not separated", () => {
        const [stage] = buildTeaCycleViews(plan, [{
            index: 0, steepStartedAt: 10_000, steepEndedAt: 55_000,
            releaseWaterMl: 12
        }], {now: 85_000});
        expect(stage.ending).toMatchObject({
            boundary: "unknown", status: "observing", elapsedSeconds: 30,
            releaseWaterMl: 12, drainSeconds: null
        });
    });

    it("does not infer a final steep from a done record with missing evidence", () => {
        const stages = buildTeaCycleViews(plan, complete.slice(0, 2), {
            now: 250_000, outcome: "done", finished: true
        });
        expect(stages[2]).toMatchObject({
            fill: {status: "not-observed"},
            steep: {status: "not-observed"},
            ending: {status: "not-observed"}
        });
        expect(stages[2].ending).not.toHaveProperty("elapsedSeconds");
    });

    it("keeps the cycle summary useful without a retained sample stream", () => {
        const stages = buildTeaCycleViews(plan, complete, {now: 367122});
        expect(stages[0].fill.measuredMl).toBe(90);
        expect(stages[0].steep.elapsedSeconds).toBe(44.627);
    });

    it("excludes a confirmed manual pause from a paused steep timer", () => {
        const [stage] = buildTeaCycleViews(plan, [{
            index: 0, steepStartedAt: 10_000
        }], {
            now: 50_000,
            paused: true,
            pauseIntervals: [{from: 20_000, to: 50_000, pour: 1, reason: "manual"}]
        });
        expect(stage.steep).toMatchObject({status: "paused", elapsedSeconds: 10});
    });

    it("keeps an interrupted ending distinct from an unknown boundary", () => {
        const [stage] = buildTeaCycleViews(plan, [{
            index: 0, steepStartedAt: 10_000, steepEndedAt: 55_000
        }], {now: 62_000, outcome: "lostContact"});
        expect(stage.ending).toMatchObject({
            boundary: "unknown", status: "interrupted",
            drainSeconds: null
        });
        expect(stage.ending).not.toHaveProperty("elapsedSeconds");
    });

    it("marks a machine-reported short ending as interrupted", () => {
        const [stage] = buildTeaCycleViews(plan, [{
            index: 0, fillStartedAt: 0, steepStartedAt: 10_000, steepEndedAt: 35_000
        }], {now: 40_000, finished: true, outcome: "endedOnMachine"});
        expect(stage.fill.status).toBe("interrupted");
        expect(stage.steep.status).toBe("complete");
        expect(stage.ending.status).toBe("interrupted");
        expect(stage.ending).not.toHaveProperty("elapsedSeconds");
    });
});
