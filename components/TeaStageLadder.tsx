import React from "react";
import {Text, XStack, YStack} from "tamagui";

import DotMatrixText from "@/components/DotMatrixText";
import {palette} from "@/constants/colors";

type ObservationStatus = "not-observed" | "observing" | "complete" | "interrupted";
type TimedObservation = {status: ObservationStatus; elapsedSeconds?: number};

/** Explicit observations only. No machine phase, event or elapsed-time mapping lives here. */
export type TeaStageView = {
    fillMl: number;
    temperatureC: number;
    steepSeconds: number;
    fill: {status: ObservationStatus; measuredMl?: number};
    steep: TimedObservation;
    ending:
        | {boundary: "unknown"; combined: TimedObservation}
        | {boundary: "known"; release: TimedObservation; drain: TimedObservation};
};

const STATUS_TEXT: Record<ObservationStatus, string> = {
    "not-observed": "Not observed",
    observing: "Observing",
    complete: "Observed complete",
    interrupted: "Interrupted"
};

function duration(seconds: number): string {
    const whole = Math.max(0, Math.floor(seconds));
    return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

function Phase({label, status, detail, accent, note}: {
    label: string;
    status: ObservationStatus;
    detail: string;
    accent: string;
    note?: string;
}) {
    const colour = status === "observing" ? accent
        : status === "interrupted" ? palette.warn : palette.muted;
    return (
        <YStack flexGrow={1} flexBasis={160} gap="$1" borderTopWidth={3}
                borderTopColor={colour} paddingTop="$2">
            <Text color={palette.text} fontSize={13} fontVariant={["tabular-nums"]}>
                {`${label} · ${detail}`}
            </Text>
            <Text color={colour} fontSize={12}>{STATUS_TEXT[status]}</Text>
            {note && <Text color={palette.muted} fontSize={12}>{note}</Text>}
        </YStack>
    );
}

function endingTime(observation: TimedObservation): string {
    return observation.elapsedSeconds === undefined
        ? "duration unknown" : `${duration(observation.elapsedSeconds)} elapsed`;
}

/**
 * Isolated presentation prototype; intentionally has no production caller.
 * An observed boundary/status must be supplied, never inferred from the clock.
 */
export default function TeaStageLadder({stages, accent}: {
    stages: readonly TeaStageView[];
    accent: string;
}) {
    return (
        <YStack gap="$4">
            {stages.map((stage, index) => {
                const {fill, steep, ending} = stage;
                const endLabel = ending.boundary === "unknown"
                    ? `Release + drain: ${STATUS_TEXT[ending.combined.status]}, ${endingTime(ending.combined)}`
                    : `Release: ${STATUS_TEXT[ending.release.status]}, ${endingTime(ending.release)}, Drain: ${STATUS_TEXT[ending.drain.status]}, ${endingTime(ending.drain)}`;
                const elapsed = steep.elapsedSeconds;
                const atPlan = elapsed !== undefined && elapsed >= stage.steepSeconds;
                const steepTime = elapsed === undefined ? "elapsed unknown"
                    : `${elapsed > stage.steepSeconds ? "≥" : ""}${duration(Math.min(elapsed, stage.steepSeconds))} elapsed`;
                const fillDetail = `${stage.fillMl} ml target · ${stage.temperatureC}°C${
                    fill.measuredMl === undefined ? "" : ` · ${fill.measuredMl} ml measured`
                }`;
                const steepDetail = `${duration(stage.steepSeconds)} planned · ${steepTime}`;
                const steepNote = atPlan && steep.status === "observing"
                    ? "Planned time reached; completion not observed" : undefined;
                return (
                    <YStack key={index} gap="$2" accessible accessibilityLabel={
                        `Tea stage ${index + 1}, Fill: ${STATUS_TEXT[fill.status]}, ${fillDetail}, Steep: ${STATUS_TEXT[steep.status]}, ${steepDetail}, ${steepNote ? `${steepNote}, ` : ""}${endLabel}`
                    }>
                        <DotMatrixText fontSize={12} weight="bold" letterSpacing={1.4} color={palette.text}>
                            {`STAGE ${String(index + 1).padStart(2, "0")}`}
                        </DotMatrixText>
                        <XStack flexWrap="wrap" gap="$3">
                            <Phase label="FILL" status={fill.status} accent={accent}
                                   detail={fillDetail}/>
                            <Phase label="STEEP" status={steep.status} accent={accent}
                                   detail={steepDetail} note={steepNote}/>
                            {ending.boundary === "unknown" ? (
                                <Phase label="RELEASE + DRAIN" status={ending.combined.status}
                                       detail={endingTime(ending.combined)} accent={accent}/>
                            ) : (
                                <>
                                    <Phase label="RELEASE" status={ending.release.status}
                                           detail={endingTime(ending.release)} accent={accent}/>
                                    <Phase label="DRAIN" status={ending.drain.status}
                                           detail={endingTime(ending.drain)} accent={accent}/>
                                </>
                            )}
                        </XStack>
                    </YStack>
                );
            })}
        </YStack>
    );
}
