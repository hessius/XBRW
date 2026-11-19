import React, {useEffect, useId} from "react";
import {StyleSheet, View} from "react-native";
import Animated, {
    cancelAnimation,
    Easing,
    type SharedValue,
    useAnimatedStyle,
    useSharedValue,
    withRepeat,
    withTiming
} from "react-native-reanimated";
import Svg, {Circle, Defs, Pattern, Rect} from "react-native-svg";
import {XStack, YStack} from "tamagui";

import DotMatrixCadenceStrip from "@/components/DotMatrixCadenceStrip";
import DotMatrixText from "@/components/DotMatrixText";
import {mix} from "@/constants/colors";
import {useReducedMotion} from "@/constants/motion";
import {useAppearance} from "@/hooks/useAppearance";
import {flickerMsFor} from "@/library/brew/grindFlicker";
import type {ControlPhase, ToolId} from "@/library/machine/controlModel";

export type ToolHeroStageVariant = "full" | "inline";

const BURR_INDICES = Array.from({length: 12}, (_, index) => index);
const SPARK_SLOT_COUNT = 12;

export type ToolHeroStageProps = {
    tool: ToolId;
    phase: ControlPhase;
    variant?: ToolHeroStageVariant;
    kicker: string;
    value: number | string | null;
    unit?: string;
    unavailable?: string;
    subLeft: string;
    subRight?: string | null;
    burr?: {running: boolean; rpm: number | null; animationEnabled: boolean};
    scaleSamples?: readonly number[];
    vessel?: {targetMl: number; dispensedMl: number | null; active: boolean};
};

function statusBadge(tool: ToolId, phase: ControlPhase): {
    label: string;
    detail?: string;
    tone: "warn" | "success" | "danger" | "ready";
} {
    if (phase === "entering") return {label: "SWITCHING", detail: `TO ${tool.toUpperCase()}…`, tone: "warn"};
    if (phase === "leaving" || phase === "applying") return {label: phase.toUpperCase(), tone: "warn"};
    if (phase === "stopping") return {label: "STOPPING", tone: "danger"};
    if (phase === "unknown") return {label: "UNKNOWN", tone: "danger"};
    if (phase === "starting") return {label: "STARTING", tone: "success"};
    if (phase === "running") {
        if (tool === "grind") return {label: "GRINDING", tone: "success"};
        if (tool === "pour") return {label: "POURING", tone: "success"};
        return {label: "LIVE SCALE", tone: "success"};
    }
    return {label: tool === "scale" ? "LIVE SCALE" : "READY", tone: "ready"};
}

function BurrDot({index, progress, accent, restingOpacity}: {
    index: number;
    progress: SharedValue<number>;
    accent: string;
    restingOpacity: number;
}) {
    const isOdd = index % 2 === 1;
    const style = useAnimatedStyle(() => {
        const firstHalf = progress.value < 0.5;
        const active = isOdd ? firstHalf : !firstHalf;
        return {opacity: active ? 1 : restingOpacity};
    });
    return (
        <Animated.View
            style={[
                {flex: 1, height: 7, borderRadius: 2, backgroundColor: accent},
                style
            ]}
        />
    );
}

function BurrFlickerAnimated({rpm, accent}: {rpm: number; accent: string}) {
    const progress = useSharedValue(0);
    const periodMs = flickerMsFor(rpm) * 2;

    useEffect(() => {
        progress.value = 0;
        progress.value = withRepeat(
            withTiming(1, {duration: periodMs, easing: Easing.linear}),
            -1,
            false
        );
        return () => {
            cancelAnimation(progress);
        };
    }, [periodMs, progress]);

    return (
        <XStack testID="grind-activity-animated" gap="$1.5" marginTop="$1.5">
            {BURR_INDICES.map((index) => (
                <BurrDot key={index} index={index} progress={progress} accent={accent} restingOpacity={0.22}/>
            ))}
        </XStack>
    );
}

function BurrFlickerRow({running, rpm, accent, animationEnabled}: {
    running: boolean;
    rpm: number | null;
    accent: string;
    animationEnabled: boolean;
}) {
    const reducedMotion = useReducedMotion();
    const animated = running && animationEnabled && !reducedMotion && rpm !== null;

    if (!running) {
        return (
            <XStack testID="grind-burr-matrix" gap="$1.5" marginTop="$1.5" accessible={false}
                    importantForAccessibility="no-hide-descendants">
                {BURR_INDICES.map((index) => (
                    <YStack key={index} flex={1} height={7} borderRadius="$1"
                            backgroundColor={accent} opacity={0.3}/>
                ))}
            </XStack>
        );
    }

    return (
        <YStack testID="grind-activity-band" accessible={false} importantForAccessibility="no-hide-descendants">
            {animated ? (
                <BurrFlickerAnimated rpm={rpm} accent={accent}/>
            ) : (
                <XStack testID="grind-activity-static" gap="$1.5" marginTop="$1.5">
                    {BURR_INDICES.map((index) => (
                        <YStack key={index} flex={1} height={7} borderRadius="$1" backgroundColor={accent} opacity={0.95}/>
                    ))}
                </XStack>
            )}
        </YStack>
    );
}

