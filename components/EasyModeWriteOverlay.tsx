import React, {useEffect, useEffectEvent, useState} from "react";
import {AccessibilityInfo, AppState, ScrollView, View} from "react-native";
import Animated, {FadeIn} from "react-native-reanimated";
import {Text, XStack, YStack} from "tamagui";
import type {SlotAttempt} from "@/hooks/useEasyModeSlots";
import Recipe from "@/library/Recipe";
import {resolveAccent} from "@/library/accent";
import {SLOT_NAMES, type SlotRecord} from "@/library/slots/slotModel";
import DotBloom from "@/components/DotBloom";
import DotMatrixText from "@/components/DotMatrixText";
import {palette} from "@/constants/colors";
import {
    DURATION, EASING, SLOT_WRITE_ESTIMATE_MS, SLOT_WRITE_ESTIMATE_TICK_MS,
    SLOT_WRITE_SUCCESS_HOLD_MS, useReducedMotion
} from "@/constants/motion";

export type EasyModeWriteOverlayProps = {
    record: SlotRecord;
    attempt: SlotAttempt | null;
    onDismissSuccess?: () => void;
};

export function slotOverlayVisible(record: SlotRecord, attempt: SlotAttempt | null): boolean {
    return attempt !== null && (
        ["writing", "saving", "cancelling"].includes(attempt.status)
        || (attempt.status === "success" && attempt.operation !== "cancel"
            && record.journal === null && record.written !== null)
    );
}

export default function EasyModeWriteOverlay({record, attempt, onDismissSuccess}: EasyModeWriteOverlayProps) {
    const reduced = useReducedMotion();
    const visible = slotOverlayVisible(record, attempt);
    const success = visible && attempt?.status === "success";
    const cancelling = attempt?.operation === "cancel";
    const received = success ? 3 : record.journal?.acknowledged ?? 0;
    const saving = !cancelling && !success && received === 3;
    const active = record.journal?.slots[received];
    const colour = active === undefined ? palette.text
        : resolveAccent(new Recipe(undefined, active.recipeJSON));
    const title = success ? "SLOTS WRITTEN" : cancelling ? "CANCELLING THIS WRITE"
        : saving ? "SAVING" : "WRITING YOUR SLOTS";
    const announcement = !visible ? null : success ? "Slots written. A, B and C received."
        : cancelling ? "Clearing the pending write from XBRW++."
            : saving ? "Saving. A, B and C received. Waiting for the machine to finish."
                : `Writing ${SLOT_NAMES[received] ?? "A"}. ${active?.name ?? "Preparing your slots"}.`;
    const estimateKey = visible && !success && !saving && !cancelling
        ? JSON.stringify([attempt?.deviceId, attempt?.serial, attempt?.operation, record.journal?.id, received])
        : null;
    const [estimate, setEstimate] = useState<{key: string; fraction: number} | null>(null);
    // Retire the old slice during render, not from an effect. Retry never inherits its clock.
    if (estimate !== null && estimate.key !== estimateKey) setEstimate(null);
    const fraction = !reduced && estimate?.key === estimateKey ? estimate?.fraction ?? 0 : 0;
    const progress = success ? 1 : saving && received === 3 ? 23 / 24 : cancelling ? 0
        : (received + fraction * 0.85) / 3;

    useEffect(() => {
        if (estimateKey === null || reduced || AppState.currentState !== "active") return;
        let elapsed = 0;
        let stopped = false;
        let timer: ReturnType<typeof setTimeout>;
        const tick = () => {
            if (stopped) return;
            elapsed += SLOT_WRITE_ESTIMATE_TICK_MS;
            setEstimate({key: estimateKey, fraction: EASING.slotEstimate(Math.min(elapsed / SLOT_WRITE_ESTIMATE_MS, 1))});
            if (elapsed < SLOT_WRITE_ESTIMATE_MS) timer = setTimeout(tick, SLOT_WRITE_ESTIMATE_TICK_MS);
        };
        const stop = () => {
            stopped = true;
            clearTimeout(timer);
        };
        timer = setTimeout(tick, SLOT_WRITE_ESTIMATE_TICK_MS);
        const subscription = AppState.addEventListener("change", state => {
            if (state !== "active") stop();
        });
        return () => {
            stop();
            subscription.remove();
        };
    }, [estimateKey, reduced]);

    useEffect(() => {
        if (announcement !== null) AccessibilityInfo.announceForAccessibility(announcement);
    }, [announcement]);
    const dismiss = useEffectEvent(() => onDismissSuccess?.());
    useEffect(() => {
        if (!success) return;
        const timer = setTimeout(dismiss, SLOT_WRITE_SUCCESS_HOLD_MS);
        return () => clearTimeout(timer);
    }, [success]);

    if (!visible) return null;
    // No exit retention: the host restores focus on the next frame after dismissal.
    return (
        <Animated.View testID="easy-mode-write-overlay" accessibilityViewIsModal aria-modal
            entering={FadeIn.duration(reduced ? DURATION.fast : DURATION.base)}
            style={{position: "absolute", top: 0, bottom: 0, left: 0, right: 0,
                backgroundColor: palette.base, opacity: 0.96}}>
            <ScrollView contentContainerStyle={{flexGrow: 1, justifyContent: "center",
                padding: 26, gap: 20}} contentInsetAdjustmentBehavior="automatic">
                <YStack alignItems="center" gap="$4">
                    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                        <DotBloom progress={progress} size={140}/>
                    </View>
                    <DotMatrixText fontSize={18} weight="bold" color={success ? palette.success : colour}>
                        {title}
                    </DotMatrixText>
                    {!cancelling && <XStack gap="$4" flexWrap="wrap" justifyContent="center">
                        {SLOT_NAMES.map((name, index) => {
                            const state = index < received ? "received"
                                : index === received && !saving ? "writing" : "pending";
                            const snapshot = (success ? record.written?.slots : record.journal?.slots)?.[index];
                            const stepColour = index <= received && snapshot !== undefined
                                ? resolveAccent(new Recipe(undefined, snapshot.recipeJSON)) : palette.dim;
                            return <YStack key={name} alignItems="center" gap="$2">
                                <DotMatrixText fontSize={38} weight="bold"
                                    color={stepColour}>{name}</DotMatrixText>
                                <Text color={palette.text} fontSize={13}>{`${name}: ${state}`}</Text>
                            </YStack>;
                        })}
                    </XStack>}
                    {!success && !saving && !cancelling && active !== undefined
                        && <Text color={palette.text} fontSize={16} fontWeight="600" textAlign="center">{active.name}</Text>}
                    <Text color={palette.dim} fontSize={14} textAlign="center">
                        {cancelling ? "This clears the phone's record, not the machine's contents."
                            : success ? "A, B and C written. Machine switched to EASY."
                                : "Keep the app open and stay near your machine."}
                    </Text>
                    {!success && !cancelling && <Text color={palette.dim} fontSize={12} textAlign="center">
                        {saving ? "All three received. Waiting for save confirmation."
                            : "Bloom motion is estimated. Letters change only when received."}
                    </Text>}
                </YStack>
            </ScrollView>
        </Animated.View>
    );
}
