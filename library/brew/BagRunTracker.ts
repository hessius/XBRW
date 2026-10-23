import {
    INITIAL_BAG_PROGRESS, nextBagProgress, type BagAccountingStore,
    type BagRunEvent, type BagRunProgress, type BagRunSnapshot
} from "@/library/bagRun";

export class BagRunTracker {
    private progress: BagRunProgress = INITIAL_BAG_PROGRESS;
    private available = false;
    private dirty = false;
    private observedOwnSend = false;

    constructor(
        readonly snapshot: BagRunSnapshot,
        private readonly store: Pick<BagAccountingStore, "beginRun" | "updateRun">,
        private readonly onError: (
            error: unknown, snapshot: BagRunSnapshot, progress: BagRunProgress
        ) => void
    ) {
        if (snapshot.tracker !== "xbrw") return;
        try {
            this.progress = store.beginRun(snapshot);
            this.available = true;
            this.observedOwnSend = this.progress.possible;
        } catch (error) {
            this.dirty = true;
            onError(error, snapshot, this.progress);
        }
    }

    event(event: BagRunEvent): void {
        if (this.snapshot.tracker !== "xbrw") return;
        if (event === "sending") this.observedOwnSend = true;
        if ((event === "grinding" || event === "pouring" || event === "ended")
            && !this.observedOwnSend) return;
        if (event === "retryBeforeSend" && this.progress.consumption === "unused") {
            this.observedOwnSend = false;
        }
        const next = nextBagProgress(this.progress, event);
        if (next.consumption === this.progress.consumption
            && next.possible === this.progress.possible
            && next.closed === this.progress.closed && !this.dirty) return;
        this.progress = next;
        this.dirty = true;
        try {
            if (!this.available) {
                this.store.beginRun(this.snapshot);
                this.available = true;
            }
            this.store.updateRun(this.snapshot.runId, next);
            this.dirty = false;
        } catch (error) {
            this.onError(error, this.snapshot, next);
        }
    }
}
