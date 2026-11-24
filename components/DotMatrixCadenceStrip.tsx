import React, {useEffect} from "react";
import Animated, {
    cancelAnimation,
    type SharedValue,
    useAnimatedStyle,
    useSharedValue,
    withRepeat,
    withTiming
} from "react-native-reanimated";
import {XStack} from "tamagui";

import {EASING, TOOL_MOTION, useReducedMotion} from "@/constants/motion";
import {useAppearance} from "@/hooks/useAppearance";
import type {ControlPhase} from "@/library/machine/controlModel";

export type CadenceMode = "idle" | "switching" | "running" | "stopping";

export function cadenceModeForPhase(phase: ControlPhase): CadenceMode {
    if (phase === "entering" || phase === "leaving" || phase === "applying") return "switching";
    if (phase === "running" || phase === "starting") return "running";
    if (phase === "stopping" || phase === "unknown") return "stopping";
    return "idle";
}

function cycleFor(mode: CadenceMode): number {
    if (mode === "switching") return TOOL_MOTION.switchingCycleMs;
    if (mode === "running") return TOOL_MOTION.runningCycleMs;
    if (mode === "stopping") return TOOL_MOTION.stoppingCycleMs;
    return TOOL_MOTION.runningCycleMs;
}

const DOT_INDICES = Array.from({length: TOOL_MOTION.dotCount}, (_, index) => index);

type DotProps = {
    index: number;
    colour: string;
    active: boolean;
    reduced: boolean;
    cycleMs: number;
    progress: SharedValue<number>;
};

function CadenceDot({index, colour, active, reduced, cycleMs, progress}: DotProps) {
    const animatedStyle = useAnimatedStyle(() => {
        if (!active) {
            return {opacity: 0.45, transform: [{scaleY: 0.9}]};
        }
        if (reduced) {
            return {opacity: 0.85, transform: [{scaleY: 1}]};
        }
        const phaseShift = (index * TOOL_MOTION.waveStepMs) / cycleMs;
        const local = (((progress.value - phaseShift) % 1) + 1) % 1;
        const peak = local < 0.45 ? local / 0.45 : 1 - (local - 0.45) / 0.55;
        return {
            opacity: 0.24 + 0.76 * peak,
            transform: [{scaleY: 0.78 + 0.42 * peak}]
        };
    });

    return (
        <Animated.View
            testID="cadence-dot"
            style={[
                {
                    flex: 1,
                    height: 5,
                    borderRadius: 2,
                    backgroundColor: colour
                },
                animatedStyle
            ]}
        />
    );
}

export type DotMatrixCadenceStripProps = {
    phase: ControlPhase;
    testID?: string;
};

/** 16-dot hardware wave strip conveying tool transition/running/stopping cadence cleanly. */
export default function DotMatrixCadenceStrip({
    phase,
    testID = "tool-cadence-strip"
}: DotMatrixCadenceStripProps) {
    const {palette} = useAppearance();
    const reduced = useReducedMotion();
    const mode = cadenceModeForPhase(phase);
    const active = mode !== "idle";
    const cycleMs = cycleFor(mode);
    const progress = useSharedValue(0);

    useEffect(() => {
        if (!active || reduced) {
            cancelAnimation(progress);
            progress.value = withTiming(0, {duration: TOOL_MOTION.reducedPulseMs, easing: EASING.out});
            return;
        }
        progress.value = 0;
        progress.value = withRepeat(
            withTiming(1, {duration: cycleMs, easing: EASING.linear}),
            -1,
            false
        );
        return () => cancelAnimation(progress);
    }, [active, reduced, cycleMs, progress]);

    const colour = mode === "switching"
        ? palette.warn
        : mode === "running"
            ? palette.success
            : mode === "stopping"
                ? palette.danger
                : palette.line;

    return (
        <XStack
            testID={testID}
            gap="$1"
            paddingTop="$1"
            alignItems="center"
            accessible={false}
            importantForAccessibility="no-hide-descendants">
            {DOT_INDICES.map((index) => (
                <CadenceDot
                    key={index}
                    index={index}
                    colour={colour}
                    active={active}
                    reduced={reduced}
                    cycleMs={cycleMs}
                    progress={progress}
                />
            ))}
        </XStack>
    );
}
