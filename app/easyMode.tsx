import React, {useEffect, useRef, useState} from "react";
import {AccessibilityInfo, findNodeHandle, ScrollView} from "react-native";
import {useLocalSearchParams, useNavigation} from "expo-router";
import {useIsFocused, usePreventRemove} from "expo-router/react-navigation";
import {Button, Text, YStack} from "tamagui";
import router from "@/hooks/steadyRouter";
import {useMachine} from "@/hooks/useMachine";
import {useLiveBrew} from "@/hooks/useLiveBrew";
import {useLiveBrewBarGuard} from "@/hooks/useLiveBrewBarGuard";
import {useRecipeLibrary} from "@/hooks/useRecipeLibrary";
import {incomingEasyModeRecipe, useEasyModeSlots} from "@/hooks/useEasyModeSlots";
import EasyModeSlots, {slotWriteAvailability} from "@/components/EasyModeSlots";
import {slotOverlayVisible} from "@/components/EasyModeWriteOverlay";
import XbrwSheet from "@/components/XbrwSheet";
import ScreenHeader from "@/components/ScreenHeader";
import {palette} from "@/constants/colors";
import {isActiveBrewPhase} from "@/library/machine/Machine";
import {unavailableSlotPort} from "@/library/slots/slotWriter";
import {unwrittenSlotCount} from "@/library/slots/slotModel";

export default function EasyModeScreen() {
    const {recipeJSON} = useLocalSearchParams<{recipeJSON?: string | string[]}>();
    const navigation = useNavigation();
    const focused = useIsFocused();
    const {remembered, machine, status, slotPort} = useMachine();
    const {ratingNoteOpen} = useLiveBrew();
    const library = useRecipeLibrary();
    const actual = machine.slotIdentity ?? null;
    const deviceId = actual?.deviceId ?? remembered;
    const serial = actual?.serial ?? null;
    const slots = useEasyModeSlots(
        {deviceId, serial}, slotPort ?? unavailableSlotPort
    );
    const serialMatches = slots.record.journal?.serial == null || actual === null
        || slots.record.journal.serial === actual.serial;
    const [incoming] = useState(() => incomingEasyModeRecipe(recipeJSON));
    const [leavePrompt, setLeavePrompt] = useState<{
        deviceId: string; serial: string | null; exit: () => void
    } | null>(null);
    const writeRef = useRef<React.ComponentRef<typeof Button>>(null);
    const wasDepartureOpen = useRef(false);
    const sameMachine = leavePrompt?.deviceId === deviceId && leavePrompt.serial === serial;
    const active = slots.running || (slots.attempt !== null && slots.attempt !== undefined
        && ["writing", "saving", "cancelling"].includes(slots.attempt.status));
    const changed = unwrittenSlotCount(slots.record) > 0;
    // Never revive an old departure after a machine change or recovery operation.
    if (leavePrompt !== null && (!focused || !sameMachine || active || slots.record.journal !== null || !changed)) setLeavePrompt(null);
    const departureOpen = focused && sameMachine && !active && slots.record.journal === null && changed;
    const connected = status === "connected" && actual !== null;
    const busy = machine.phase !== undefined && isActiveBrewPhase(machine.phase);
    const availability = slotWriteAvailability({
        record: slots.record, deviceId, connected, busy, serialMatches, available: slots.available
    });
    const journal = slots.record.journal;

    function requestDeparture(navigate: () => void): void {
        if (active) return;
        if (journal !== null || !changed) {
            navigate();
            return;
        }
        if (departureOpen) return;
        let used = false;
        const exit = () => {
            if (used) return;
            used = true;
            navigate();
        };
        setLeavePrompt(was => was ?? {deviceId, serial, exit});
    }

    // The hook publishes native-stack's prevention context, including iOS swipes.
    // Replaying its original action retains the navigator's visited-route marker.
    usePreventRemove(active || (focused && journal === null && changed), ({data}) => {
        requestDeparture(() => navigation.dispatch(data.action));
    });

    const overlay = slotOverlayVisible(slots.record, slots.attempt ?? null);
    useLiveBrewBarGuard(focused, {
        covered: active || overlay || departureOpen,
        requestNavigation: requestDeparture
    });
    useEffect(() => {
        const dismissed = wasDepartureOpen.current && !departureOpen;
        wasDepartureOpen.current = departureOpen;
        if (!dismissed || !focused || active || overlay || ratingNoteOpen) return;
        const frame = requestAnimationFrame(() => {
            const target = writeRef.current;
            if (target !== null && "nodeType" in target) {
                target.focus();
                return;
            }
            const handle = findNodeHandle(target);
            if (handle !== null) AccessibilityInfo.setAccessibilityFocus(handle);
        });
        return () => cancelAnimationFrame(frame);
    }, [departureOpen, focused, active, overlay, ratingNoteOpen]);

    function stay(): void {
        setLeavePrompt(null);
    }

    function leave(): void {
        if (!departureOpen) return;
        const exit = leavePrompt?.exit;
        setLeavePrompt(null);
        exit?.();
    }

    function write(): void {
        if (!departureOpen || availability !== null) return;
        stay();
        void slots.write();
    }

    return (
        <YStack flex={1} backgroundColor={palette.base}
                accessibilityElementsHidden={ratingNoteOpen}
                importantForAccessibility={ratingNoteOpen ? "no-hide-descendants" : "auto"}>
            <YStack testID="easy-mode-screen" flex={1}
                accessibilityElementsHidden={departureOpen || ratingNoteOpen}
                importantForAccessibility={departureOpen || ratingNoteOpen ? "no-hide-descendants" : "auto"}
                pointerEvents={departureOpen ? "none" : "auto"}>
            <EasyModeSlots record={slots.record} recipes={library.allRecipes()}
                           header={<>
                               <ScreenHeader title="EASY MODE" onBack={() => router.back()}/>
                               {incoming.error !== null && (
                                   <Text selectable accessibilityRole="alert" color={palette.danger} padding="$4">
                                       {incoming.error}
                                   </Text>
                               )}
                           </>}
                           incoming={incoming.recipe} deviceId={deviceId} serial={serial}
                           connected={connected} busy={busy}
                           serialMatches={serialMatches} available={slots.available}
                           running={slots.running} error={slots.error}
                           guardLiveBrewBar={focused}
                           attempt={slots.attempt} onDismissSuccess={slots.resetAttempt}
                           writeControlRef={writeRef}
                           onAssign={slots.assign} onWrite={slots.write}
                           onRecover={slots.recover} onCancel={slots.cancel}/>
            </YStack>
            <XbrwSheet open={departureOpen} onOpenChange={open => { if (!open) stay(); }}
                title="Not on the machine yet" heightPercent={70}>
                <ScrollView contentContainerStyle={{gap: 16}}
                    accessibilityElementsHidden={!departureOpen}
                    importantForAccessibility={departureOpen ? "auto" : "no-hide-descendants"}
                    pointerEvents={departureOpen ? "auto" : "none"}>
                    <Text color={palette.text}>
                        Your changes are kept here. Write them when you want to use them on your machine.
                    </Text>
                    {availability !== null && <Text color={palette.dim}>{availability}</Text>}
                    <Button height="auto" minHeight="$4" paddingVertical="$3"
                        disabled={availability !== null} onPress={write}>WRITE TO MACHINE</Button>
                    <Button height="auto" minHeight="$4" paddingVertical="$3" onPress={leave}>LEAVE FOR NOW</Button>
                    <Button height="auto" minHeight="$4" paddingVertical="$3" onPress={stay}>Stay here</Button>
                </ScrollView>
            </XbrwSheet>
        </YStack>
    );
}