function ScaleSparkline({samples, accent, restingColour}: {
    samples: readonly number[];
    accent: string;
    restingColour: string;
}) {
    if (samples.length < 2) {
        return (
            <XStack testID="scale-spark-baseline" gap="$1" alignItems="flex-end" height={20} marginTop="$1.5"
                    accessible={false} importantForAccessibility="no-hide-descendants">
                {BURR_INDICES.map((index) => (
                    <YStack key={index} flex={1} height={4} borderRadius="$1" backgroundColor={restingColour} opacity={0.6}/>
                ))}
            </XStack>
        );
    }

    const padded = samples.slice(-SPARK_SLOT_COUNT);
    const min = Math.min(...padded);
    const max = Math.max(...padded);
    const span = max - min;
    const heights = padded.map((sample) => {
        if (span <= 0.05) return 55;
        return Math.round(24 + ((sample - min) / span) * 70);
    });

    return (
        <XStack testID="scale-spark-bars" gap="$1" alignItems="flex-end" height={22} marginTop="$1.5"
                accessible={false} importantForAccessibility="no-hide-descendants">
            {heights.map((pct, index) => (
                <YStack key={index} flex={1} height={`${pct}%`} borderRadius="$1"
                        backgroundColor={accent} opacity={0.85}/>
            ))}
        </XStack>
    );
}

function PourVesselMeter({targetMl, dispensedMl, active, accent, trackBg, trackBorder, patternId}: {
    targetMl: number;
    dispensedMl: number | null;
    active: boolean;
    accent: string;
    trackBg: string;
    trackBorder: string;
    patternId: string;
}) {
    const ratio = !active
        ? 1
        : dispensedMl === null || !Number.isFinite(dispensedMl) || targetMl <= 0
            ? 0
            : Math.min(1, Math.max(0, dispensedMl / targetMl));
    const widthPct = `${Math.round(ratio * 100)}%` as `${number}%`;

    return (
        <YStack testID="pour-vessel-meter" height={14} borderRadius="$3" backgroundColor={trackBg}
                borderWidth={1} borderColor={trackBorder} overflow="hidden" marginTop="$1.5"
                accessible={false} importantForAccessibility="no-hide-descendants">
            {ratio > 0 && (
                <YStack width={widthPct} height="100%" opacity={active ? 1 : 0.45}
                        borderRightWidth={2} borderRightColor={accent} overflow="hidden">
                    <Svg width="100%" height="100%" pointerEvents="none">
                        <Defs>
                            <Pattern id={patternId} width={5} height={5} patternUnits="userSpaceOnUse">
                                <Circle cx={2} cy={2} r={1.35} fill={accent}/>
                            </Pattern>
                        </Defs>
                        <Rect x={0} y={0} width="100%" height="100%" fill={`url(#${patternId})`}/>
                    </Svg>
                </YStack>
            )}
        </YStack>
    );
}

/**
 * Shared top telemetry stage for both Home Inline (`variant="inline"`, flat machine-green card)
 * and Unified Full Tool (`variant="full"`, 1.5px `#FF007F` rim + SVG dot-grid, strictly zero sheen).
 */
