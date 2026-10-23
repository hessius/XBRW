import {
    INITIAL_BAG_PROGRESS, nextBagProgress, reviveBagRunProgress,
    reviveBagRunSnapshot, type BagRunSnapshot
} from "@/library/bagRun";

const snapshot: BagRunSnapshot = {
    runId: "run-a", bagId: "bag-a", bagName: "Colombia Oct 12", recipeUuid: "a",
    dose: 18, tracker: "xbrw", acceptedAt: 1_000, beanName: "Colombia Oct 12"
};

describe("bag consumption observations", () => {
    it("counts observed pouring once and never refunds on a terminal event", () => {
        const sent = nextBagProgress(INITIAL_BAG_PROGRESS, "sending");
        expect(sent).toEqual({consumption: "uncertain", possible: true, closed: false});
        const used = nextBagProgress(sent, "pouring");
        expect(used).toEqual({consumption: "used", possible: true, closed: false});
        const ended = nextBagProgress(used, "ended");
        expect(ended).toEqual({...used, closed: true});
        expect(nextBagProgress(ended, "ended")).toBe(ended);
        expect(nextBagProgress(ended, "retryBeforeSend")).toBe(ended);
    });

    it("distinguishes a confirmed refusal from uncertain grinding", () => {
        expect(nextBagProgress(INITIAL_BAG_PROGRESS, "refused"))
            .toEqual({consumption: "unused", possible: false, closed: true});
        const grinding = nextBagProgress(INITIAL_BAG_PROGRESS, "grinding");
        expect(nextBagProgress(grinding, "ended"))
            .toEqual({consumption: "uncertain", possible: true, closed: true});
        expect(nextBagProgress(INITIAL_BAG_PROGRESS, "ended"))
            .toEqual({consumption: "unused", possible: false, closed: true});
    });

    it("rearms only a confirmed unused attempt", () => {
        const refused = nextBagProgress(INITIAL_BAG_PROGRESS, "refused");
        expect(nextBagProgress(refused, "retryBeforeSend")).toEqual(INITIAL_BAG_PROGRESS);
        const unknown = nextBagProgress(INITIAL_BAG_PROGRESS, "recovered");
        expect(nextBagProgress(unknown, "retryBeforeSend")).toBe(unknown);
        expect(nextBagProgress(unknown, "pouring")).toBe(unknown);
    });

    it("recovers unclosed runs without pretending no beans were used", () => {
        expect(nextBagProgress(INITIAL_BAG_PROGRESS, "recovered"))
            .toEqual({consumption: "uncertain", possible: true, closed: true});
        const used = nextBagProgress(INITIAL_BAG_PROGRESS, "pouring");
        expect(nextBagProgress(used, "recovered"))
            .toEqual({consumption: "used", possible: true, closed: true});
    });
});

describe("persisted attribution validation", () => {
    it("retains frozen names and intended dose without recipe state", () => {
        expect(reviveBagRunSnapshot(snapshot)).toEqual(snapshot);
        expect(reviveBagRunSnapshot({...snapshot, name: "unknown"}))
            .not.toHaveProperty("name");
    });

    it.each([
        {runId: ""}, {bagId: ""}, {recipeUuid: []}, {bagName: ""},
        {dose: 0}, {dose: NaN}, {dose: Infinity}, {dose: -1},
        {tracker: "both"}, {acceptedAt: NaN}, {beanName: "x".repeat(41)}
    ])("rejects malformed attribution %j", fields => {
        expect(reviveBagRunSnapshot({...snapshot, ...fields})).toBeNull();
    });

    it.each([
        {consumption: "used", possible: false, closed: true},
        {consumption: "unused", possible: true, closed: true},
        {consumption: "pending", possible: false, closed: true},
        {consumption: "uncertain", possible: false, closed: true},
        {consumption: "maybe", possible: true, closed: false}
    ])("rejects impossible stored progress %j", value => {
        expect(reviveBagRunProgress(value)).toBeNull();
    });
});
