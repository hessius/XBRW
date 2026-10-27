import React from "react";
import {YStack} from "tamagui";
import Animated, {useAnimatedStyle, useFrameCallback, useSharedValue} from "react-native-reanimated";
import {useAppearance} from "@/hooks/useAppearance";
import {useReducedMotion} from "@/constants/motion";
import {EDGE_EPSILON, flickerMsFor} from "@/library/brew/grindFlicker";

export type GrindActivityBandProps = {
    /** True only after a confirmed running observation, never while starting. */
    running: boolean;
    rpm: number | null;
    /** The existing animateBrewChart preference, supplied by the owner. */
    animationEnabled: boolean;
};

export default function GrindActivityBand({running, rpm, animationEnabled}: GrindActivityBandProps) {
    const {palette, primary} = useAppearance();
    const reducedMotion = useReducedMotion();
    if (!running) return null;
    return (
        <YStack testID="grind-activity-band" accessible={false} importantForAccessibility="no-hide-descendants">
            {animationEnabled && !reducedMotion && rpm !== null
                ? <FlickeringBand half={flickerMsFor(rpm)} accent={primary.fill} muted={palette.muted}/>
                : <YStack testID="grind-activity-static" height={6} backgroundColor={primary.fill}/>}
        </YStack>
    );
}

function FlickeringBand({half, accent, muted}: {half: number; accent: string; muted: string}) {
    const lit = useSharedValue(true);
    useFrameCallback(({timeSinceFirstFrame}) => {
        lit.set(Math.floor(timeSinceFirstFrame / half + EDGE_EPSILON) % 2 === 0);
    });
    const style = useAnimatedStyle(() => ({backgroundColor: lit.get() ? accent : muted}));
    return <Animated.View testID="grind-activity-animated" style={[{height: 6}, style]}/>;
}
