import React, {useEffect} from "react";
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withSequence,
    withTiming
} from "react-native-reanimated";

import {EASING, TOOL_MOTION, useReducedMotion} from "@/constants/motion";

export type ToolHeadShakeViewProps = {
    shakeKey: number;
    testID?: string;
    children: React.ReactNode;
};

/**
 * Horizontal refusal shake ("Mac password shake") for blocked departure or tool switches.
 * Degrades cleanly to an opacity pulse when Reduced Motion is active.
 */
export default function ToolHeadShakeView({shakeKey, testID, children}: ToolHeadShakeViewProps) {
    const reduced = useReducedMotion();
    const translateX = useSharedValue(0);
    const pulseOpacity = useSharedValue(1);

    useEffect(() => {
        if (shakeKey <= 0) return;
        if (reduced) {
            translateX.value = 0;
            pulseOpacity.value = withSequence(
                withTiming(0.55, {duration: TOOL_MOTION.reducedPulseMs, easing: EASING.out}),
                withTiming(1, {duration: TOOL_MOTION.reducedPulseMs, easing: EASING.out})
            );
            return;
        }
        const stepDuration = Math.max(
            40,
            Math.round(TOOL_MOTION.headShakeDurationMs / TOOL_MOTION.headShakeOffsets.length)
        );
        pulseOpacity.value = 1;
        translateX.value = withSequence(
            ...TOOL_MOTION.headShakeOffsets.map((offset) =>
                withTiming(offset, {duration: stepDuration, easing: EASING.inOut})
            )
        );
    }, [shakeKey, reduced, translateX, pulseOpacity]);

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [{translateX: translateX.value}],
        opacity: pulseOpacity.value
    }));

    return (
        <Animated.View testID={testID} style={animatedStyle}>
            {children}
        </Animated.View>
    );
}
