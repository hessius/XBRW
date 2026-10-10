import React, {useEffect, useState} from "react";
import {AccessibilityInfo, FlatList, Pressable, ScrollView, View} from "react-native";
import {Button, Input, Text, XStack, YStack, type ColorTokens} from "tamagui";
import {useSafeAreaInsets} from "react-native-safe-area-context";
import Recipe from "@/library/Recipe";
import {resolveAccent} from "@/library/accent";
import {overflowFor} from "@/library/brew/overflowConfig";
import {
    SLOT_NAMES, slotNeedsWrite, snapshotRecipe, snapshotStatus, unwrittenSlotCount,
    type SlotIndex, type SlotJournal, type SlotRecord
} from "@/library/slots/slotModel";
import {SLOT_INTEGRATION_BLOCK} from "@/library/slots/slotWriter";
import type {SlotAttempt} from "@/hooks/useEasyModeSlots";
import EasyModeSlotCard from "@/components/EasyModeSlotCard";
import EasyModeWriteOverlay, {slotOverlayVisible} from "@/components/EasyModeWriteOverlay";
import PourProfile from "@/components/PourProfile";
import XbrwSheet from "@/components/XbrwSheet";
import {onAccent, palette} from "@/constants/colors";

const BREW_BUSY = "The machine is busy with a running or held brew. Finish the brew before writing or recovering.";
const SERIAL_BLOCK = "This incomplete write belongs to a different machine. Reconnect to the machine you started with.";

function writeError(message: string): string {
    if (/persist|storage|database|sqlite/i.test(message)) {
        return `XBRW++ could not save the write record. ${message}`;
    }
    if (/refused.*Easy Mode/i.test(message)) {
        return "The machine refused the Easy Mode write. Fill the tank if needed, then retry.";
    }
    if (/receipt|verified.*evidence|native dispatch/i.test(message)) {
        return "The write was not confirmed. Check the machine's display, then retry or cancel.";
    }
    return message;
}

function recipeProblem(recipe: Recipe): string | null {
    try {
        snapshotRecipe(recipe);
        return null;
    } catch (error) {
        return error instanceof Error ? error.message : String(error);
    }
}

export type EasyModeSlotsProps = {
    record: SlotRecord;
    /** The full library, not the active home search or shelf result. */
    recipes: readonly Recipe[];
    incoming?: Recipe;
    header?: React.ReactNode;
    deviceId: string;
    serial?: string | null;
    connected: boolean;
    busy?: boolean;
    serialMatches?: boolean;
    available: boolean;
    running: boolean;
    error: string | null;
    attempt?: SlotAttempt | null;
    onDismissSuccess?: () => void;
    onAssign: (index: SlotIndex, recipe: Recipe) => boolean | void;
    onWrite: () => void;
    onRecover: (restart: boolean) => void;
    onCancel: () => void;
};

function RecipeChoice({recipe, onPick}: {recipe: Recipe; onPick: () => void}) {
    const problem = recipeProblem(recipe);
    return (
        <Pressable accessibilityRole="button" accessibilityLabel={`Choose ${recipe.displayName()}`}
            accessibilityHint={problem ?? undefined}
            accessibilityState={{disabled: problem !== null}} disabled={problem !== null} onPress={onPick}>
            <YStack gap="$2" padding="$3" marginBottom="$2" borderRadius="$3"
                backgroundColor={resolveAccent(recipe)}>
                <Text color={onAccent.text} fontSize={18} fontWeight="600">{recipe.displayName()}</Text>
                <PourProfile pours={recipe.pours} width={180} height={32}/>
                {problem !== null && <Text color={onAccent.text} fontSize={13}>{problem}</Text>}
            </YStack>
        </Pressable>
    );
}

