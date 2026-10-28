import {useAppearance} from "@/hooks/useAppearance";
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
import {useEasyModePlacement} from "@/hooks/useEasyModePlacement";
import EasyModeSlots, {slotWriteAvailability} from "@/components/EasyModeSlots";
import {slotOverlayVisible} from "@/components/EasyModeWriteOverlay";
import XbrwSheet from "@/components/XbrwSheet";
import ScreenHeader from "@/components/ScreenHeader";

import DotMatrixText from "@/components/DotMatrixText";
import FillLabel from "@/components/FillLabel";
import {isActiveBrewPhase} from "@/library/machine/Machine";
import {unavailableSlotPort} from "@/library/slots/slotWriter";
import {SLOT_NAMES, unwrittenSlotCount} from "@/library/slots/slotModel";
import {notify} from "@/components/XbrwToast";
import {STABLE_HOST} from "@/constants/views";
import {sharedSettings, useSetting} from "@/hooks/useSetting";
import {realLibraryDeps} from "@/library/roasterSync";
import {
    saveRoasterChoice, SlotRecipeError, subscribedCatalogues, type RoasterRecipeChoice
} from "@/library/roasterSearch";
import type {SlotIndex} from "@/library/slots/slotModel";
import {asMachineModel} from "@/library/machine/machineModel";

