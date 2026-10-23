import {useAppearance} from "@/hooks/useAppearance";
import React from "react";
import {Pressable, ScrollView} from "react-native";
import {Text, XStack, YStack} from "tamagui";

import DotMatrixText from "@/components/DotMatrixText";

import type {
    TeaObservationStatus,
    TeaStageView
} from "@/library/brew/teaCycle";

export type {TeaStageView} from "@/library/brew/teaCycle";

const STATUS_TEXT: Record<TeaObservationStatus, string> = {
    "not-observed": "Not observed",
    observing: "Observing",
    paused: "Paused",
    complete: "Observed complete",
    interrupted: "Interrupted"
};

function duration(seconds: number): string {
    const whole = Math.max(0, Math.floor(seconds));
    return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

function volume(millilitres: number): string {
    return `${millilitres.toFixed(1)} ml`;
}

function Phase({label, status, detail, accent, note}: {
    label: string;
    status: TeaObservationStatus;
    detail: string;
    accent: string;
    note?: string;
}) {
    const appearance = useAppearance();
    const {palette} = appearance;
    const colour = status === "observing" ? appearance.recipe(accent).ink
        : status === "interrupted" ? palette.warn
            : status === "paused" ? palette.dim : palette.muted;
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

function endingDetail(stage: TeaStageView): string {
    const details: string[] = [];
    if (stage.ending.elapsedSeconds !== undefined) {
        details.push(`${duration(stage.ending.elapsedSeconds)} elapsed`);
    }
    if (stage.ending.releaseWaterMl !== undefined) {
        details.push(`${volume(stage.ending.releaseWaterMl)} release water`);
    }
    if (stage.ending.drainSeconds === null) details.push("drain duration unknown");
    return details.join(" · ") || "duration unknown";
}

/** Explicit observations only; the elapsed clock never advances a phase. */
export default function TeaStageLadder({
    stages, accent, selectedIndex = null, onSelectStage, scrolls = false
}: {
    stages: readonly TeaStageView[];
    accent: string;
    selectedIndex?: number | null;
    onSelectStage?: (index: number) => void;
    /** The parent owns the scroll viewport; this flag labels its contents. */
    scrolls?: boolean;
}) {
    const appearance = useAppearance();
    const {palette} = appearance;
    const rows = stages.map((stage) => {
                const {fill, steep, ending} = stage;
                const elapsed = steep.elapsedSeconds;
                const atPlan = elapsed !== undefined && elapsed >= stage.steepSeconds;
                const steepTime = elapsed === undefined ? "elapsed unknown"
                    : `${duration(elapsed)} elapsed`;
                const fillDetail = `${stage.fillMl} ml target · ${stage.temperatureC}°C${
                    fill.measuredMl === undefined ? "" : ` · ${volume(fill.measuredMl)} measured`
                }`;
                const steepDetail = `${duration(stage.steepSeconds)} planned · ${steepTime}`;
                const steepNote = atPlan && steep.status === "observing"
                    ? "Planned time reached; completion not observed" : undefined;
                const summary = `Tea stage ${stage.index + 1}, Fill: ${STATUS_TEXT[fill.status]}, `
                    + `${fillDetail}, Steep: ${STATUS_TEXT[steep.status]}, ${steepDetail}, `
                    + `${steepNote ? `${steepNote}, ` : ""}Release + drain: `
                    + `${STATUS_TEXT[ending.status]}, ${endingDetail(stage)}`;
                const row = (
                    <YStack key={stage.index} gap="$2" padding="$2"
                            borderWidth={selectedIndex === stage.index ? 1 : 0}
                            borderColor={appearance.recipe(accent).ink} borderRadius="$3">
                        <DotMatrixText fontSize={12} weight="bold" letterSpacing={1.4}
                                       color={palette.text}>
                            {`STEEP ${String(stage.index + 1).padStart(2, "0")}`}
                        </DotMatrixText>
                        <XStack flexWrap="wrap" gap="$3">
                            <Phase label="FILL" status={fill.status} accent={accent}
                                   detail={fillDetail}/>
                            <Phase label="STEEP" status={steep.status} accent={accent}
                                   detail={steepDetail} note={steepNote}/>
                            <Phase label="RELEASE + DRAIN" status={ending.status}
                                   detail={endingDetail(stage)} accent={accent}/>
                        </XStack>
                    </YStack>
                );
                return onSelectStage === undefined
                    ? <YStack key={stage.index} accessible accessibilityLabel={summary}>{row}</YStack>
                    : (
                        <Pressable key={stage.index} accessibilityRole="button"
                                   accessibilityLabel={summary}
                                   accessibilityState={{selected: selectedIndex === stage.index}}
                                   onPress={() => onSelectStage(stage.index)}>
                            {row}
                        </Pressable>
                    );
    });
    return scrolls ? (
        <ScrollView testID="tea-stage-ladder" accessibilityLabel="Scrollable tea stages"
                    style={{flex: 1}} contentContainerStyle={{gap: 16}}>
            {rows}
        </ScrollView>
    ) : (
        <YStack gap="$4" testID="tea-stage-ladder" accessibilityLabel="Tea stages">
            {rows}
        </YStack>
    );
}
