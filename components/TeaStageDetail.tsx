import React from "react";
import {Pressable} from "react-native";
import {Text, XStack, YStack} from "tamagui";

import DotMatrixText from "@/components/DotMatrixText";
import {palette} from "@/constants/colors";
import {type TeaObservationStatus, type TeaStageView} from "@/library/brew/teaCycle";

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

function amount(value: number | undefined): string {
    return value === undefined ? "Not observed" : `${value.toFixed(1)} ml`;
}

function DetailLine({label, value, testID}: {label: string; value: string; testID?: string}) {
    return (
        <XStack justifyContent="space-between" gap="$3" testID={testID}>
            <Text color={palette.dim} fontSize={13}>{label}</Text>
            <Text color={palette.text} fontSize={13} textAlign="right">{value}</Text>
        </XStack>
    );
}

export default function TeaStageDetail({stage, accent, onClose}: {
    stage: TeaStageView;
    accent: string;
    onClose: () => void;
}) {
    const steepElapsed = stage.steep.elapsedSeconds === undefined
        ? "Elapsed unknown" : `${duration(stage.steep.elapsedSeconds)} elapsed`;
    const endingElapsed = stage.ending.elapsedSeconds === undefined
        ? "Elapsed unknown" : `${duration(stage.ending.elapsedSeconds)} elapsed`;
    return (
        <YStack testID="tea-stage-detail" backgroundColor={palette.raised}
                borderRadius="$4" padding="$3" gap="$3">
            <XStack alignItems="center" justifyContent="space-between">
                <DotMatrixText fontSize={12} weight="bold" letterSpacing={1.6}
                               color={accent}>
                    {`STEEP ${String(stage.index + 1).padStart(2, "0")}`}
                </DotMatrixText>
                <Pressable accessibilityRole="button" accessibilityLabel="Close"
                           testID="tea-stage-detail-close" onPress={onClose} hitSlop={12}>
                    <DotMatrixText fontSize={11} weight="bold" letterSpacing={2}
                                   color={palette.dim}>
                        CLOSE
                    </DotMatrixText>
                </Pressable>
            </XStack>
            <DotMatrixText fontSize={10} weight="bold" letterSpacing={1.6}
                           color={palette.dim}>
                FILL
            </DotMatrixText>
            <DetailLine label="Target" value={`${stage.fillMl} ml · ${stage.temperatureC}°C`}/>
            <DetailLine label="Measured fill" value={amount(stage.fill.measuredMl)}/>
            <DotMatrixText fontSize={10} weight="bold" letterSpacing={1.6}
                           color={palette.dim}>
                STEEP
            </DotMatrixText>
            <DetailLine label="Planned" value={duration(stage.steepSeconds)}/>
            <DetailLine label="Observed"
                        value={`${STATUS_TEXT[stage.steep.status]} · ${steepElapsed}`}/>
            <DotMatrixText fontSize={10} weight="bold" letterSpacing={1.6}
                           color={palette.dim}>
                RELEASE + DRAIN
            </DotMatrixText>
            <DetailLine label="Release water" value={amount(stage.ending.releaseWaterMl)}/>
            <DetailLine label="Combined boundary"
                        value={`${STATUS_TEXT[stage.ending.status]} · ${endingElapsed}`}/>
            <DetailLine label="Drain duration" value="Unknown"/>
        </YStack>
    );
}