export default function EasyModeScreen() {
    const appearance = useAppearance();
    const {palette} = appearance;
    const {primary} = appearance;
    const {recipeJSON, place, placeDeviceId} = useLocalSearchParams<{
        recipeJSON?: string | string[]; place?: string; placeDeviceId?: string
    }>();
    const navigation = useNavigation();
    const focused = useIsFocused();
    const [selectedModel] = useSetting("machineModel");
    const [easyModeOneTapWrite] = useSetting("easyModeOneTapWrite");
    const machineModel = asMachineModel(selectedModel);
    const {remembered, machine, status, slotPort, connect} = useMachine();
    const {ratingNoteOpen} = useLiveBrew();
    const library = useRecipeLibrary();
    const actual = machine.slotIdentity ?? null;
    const deviceId = actual?.deviceId ?? remembered;
    const serial = actual?.serial ?? null;
    const slots = useEasyModeSlots(
        {deviceId, serial}, slotPort ?? unavailableSlotPort
    );
    const retainedSerial = slots.record.journal?.serial
        ?? (slots.record.experiment?.phase === "active" ? slots.record.experiment.serial : null);
    const serialMatches = retainedSerial == null || actual === null || retainedSerial === actual.serial;
    const [incoming] = useState(() => incomingEasyModeRecipe(recipeJSON));
    const placement = useEasyModePlacement({
        enabled: easyModeOneTapWrite && place === "1" && remembered !== "" && placeDeviceId === remembered
            && deviceId === remembered && focused,
        recipe: incoming.recipe, deviceId, serial, serialMatches, machine, connect, slots
    });
    // Read once from the cached feeds: opening or searching the picker costs
    // no request. A recipe is fetched only when one is picked.
    const [roasterCatalogues] = useState(() => subscribedCatalogues(sharedSettings()));
    const [libraryDeps] = useState(() => realLibraryDeps(sharedSettings()));
    const [leavePrompt, setLeavePrompt] = useState<{
        deviceId: string; serial: string | null; exit: () => void
    } | null>(null);
    const writeRef = useRef<React.ComponentRef<typeof Button>>(null);
    const wasDepartureOpen = useRef(false);
    const sameMachine = leavePrompt?.deviceId === deviceId && leavePrompt.serial === serial;
    const active = placement.pending || slots.running || (slots.attempt !== null && slots.attempt !== undefined
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

    /**
     * FROM YOUR ROASTERS: fetch the recipe, keep it in the library (as ADD TO
     * SHELF does), then assign the library's copy so the slot's link holds.
     */
    async function assignRoaster(
        index: SlotIndex, choice: RoasterRecipeChoice, signal: AbortSignal
    ): Promise<{ok: true} | {ok: false; message?: string}> {
        let recipe;
        try {
            recipe = await saveRoasterChoice(choice, libraryDeps, sharedSettings(), signal);
        } catch (error) {
            if (signal.aborted) return {ok: false};
            return {ok: false, message: error instanceof SlotRecipeError
                ? error.message : "Couldn't load or save that recipe. Try again."};
        }
        if (signal.aborted) return {ok: false};
        library.refresh();
        // A refusal is reported by the slot hook, which the picker already shows.
        return slots.assign(index, recipe) ? {ok: true} : {ok: false};
    }

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
        <YStack {...STABLE_HOST} flex={1} backgroundColor={palette.base}
                accessibilityElementsHidden={ratingNoteOpen}
                importantForAccessibility={ratingNoteOpen ? "no-hide-descendants" : "auto"}>
            <YStack {...STABLE_HOST} testID="easy-mode-screen" flex={1}
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
                               {placement.notice !== null && <Text testID="easy-mode-place-notice"
                                   selectable accessibilityRole="alert" color={palette.danger} padding="$4">
                                   {placement.notice}
                               </Text>}
                               {easyModeOneTapWrite && place === "1"
                                   && (placeDeviceId !== remembered || deviceId !== remembered) && (
                                   <Text accessibilityRole="alert" color={palette.danger} padding="$4">
                                       This placement was opened for a different machine. Choose the machine and try again.
                                   </Text>
                               )}
                           </>}
                           incoming={placement.placing || placement.index === null ? incoming.recipe : undefined}
                           placing={placement.placing ? {
                               pending: placement.pending, connecting: placement.connecting,
                               onPlace: index => void placement.place(index)
                           } : undefined}
                           deviceId={deviceId} serial={serial}
                           connected={connected} busy={busy}
                           serialMatches={serialMatches} available={slots.available}
                           running={slots.running} error={slots.error}
                           guardLiveBrewBar={focused}
                           attempt={slots.attempt} onDismissSuccess={() => {
                               slots.resetAttempt();
                               if (placement.confirmed && incoming.recipe !== undefined && placement.index !== null) {
                                   notify({tone: "success",
                                       message: `Written. ${incoming.recipe.displayName()} is in slot ${SLOT_NAMES[placement.index]}.`});
                                   router.back();
                               }
                           }}
                           writeControlRef={writeRef}
                           onRestoreOriginal={() => void slots.restoreTeaOriginal()}
                           onDismissWrite={() => void slots.dismissWrite()}
                           onAssign={slots.assign} onWrite={slots.write}
                           roasterCatalogues={roasterCatalogues} onAssignRoaster={assignRoaster}
                           machineModel={machineModel} lookupEnabled={focused}
                           onSetScaleEnabled={slots.setScaleEnabled}
                           onRecover={slots.recover} onCancel={slots.cancel}/>
            </YStack>
            <XbrwSheet open={departureOpen} onOpenChange={open => { if (!open) stay(); }}
                title="BEFORE YOU LEAVE" heightPercent={60}>
                <ScrollView {...STABLE_HOST} contentContainerStyle={{gap: 16}}
                    accessibilityElementsHidden={!departureOpen}
                    importantForAccessibility={departureOpen ? "auto" : "no-hide-descendants"}
                    pointerEvents={departureOpen ? "auto" : "none"}>
                    <Text color={palette.text} fontSize={23} fontWeight="600">Not on the machine yet</Text>
                    <Text color={palette.dim} fontSize={14}>
                        Your changes are kept here. Write them when you want to use them on your machine.
                    </Text>
                    {availability !== null && <Text color={palette.dim}>{availability}</Text>}
                    <Button height="auto" minHeight="$4" paddingVertical="$3"
                        backgroundColor={primary.fill} color={primary.ink}
                        disabledStyle={{backgroundColor: palette.text, opacity: 0.45}}
                        disabled={availability !== null} onPress={write}>
                        <FillLabel fontSize={12} color={primary.ink}>WRITE TO MACHINE</FillLabel>
                    </Button>
                    <Button height="auto" minHeight="$4" paddingVertical="$3"
                        backgroundColor={palette.raised} color={palette.text} borderWidth={1} borderColor={palette.line}
                        onPress={leave}><DotMatrixText fontSize={12} weight="bold">LEAVE FOR NOW</DotMatrixText></Button>
                    <Button height="auto" minHeight={44} paddingVertical="$2"
                        backgroundColor={palette.none} color={palette.dim} onPress={stay}>Stay here</Button>
                </ScrollView>
            </XbrwSheet>
        </YStack>
    );
}