function StoppedWrite({journal, failure}: {journal: SlotJournal; failure: string | null}) {
    const heading = journal.acknowledged === 3 ? "Saving was not confirmed."
        : `Writing stopped at ${SLOT_NAMES[journal.acknowledged]}.`;
    const reason = failure === null ? "The write stopped before it was confirmed. Your recipes are kept."
        : writeError(failure);
    const colour = failure !== null && /refus|persist|storage|database|invalid/i.test(failure)
        ? palette.danger : palette.warn;
    useEffect(() => {
        AccessibilityInfo.announceForAccessibility(`${heading} ${reason}`);
    }, [heading, reason]);
    return (
        <YStack gap="$3">
            <Text color={colour} fontSize={20} fontWeight="600">{heading}</Text>
            <Text selectable accessibilityRole="alert" color={palette.text}>{reason}</Text>
            <XStack gap="$3" flexWrap="wrap">
                {SLOT_NAMES.map((name, index) => <Text key={name} color={palette.dim}>
                    {`${name}: ${index < journal.acknowledged ? "received"
                        : journal.inFlight === index ? "not confirmed" : "pending"}`}
                </Text>)}
            </XStack>
        </YStack>
    );
}

export default function EasyModeSlots({
    record, recipes, incoming, header, deviceId, serial, connected, available, running, error,
    attempt = null, onDismissSuccess, busy = false, serialMatches = true,
    onAssign, onWrite, onRecover, onCancel
}: EasyModeSlotsProps) {
    const [picker, setPicker] = useState<{deviceId: string; index: SlotIndex} | null>(null);
    const [search, setSearch] = useState("");
    const [usedIncoming, setUsedIncoming] = useState<string | null>(null);
    const [confirmation, setConfirmation] = useState<{deviceId: string; kind: "retry" | "cancel"} | null>(null);
    const [help, setHelp] = useState(false);
    const insets = useSafeAreaInsets();
    const currentAttempt: SlotAttempt | null = attempt === null && running
        ? {deviceId, serial: serial ?? record.journal?.serial ?? null, operation: "write", status: "writing"}
        : attempt?.deviceId === deviceId
            && (serial === undefined || attempt.serial === serial) ? attempt : null;
    const overlay = slotOverlayVisible(record, currentAttempt);
    const active = running || (currentAttempt !== null
        && ["writing", "saving", "cancelling"].includes(currentAttempt.status));
    const journal = record.journal;
    const locked = journal !== null || active || deviceId === "" || overlay;
    const pickerIndex = picker?.deviceId === deviceId ? picker.index : null;
    const confirmationKind = confirmation?.deviceId === deviceId ? confirmation.kind : null;
    const pickerOpen = pickerIndex !== null && !locked;
    const confirmationOpen = confirmationKind !== null && !overlay && !active;
    const helpOpen = help && !overlay && !active;
    const covered = overlay || pickerOpen || confirmationOpen || helpOpen;
    const failure = error ?? journal?.error ?? null;
    const completeDraft = record.drafts.every(slot => slot !== null);
    const availability = deviceId === "" ? "Choose a machine in Settings before assigning slots."
        : !serialMatches ? SERIAL_BLOCK : busy ? BREW_BUSY
            : !available ? SLOT_INTEGRATION_BLOCK : !connected
                ? "Connect to this machine before writing, retrying or cancelling."
                : journal === null && !completeDraft ? "Choose all three recipes before writing." : null;
    const blocked = active || overlay || availability !== null;
    const dirty = unwrittenSlotCount(record);
    const incomingProblem = incoming === undefined ? null : recipeProblem(incoming);
    const incomingKey = incoming === undefined ? null : JSON.stringify([deviceId, incoming]);
    const overflow = (journal?.slots ?? record.drafts).some(snapshot => snapshot !== null
        && overflowFor(new Recipe(undefined, snapshot.recipeJSON)) !== undefined);
    const filteredRecipes = recipes.filter(recipe =>
        recipe.displayName().toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));

    return (
        <YStack flex={1} backgroundColor={palette.base}>
            <View testID="easy-mode-host" style={{flex: 1}} accessibilityElementsHidden={covered}
                importantForAccessibility={covered ? "no-hide-descendants" : "auto"}
                pointerEvents={covered ? "none" : "auto"}>
                {header}
                <ScrollView testID="easy-mode-cards" style={{flex: 1, minHeight: 0}}
                    contentContainerStyle={{padding: 16, gap: 16}}>
                    <XStack justifyContent="space-between" alignItems="center" gap="$3" flexWrap="wrap">
                        {journal === null && <Text color={palette.dim}>
                            {`${dirty} ${dirty === 1 ? "slot" : "slots"} not written`}
                        </Text>}
                        <Button accessibilityLabel="About Easy Mode" onPress={() => setHelp(true)}
                            height="auto" minHeight={44}>HELP</Button>
                    </XStack>
                    {incoming !== undefined && usedIncoming !== incomingKey && (
                        <YStack gap="$2" padding="$3" backgroundColor={palette.raised} borderRadius="$4">
                            <Text color={palette.text}>Choose a slot for {incoming.displayName()}.</Text>
                            {incomingProblem !== null && <Text color={palette.danger}>{incomingProblem}</Text>}
                            <XStack gap="$2" flexWrap="wrap">
                                {SLOT_NAMES.map((name, index) => (
                                    <Button key={name} disabled={locked || incomingProblem !== null}
                                        accessibilityLabel={`Put ${incoming.displayName()} in slot ${name}`}
                                        onPress={() => {
                                            if (onAssign(index as SlotIndex, incoming) !== false) setUsedIncoming(incomingKey);
                                        }}>{name}</Button>
                                ))}
                            </XStack>
                        </YStack>
                    )}
                    {SLOT_NAMES.map((name, index) => {
                        const slotIndex = index as SlotIndex;
                        const snapshot = journal?.slots[index] ?? record.drafts[index];
                        const current = recipes.find(recipe => recipe.uuid === snapshot?.sourceUuid);
                        const status = snapshot === null ? null : snapshotStatus(snapshot, current);
                        return <EasyModeSlotCard key={name} index={slotIndex} snapshot={snapshot}
                            needsWrite={slotNeedsWrite(record, slotIndex)} status={status}
                            recovery={journal !== null} locked={locked}
                            updateProblem={status === "edited" && current !== undefined ? recipeProblem(current) : null}
                            onChange={() => { setSearch(""); setPicker({deviceId, index: slotIndex}); }}
                            onUpdate={() => { if (current !== undefined) onAssign(slotIndex, current); }}/>;
                    })}
                </ScrollView>
                <ScrollView testID="easy-mode-actions" nestedScrollEnabled
                    style={{flexGrow: 0, flexShrink: 1, maxHeight: "60%", backgroundColor: palette.surface}}
                    contentContainerStyle={{padding: 16, gap: 12, paddingBottom: Math.max(insets.bottom, 16)}}>
                    {journal !== null && !active && <StoppedWrite journal={journal} failure={failure}/>}
                    {journal === null && failure !== null && <Text selectable accessibilityRole="alert"
                        color={palette.danger}>{writeError(failure)}</Text>}
                    {availability !== null && <Text color={palette.dim}>{availability}</Text>}
                    {overflow && <Text color={palette.dim}>
                        Stored slots do not run the app&apos;s automatic pause protection.
                    </Text>}
                    {journal === null ? (
                        <>
                            <Text color={palette.dim} fontSize={13}>Writes A, B and C. Switches to EASY.</Text>
                            <Button accessibilityLabel="Write all three slots" height="auto" minHeight="$4"
                                paddingVertical="$3" disabled={blocked} onPress={onWrite}>WRITE TO MACHINE</Button>
                            {record.written !== null && <Text color={palette.dim} fontSize={12}>
                                {`Last written by XBRW++ ${new Date(record.written.at).toLocaleString()}.`}
                            </Text>}
                        </>
                    ) : !active && (
                        <XStack gap="$2" flexWrap="wrap">
                            <Button accessibilityLabel="Retry slot write" height="auto" minHeight="$4"
                                paddingVertical="$3" disabled={blocked}
                                onPress={() => setConfirmation({deviceId, kind: "retry"})}>RETRY WRITE</Button>
                            <Button accessibilityLabel="Cancel slot write" height="auto" minHeight="$4"
                                paddingVertical="$3" disabled={blocked}
                                onPress={() => setConfirmation({deviceId, kind: "cancel"})}>CANCEL THIS WRITE</Button>
                        </XStack>
                    )}
                </ScrollView>
            </View>
            {!overlay && <>
            <XbrwSheet open={pickerOpen} onOpenChange={open => { if (!open) setPicker(null); }}
                title={`SLOT ${pickerIndex === null ? "" : SLOT_NAMES[pickerIndex]}`} heightPercent={80}>
                <YStack flex={1} gap="$3">
                    {failure !== null && <Text selectable accessibilityRole="alert" color={palette.danger}>
                        {writeError(failure)}
                    </Text>}
                    <Input accessibilityLabel="Search recipes" placeholder="Search recipes"
                        value={search} onChangeText={setSearch} color={palette.text}
                        backgroundColor={palette.raised} placeholderTextColor={palette.placeholder as ColorTokens}/>
                    <FlatList data={filteredRecipes} keyExtractor={recipe => recipe.uuid}
                        keyboardShouldPersistTaps="handled"
                        ListEmptyComponent={<Text color={palette.dim}>
                            {recipes.length === 0 ? "No recipes in your library." : "No matching recipes."}
                        </Text>}
                        renderItem={({item}) => <RecipeChoice recipe={item} onPick={() => {
                            if (pickerIndex !== null && !locked && onAssign(pickerIndex, item) !== false) setPicker(null);
                        }}/>}/>
                </YStack>
            </XbrwSheet>
            <XbrwSheet open={confirmationOpen} onOpenChange={open => { if (!open) setConfirmation(null); }}
                title={confirmationKind === "retry" ? "RETRY WRITE" : "CANCEL THIS WRITE"} heightPercent={80}>
                <ScrollView contentContainerStyle={{gap: 16, paddingBottom: insets.bottom}}>
                    <Text color={palette.text}>
                        {confirmationKind === "retry" ? "Which screen is your machine showing?"
                            : "Only cancel once the machine is back to its normal screen, with no saving animation."}
                    </Text>
                    <Text color={palette.dim}>
                        {confirmationKind === "retry"
                            ? journal?.acknowledged === 3
                                ? "Still saving waits for a fresh save confirmation. It does not resend any slot."
                                : "An unconfirmed slot may already have arrived. Still saving attempts to finish the same set from the first slot without a recorded receipt."
                            : "Cancelling clears the unfinished write from XBRW++. It does not stop a write on the machine or clear its contents. Your assignments are kept."}
                    </Text>
                    {confirmationKind === "retry" && <Button height="auto" minHeight="$4" paddingVertical="$3"
                        disabled={blocked} accessibilityLabel="Finish write while machine is still saving"
                        onPress={() => { setConfirmation(null); onRecover(false); }}>STILL SAVING, FINISH WRITE</Button>}
                    <Button height="auto" minHeight="$4" paddingVertical="$3" disabled={blocked}
                        accessibilityLabel={confirmationKind === "retry"
                            ? "Confirm machine is back to normal and retry" : "Confirm machine is back to normal and cancel"}
                        onPress={() => {
                            const action = confirmationKind;
                            setConfirmation(null);
                            if (action === "retry") onRecover(true);
                            else if (action === "cancel") onCancel();
                        }}>{confirmationKind === "retry" ? "BACK TO NORMAL, RETRY" : "BACK TO NORMAL, CANCEL"}</Button>
                    <Button onPress={() => setConfirmation(null)}>KEEP THIS WRITE</Button>
                </ScrollView>
            </XbrwSheet>
            <XbrwSheet open={helpOpen} onOpenChange={setHelp} title="ABOUT EASY MODE" heightPercent={70}>
                <ScrollView contentContainerStyle={{gap: 16, paddingBottom: insets.bottom}}>
                    <Text color={palette.text}>Assign all three recipes. Your choices are kept on this phone immediately.</Text>
                    <Text color={palette.text}>Writing replaces A, B and C and switches the machine to EASY.</Text>
                    <Text color={palette.dim}>
                        This is the last set written by XBRW++. Changes made elsewhere cannot be read.
                    </Text>
                    <Text color={palette.dim}>The machine cannot tell us what is already in its slots. An empty phone draft does not mean an empty machine slot.</Text>
                    <Text color={palette.dim}>Library edits do not change a slot until you choose USE UPDATED RECIPE. Removed recipes keep their snapshot.</Text>
                    <Text color={palette.dim}>Stored slots do not run the app&apos;s automatic pause protection. Tea slot writing is not available in XBRW++ yet.</Text>
                </ScrollView>
            </XbrwSheet>
            </>}
            <EasyModeWriteOverlay record={record} attempt={currentAttempt} onDismissSuccess={onDismissSuccess}/>
        </YStack>
    );
}