export default function ToolHeroStage({
    tool,
    phase,
    variant = "full",
    kicker,
    value,
    unit,
    unavailable = "—",
    subLeft,
    subRight = null,
    burr,
    scaleSamples = [],
    vessel
}: ToolHeroStageProps) {
    const {palette, scheme} = useAppearance();
    const uid = useId();
    const gridId = `hero-dots-${uid.replace(/[^a-zA-Z0-9_-]/g, "")}`;
    const vesselId = `vessel-dots-${uid.replace(/[^a-zA-Z0-9_-]/g, "")}`;
    const isFull = variant === "full";
    const accent = isFull ? palette.brand : palette.success;

    const containerBg = isFull ? palette.surface : palette.raised;
    const containerBorder = isFull
        ? palette.brand
        : mix(palette.raised, palette.success, 0.42);
    const borderWidth = isFull ? 1.5 : 1;
    const radius = isFull ? 18 : 14;

    const badge = statusBadge(tool, phase);
    const badgeDotColour = badge.tone === "warn"
        ? palette.warn
        : badge.tone === "danger"
            ? palette.danger
            : palette.success;
    const badgeTextColour = badge.tone === "warn"
        ? palette.warn
        : badge.tone === "danger"
            ? palette.danger
            : badge.tone === "success"
                ? palette.success
                : palette.dim;

    const available = value !== null;
    const spoken = available ? `${value}${unit ? ` ${unit}` : ""}` : "Unavailable";
    const primaryFontSize = isFull ? (available ? 54 : 22) : (available ? 36 : 18);
    const unitFontSize = isFull ? 19 : 14;

    const containerStyle = [
        {borderWidth, borderColor: containerBorder},
        isFull
            ? {
                shadowColor: palette.brand,
                shadowOpacity: scheme === "dark" ? 0.18 : 0.08,
                shadowRadius: 16,
                shadowOffset: {width: 0, height: 0}
            }
            : undefined
    ];

    return (
        <YStack
            testID="tool-hero-stage"
            backgroundColor={containerBg}
            borderRadius={radius}
            paddingHorizontal={isFull ? "$4" : "$3"}
            paddingVertical={isFull ? "$3.5" : "$2.5"}
            gap="$1"
            style={containerStyle}>
            {isFull && (
                <View pointerEvents="none" style={[StyleSheet.absoluteFillObject, {borderRadius: radius - 2, overflow: "hidden"}]}>
                    <Svg width="100%" height="100%">
                        <Defs>
                            <Pattern id={gridId} width={10} height={10} patternUnits="userSpaceOnUse">
                                <Circle cx={2.5} cy={2.5} r={1} fill={palette.brand} opacity={0.14}/>
                            </Pattern>
                        </Defs>
                        <Rect x={0} y={0} width="100%" height="100%" fill={`url(#${gridId})`}/>
                    </Svg>
                </View>
            )}

            <YStack testID="machine-control-readout" accessible accessibilityRole="text"
                    accessibilityLabel={`${kicker}: ${spoken}`} accessibilityLiveRegion="none" gap="$1">
                <XStack alignItems="center" justifyContent="space-between" gap="$2">
                    <DotMatrixText fontSize={11} weight="bold" letterSpacing={1.2} color={palette.muted}>
                        {kicker}
                    </DotMatrixText>
                    <XStack alignItems="center" gap="$1.5">
                        <YStack width={7} height={7} borderRadius={4} backgroundColor={badgeDotColour}/>
                        <DotMatrixText fontSize={11} weight="bold" letterSpacing={1.4} color={badgeTextColour}>
                            {badge.label}
                        </DotMatrixText>
                        {badge.detail !== undefined && (
                            <DotMatrixText fontSize={11} weight="bold" letterSpacing={1.2} color={badgeTextColour}>
                                {badge.detail}
                            </DotMatrixText>
                        )}
                    </XStack>
                </XStack>

                <XStack alignItems="baseline" gap="$1.5" flexWrap="wrap">
                    <DotMatrixText
                        testID="machine-control-value"
                        fontSize={primaryFontSize}
                        weight="extrabold"
                        color={available ? palette.text : palette.muted}
                        style={{flexShrink: 1}}>
                        {available ? String(value) : unavailable}
                    </DotMatrixText>
                    {available && unit !== undefined && unit !== "" && (
                        <DotMatrixText fontSize={unitFontSize} weight="bold" color={accent}>
                            {unit.toUpperCase()}
                        </DotMatrixText>
                    )}
                </XStack>
            </YStack>

            {tool === "grind" && burr && (
                <BurrFlickerRow running={burr.running} rpm={burr.rpm} accent={accent} animationEnabled={burr.animationEnabled}/>
            )}
            {tool === "scale" && (
                <ScaleSparkline samples={scaleSamples} accent={accent} restingColour={palette.line}/>
            )}
            {tool === "pour" && vessel !== undefined && (
                <PourVesselMeter
                    targetMl={vessel.targetMl}
                    dispensedMl={vessel.dispensedMl}
                    active={vessel.active}
                    accent={accent}
                    trackBg={mix(containerBg, palette.text, 0.06)}
                    trackBorder={mix(containerBg, palette.text, 0.12)}
                    patternId={vesselId}
                />
            )}

            <DotMatrixCadenceStrip phase={phase}/>

            <XStack gap="$4" paddingTop="$1" flexWrap="wrap">
                <DotMatrixText fontSize={11} weight="bold" letterSpacing={1.2} color={palette.dim}>
                    {subLeft}
                </DotMatrixText>
                {subRight !== null && subRight !== undefined && subRight !== "" && (
                    <DotMatrixText fontSize={11} weight="bold" letterSpacing={1.2} color={palette.dim}>
                        {subRight}
                    </DotMatrixText>
                )}
            </XStack>
        </YStack>
    );
}
