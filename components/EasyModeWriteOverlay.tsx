import React, {useEffect, useEffectEvent} from "react";
import {AccessibilityInfo, ScrollView, View} from "react-native";
import Animated, {FadeIn, FadeOut} from "react-native-reanimated";
import {Text, XStack, YStack} from "tamagui";
import type {SlotAttempt} from "@/hooks/useEasyModeSlots";
import Recipe from "@/library/Recipe";
import {resolveAccent} from "@/library/accent";
import {SLOT_NAMES, type SlotRecord} from "@/library/slots/slotModel";
import DotBloom from "@/components/DotBloom";
import DotMatrixText from "@/components/DotMatrixText";
import {palette} from "@/constants/colors";
import {DURATION, SLOT_WRITE_SUCCESS_HOLD_MS, useReducedMotion} from "@/constants/motion";

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
    const saving = !cancelling && !success && (received === 3 || attempt?.status === "saving");
    const active = record.journal?.slots[received];
    const colour = active === undefined ? palette.text
        : resolveAccent(new Recipe(undefined, active.recipeJSON));
    const title = success ? "SLOTS WRITTEN" : cancelling ? "CANCELLING THIS WRITE"
        : saving ? "SAVING" : "WRITING YOUR SLOTS";
    const announcement = !visible ? null : success ? "Slots written. A, B and C received."
        : cancelling ? "Clearing the pending write from XBRW++."
            : saving ? "Saving. A, B and C received. Waiting for the machine to finish."
                : `Writing ${SLOT_NAMES[received] ?? "A"}. ${active?.name ?? "Preparing your slots"}.`;

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
    return (
        <Animated.View testID="easy-mode-write-overlay" accessibilityViewIsModal aria-modal
            entering={FadeIn.duration(reduced ? DURATION.fast : DURATION.base)}
            exiting={FadeOut.duration(DURATION.fast)}
            style={{position: "absolute", top: 0, bottom: 0, left: 0, right: 0,
                backgroundColor: palette.base, opacity: 0.96}}>
            <ScrollView contentContainerStyle={{flexGrow: 1, justifyContent: "center",
                padding: 24, gap: 24}} contentInsetAdjustmentBehavior="automatic">
                <YStack alignItems="center" gap="$5">
                    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                        <DotBloom progress={success ? 1 : 0} size={140}/>
                    </View>
                    <DotMatrixText fontSize={18} weight="bold" color={success ? palette.success : colour}>
                        {title}
                    </DotMatrixText>
                    {!success && !saving && !cancelling && active !== undefined
                        && <Text color={palette.text} fontSize={20} textAlign="center">{active.name}</Text>}
                    {!cancelling && <XStack gap="$4" flexWrap="wrap" justifyContent="center">
                        {SLOT_NAMES.map((name, index) => {
                            const state = index < received ? "received"
                                : index === received && !saving ? "writing" : "pending";
                            return <YStack key={name} alignItems="center" gap="$2">
                                <DotMatrixText fontSize={28} weight="bold"
                                    color={index < received ? palette.success
                                        : index === received ? colour : palette.dim}>{name}</DotMatrixText>
                                <Text color={palette.text} fontSize={13}>{`${name}: ${state}`}</Text>
                            </YStack>;
                        })}
                    </XStack>}
                    <Text color={palette.dim} textAlign="center">
                        {cancelling ? "This clears the phone's record, not the machine's contents."
                            : success ? "A, B and C written. Machine switched to EASY."
                                : "Keep the app open and stay near your machine."}
                    </Text>
                </YStack>
            </ScrollView>
        </Animated.View>
    );
}
