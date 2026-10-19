import type {
    BrewOutcome,
    PlanStage,
    TeaCycleObservation
} from "@/library/brew/BrewRecord";
import type {PauseInterval} from "@/library/brew/pauseIntervals";

export type TeaObservationStatus =
    | "not-observed" | "observing" | "paused" | "complete" | "interrupted";

export type TeaStageView = {
    index: number;
    fillMl: number;
    temperatureC: number;
    steepSeconds: number;
    fill: {status: TeaObservationStatus; measuredMl?: number};
    steep: {status: TeaObservationStatus; elapsedSeconds?: number};
    ending: {
        boundary: "unknown";
        status: TeaObservationStatus;
        elapsedSeconds?: number;
        releaseWaterMl?: number;
        drainSeconds: null;
    };
};

export type TeaCycleViewOptions = {
    /** Current or terminal time on the same sample clock as the observations. */
    now: number;
    pauseIntervals?: readonly PauseInterval[];
    paused?: boolean;
    finished?: boolean;
    outcome?: BrewOutcome;
};

function pausedMilliseconds(
    intervals: readonly PauseInterval[],
    from: number,
    to: number
): number {
    return intervals.reduce((sum, interval) => {
        const overlap = Math.max(0, Math.min(to, interval.to) - Math.max(from, interval.from));
        return sum + overlap;
    }, 0);
}

function elapsedSeconds(
    from: number,
    to: number,
    intervals: readonly PauseInterval[]
): number {
    return Math.max(0, to - from - pausedMilliseconds(intervals, from, to)) / 1000;
}

function interrupted(outcome: BrewOutcome | undefined): boolean {
    return outcome === "cancelled" || outcome === "failed" || outcome === "lostContact"
        || outcome === "endedOnMachine";
}

export function buildTeaCycleViews(
    plan: readonly PlanStage[],
    observations: readonly TeaCycleObservation[] = [],
    options: TeaCycleViewOptions
): TeaStageView[] {
    const byIndex = new Map(observations.map((cycle) => [cycle.index, cycle]));
    const pauses = options.pauseIntervals ?? [];
    const wasInterrupted = interrupted(options.outcome);

    return plan.map((stage, index) => {
        const cycle = byIndex.get(index);
        const fillStarted = cycle?.fillStartedAt;
        const fillEnded = cycle?.fillEndedAt;
        const steepStarted = cycle?.steepStartedAt;
        const steepEnded = cycle?.steepEndedAt;
        const endingEnded = cycle?.endingEndedAt;

        const fillStatus: TeaObservationStatus = fillEnded !== undefined ? "complete"
            : fillStarted !== undefined
                ? wasInterrupted ? "interrupted" : options.finished ? "not-observed" : "observing"
                : "not-observed";

        const isPaused = options.paused === true
            || (steepStarted !== undefined && pauses.some((pause) =>
                pause.from <= options.now && pause.to >= options.now));
        const steepStatus: TeaObservationStatus = steepEnded !== undefined ? "complete"
            : steepStarted !== undefined
                ? wasInterrupted ? "interrupted"
                    : isPaused ? "paused"
                        : options.finished ? "not-observed" : "observing"
                : "not-observed";
        const steepElapsed = steepStarted === undefined || (options.finished && steepEnded === undefined)
            ? undefined
            : elapsedSeconds(
                steepStarted, steepEnded ?? options.now, pauses
            );

        const endingStatus: TeaObservationStatus =
            steepEnded === undefined ? "not-observed"
                : endingEnded !== undefined ? "complete"
                    : wasInterrupted ? "interrupted"
                        : isPaused ? "paused"
                            : options.finished ? "not-observed" : "observing";
        const endingElapsed = steepEnded === undefined || wasInterrupted
            || (options.finished && endingEnded === undefined) ? undefined
            : elapsedSeconds(steepEnded, endingEnded ?? options.now, pauses);

        return {
            index,
            fillMl: stage.volume,
            temperatureC: stage.temperature,
            steepSeconds: Math.max(0, stage.pauseTime),
            fill: {
                status: fillStatus,
                ...(cycle?.fillMl === undefined ? {} : {measuredMl: cycle.fillMl})
            },
            steep: {
                status: steepStatus,
                ...(steepElapsed === undefined ? {} : {elapsedSeconds: steepElapsed})
            },
            ending: {
                boundary: "unknown",
                status: endingStatus,
                ...(endingElapsed === undefined ? {} : {elapsedSeconds: endingElapsed}),
                ...(cycle?.releaseWaterMl === undefined
                    ? {} : {releaseWaterMl: cycle.releaseWaterMl}),
                drainSeconds: null
            }
        };
    });
}
