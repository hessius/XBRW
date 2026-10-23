import {BagRunTracker} from "@/library/brew/BagRunTracker";
import {INITIAL_BAG_PROGRESS} from "@/library/bagRun";
import {bagRunFixture} from "@/test-utils/bags";

function tracker() {
    const store = {
        beginRun: jest.fn(() => ({...INITIAL_BAG_PROGRESS})),
        updateRun: jest.fn()
    };
    const onError = jest.fn();
    return {store, onError, tracker: new BagRunTracker(bagRunFixture(), store, onError)};
}

describe("single owner bag observations", () => {
    it("ignores an old recipe's pouring and terminal phase before this owner's send", () => {
        const h = tracker();
        h.tracker.event("grinding");
        h.tracker.event("pouring");
        h.tracker.event("ended");
        expect(h.store.updateRun).not.toHaveBeenCalled();
        h.tracker.event("refused");
        expect(h.store.updateRun).toHaveBeenLastCalledWith("run-a", {
            consumption: "unused", possible: false, closed: true
        });
    });
    it("charges a pour once, retaining it on cancellation or duplicate final events", () => {
        const h = tracker();
        for (const event of ["sending", "grinding", "pouring", "pouring", "ended", "ended"] as const) {
            h.tracker.event(event);
        }
        expect(h.store.updateRun).toHaveBeenCalledTimes(3);
        expect(h.store.updateRun).toHaveBeenLastCalledWith("run-a", {
            consumption: "used", possible: true, closed: true
        });
    });
    it("rearms a refused attempt without attributing a stale phase to the retry", () => {
        const h = tracker();
        h.tracker.event("refused");
        h.tracker.event("retryBeforeSend");
        h.tracker.event("pouring");
        expect(h.store.updateRun).toHaveBeenLastCalledWith("run-a", INITIAL_BAG_PROGRESS);
        h.tracker.event("sending");
        h.tracker.event("pouring");
        expect(h.store.updateRun).toHaveBeenLastCalledWith("run-a", {
            consumption: "used", possible: true, closed: false
        });
    });
    it("retains an unsaved first pour and retries on the next existing event", () => {
        const h = tracker();
        h.tracker.event("sending");
        h.store.updateRun.mockImplementationOnce(() => { throw new Error("disk full"); });
        h.tracker.event("pouring");
        expect(h.onError).toHaveBeenCalledWith(expect.any(Error), bagRunFixture(), {
            consumption: "used", possible: true, closed: false
        });
        h.tracker.event("ended");
        expect(h.store.updateRun).toHaveBeenLastCalledWith("run-a", {
            consumption: "used", possible: true, closed: true
        });
    });
    it("retries the initial allocation while preserving later observed consumption", () => {
        const store = {
            beginRun: jest.fn().mockImplementationOnce(() => { throw new Error("unavailable"); })
                .mockReturnValue({...INITIAL_BAG_PROGRESS}),
            updateRun: jest.fn()
        };
        const onError = jest.fn();
        const active = new BagRunTracker(bagRunFixture(), store, onError);
        active.event("sending");
        active.event("pouring");
        expect(onError).toHaveBeenCalledTimes(1);
        expect(store.beginRun).toHaveBeenCalledTimes(2);
        expect(store.updateRun).toHaveBeenLastCalledWith("run-a", {
            consumption: "used", possible: true, closed: false
        });
    });
    it("never opens a competing local allocation for an external tracker", () => {
        const store = {beginRun: jest.fn(), updateRun: jest.fn()};
        const active = new BagRunTracker(
            bagRunFixture({tracker: "beanconqueror"}), store, jest.fn()
        );
        active.event("sending");
        active.event("pouring");
        active.event("ended");
        expect(store.beginRun).not.toHaveBeenCalled();
        expect(store.updateRun).not.toHaveBeenCalled();
    });
});
