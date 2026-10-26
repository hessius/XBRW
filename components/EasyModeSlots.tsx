import React, {useEffect, useRef, useState} from "react";
import {AccessibilityInfo, findNodeHandle, FlatList, Pressable, ScrollView, View} from "react-native";
import {Button, Input, Text, XStack, YStack, type ColorTokens} from "tamagui";
import Recipe from "@/library/Recipe";
import {resolveAccent} from "@/library/accent";
import {overflowFor} from "@/library/brew/overflowConfig";
import {
    SLOT_NAMES, prepareSet, slotNeedsWrite, snapshotRecipe, snapshotStatus, unwrittenSlotCount,
    type SlotIndex, type SlotJournal, type SlotRecord
} from "@/library/slots/slotModel";
import {SLOT_INTEGRATION_BLOCK} from "@/library/slots/slotWriter";
import {useBottomInset} from "@/hooks/useBottomInset";
import type {SlotAttempt} from "@/hooks/useEasyModeSlots";
import {useLiveBrewBarGuard} from "@/hooks/useLiveBrewBarGuard";
import EasyModeSlotCard, {teaSlotFigures} from "@/components/EasyModeSlotCard";
import EasyModeWriteOverlay, {slotOverlayVisible} from "@/components/EasyModeWriteOverlay";
import DotMatrixText from "@/components/DotMatrixText";
import FillLabel from "@/components/FillLabel";
import PourProfile from "@/components/PourProfile";
import XbrwSheet from "@/components/XbrwSheet";
import TeaSlotProbePanel, {type TeaSlotProbePanelProps} from "@/components/TeaSlotProbePanel";
import {teaProbeStatus} from "@/library/slots/teaSlotProbe";
import {isTeaProbeSnapshot} from "@/library/slots/teaSlotCandidate";
import {useAppearance} from "@/hooks/useAppearance";
import {STABLE_HOST} from "@/constants/views";

const BREW_BUSY = "The machine is busy with a running or held brew. Finish the brew before writing or recovering.";
const SERIAL_BLOCK = "This incomplete write belongs to a different machine. Reconnect to the machine you started with.";

type WriteFailure = {message: string; tone: "error" | "interruption"};
const UNCONFIRMED: WriteFailure = {
    message: "The write was not confirmed. Check the machine's display, then retry or cancel.",
    tone: "interruption"
};
const BACKGROUND: WriteFailure = {
    message: "Writing stopped because the app moved to the background. Keep it open when retrying.",
    tone: "interruption"
};
const STORAGE: WriteFailure = {
    message: "XBRW++ could not save changes on this phone. Check available storage and try again.",
    tone: "error"
};
const IDENTITY: WriteFailure = {message: SERIAL_BLOCK, tone: "error"};
const RECIPE: WriteFailure = {
    message: "This recipe cannot be written. Check its settings before trying again.", tone: "error"
};

// Exact producer messages also cover journals restored after relaunch.
const WRITE_FAILURES: Readonly<Record<string, WriteFailure>> = {
    "Receipt unknown": UNCONFIRMED,
    "Retrying the unconfirmed slot.": UNCONFIRMED,
    "Easy Mode writing stopped; its recovery journal is retained.": UNCONFIRMED,
    "The write stopped before the machine confirmed it. Check the machine before retrying.": UNCONFIRMED,
    "The machine did not confirm this slot. Check its display before retrying.": UNCONFIRMED,
    "The machine did not confirm that the slots were saved. Check its display before retrying.": UNCONFIRMED,
    "The machine sent an unexpected reply. The write was not confirmed.": UNCONFIRMED,
    "The machine did not confirm the write in order. Please check its display.": UNCONFIRMED,
    "Easy Mode writing stopped because the app entered the background.": BACKGROUND,
    "Easy Mode writing is unavailable in the background.": BACKGROUND,
    "Tea steeps longer than 120 seconds need machine firmware V12.0D.400 or newer.": {
        message: "Update your machine firmware to use tea steeps longer than two minutes.", tone: "error"
    },
    "The machine refused command 40526. The incomplete write is still retained.": {
        message: "The machine did not stop saving. Retry the write or wait for the saving screen to clear.", tone: "interruption"
    },
    "No reply to command 40526. The incomplete write is still retained.": {
        message: "Stopping was not confirmed. Retry the write or wait for the saving screen to clear.", tone: "interruption"
    },
    "The machine has not returned to normal. Retry or wait for its saving screen to clear.": {
        message: "The machine is still saving. Retry the write or wait for its saving screen to clear.", tone: "interruption"
    },
    "Wait for a known saving or normal machine state before recovery.": {
        message: "Reconnect to check the machine's state before stopping this write.", tone: "interruption"
    },
    "The machine refused the Easy Mode write. Fill the tank if needed, then retry.": {
        message: "The machine refused the Easy Mode write. Fill the tank if needed, then retry.", tone: "error"
    },
    "The connected machine serial must match.": IDENTITY,
    "The recovery journal serial belongs to a different machine.": IDENTITY,
    "This write belongs to a different machine. Its serial must match.": IDENTITY,
    "The selected machine is not the connected peripheral.": {
        message: "Connect to the selected machine before writing.", tone: "error"
    },
    "The machine is busy. Easy Mode writing stopped.": {
        message: "Writing stopped because the machine is busy. Finish its operation before retrying.", tone: "interruption"
    },
    "The machine is busy. Finish its operation before writing Easy Mode slots.": {
        message: "The machine is busy. Finish its operation before writing.", tone: "error"
    },
    "Fill the water tank and wait for the machine to return to normal, then retry.": {
        message: "Fill the water tank and wait for the machine to return to normal, then retry.", tone: "error"
    },
    "The machine is still busy or saving. Wait until it is back to normal before restarting or cancelling. If it is already back to normal, reconnect first.": {
        message: "Wait until the machine is back to normal before retrying or cancelling. If it already is, reconnect first.",
        tone: "error"
    },
    "A recipe is too large for this Bluetooth connection. Reduce its stages or volumes before writing.": {
        message: "A recipe is too large to send. Reduce its stages or volumes before writing.", tone: "error"
    },
    "Choose all three recipes before writing.": {
        message: "Choose all three recipes before writing.", tone: "error"
    },
    "The recipe's source identity is invalid.": RECIPE,
    "The recipe's grinder state is invalid.": RECIPE,
    "The recipe's brewer settings are invalid.": RECIPE,
    "The recipe identity or stages are missing.": RECIPE,
    "The Easy Mode snapshot's grinder settings are invalid.": RECIPE,
    "The Easy Mode snapshot's brewer settings are invalid.": RECIPE,
    "Choose a valid grind speed before assigning this recipe.": RECIPE,
    "Set each stage's agitation before assigning this recipe.": RECIPE,
    "Choose a valid pour pattern before assigning this recipe.": RECIPE
};

function writeError(message: string, journal: SlotJournal | null): WriteFailure {
    if (["Easy Mode link lost. Receipt is unknown.", "Easy Mode connection was replaced.",
        "The Easy Mode connection changed. Receipt is unknown.",
        "The machine connection changed during the write."].includes(message)) {
        return {
            message: journal !== null && journal.acknowledged < 3
                ? `The connection was lost before ${SLOT_NAMES[journal.acknowledged]} was confirmed.`
                : "The connection was lost before saving was confirmed.",
            tone: "interruption"
        };
    }
    if (message.startsWith("Could not persist the incomplete Easy Mode write:")
        || message.startsWith("Easy Mode storage") || message.startsWith("SQLite")
        || message === "disk full" || message === "Error: disk full") return STORAGE;
    if (message.startsWith("The Easy Mode dose must be ")) return RECIPE;
    // Unrecognised validation/native/invariant failures are errors, never missing confirmation.
    return Object.hasOwn(WRITE_FAILURES, message) ? WRITE_FAILURES[message] : {
        message: "XBRW++ could not complete this write. Your recipes are kept. Try again; if it repeats, contact support.",
        tone: "error"
    };
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
    guardLiveBrewBar?: boolean;
    error: string | null;
    attempt?: SlotAttempt | null;
    onDismissSuccess?: () => void;
    writeControlRef?: React.RefObject<React.ComponentRef<typeof Button> | null>;
    onAssign: (index: SlotIndex, recipe: Recipe) => boolean | void;
    onSetScaleEnabled?: (index: SlotIndex, enabled: boolean) => boolean | void;
    onWrite: () => void;
    onRecover: (restart: boolean) => void;
    onCancel: () => void;
    onDismissWrite?: () => void;
    onRestoreOriginal?: () => void;
    teaProbe?: Pick<TeaSlotProbePanelProps, "onWriteProbe" | "onRestore" | "onObserve"
        | "onWriteLab" | "onRecoveryCommand" | "onClearRecovery">;
    teaProbeOpen?: boolean;
    onTeaProbeOpenChange?: (open: boolean) => void;
};

export function slotWriteAvailability({
    record, deviceId, connected, available, busy = false, serialMatches = true
}: Pick<EasyModeSlotsProps, "record" | "deviceId" | "connected" | "available" | "busy" | "serialMatches">): string | null {
    if (deviceId === "") return "Choose a machine in Settings before assigning slots.";
    if (!serialMatches) return SERIAL_BLOCK;
    if (busy) return BREW_BUSY;
    if (!available) return SLOT_INTEGRATION_BLOCK;
    if (!connected) return "Connect to this machine before writing, retrying or cancelling.";
    if (record.journal === null) {
        if (record.experiment?.phase === "active") return "Restore the original set before writing slots.";
        try {
            prepareSet(record.drafts);
        } catch (error) {
            return error instanceof Error ? error.message : String(error);
        }
    }
    return null;
}

function RecipeChoice({recipe, onPick}: {recipe: Recipe; onPick: () => void}) {
    const colour = useAppearance().recipe(resolveAccent(recipe));
    const {onAccent} = colour;
    const problem = recipeProblem(recipe);
    return (
        <Pressable accessibilityRole="button" accessibilityLabel={`Choose ${recipe.displayName()}`}
            accessibilityHint={problem ?? undefined}
            accessibilityState={{disabled: problem !== null}} disabled={problem !== null} onPress={onPick}>
            <YStack testID="recipe-choice-surface" gap="$2" padding="$3" marginBottom="$2" borderRadius="$3"
                backgroundColor={colour.fill}>
                <Text color={onAccent.text} fontSize={16} fontWeight="600">{recipe.displayName()}</Text>
                <XStack gap="$2" alignItems="center" justifyContent="space-between" flexWrap="wrap">
                    <DotMatrixText fontSize={11} color={onAccent.text}>
                        {recipe.isTea() ? teaSlotFigures(recipe)
                            : `${recipe.dosage}G · 1:${recipe.ratio} · GRIND ${recipe.grinder ? recipe.grindSize : "OFF"}`}
                    </DotMatrixText>
                    <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                        <PourProfile pours={recipe.pours} width={80} height={24}
                            stroke={onAccent.profileStroke} fill={onAccent.profileFill}
                            dot={onAccent.profileDot}/>
                    </View>
                </XStack>
                {problem !== null && <Text color={onAccent.text} fontSize={13}>{problem}</Text>}
            </YStack>
        </Pressable>
    );
}

function StoppedWrite({journal, failure}: {journal: SlotJournal; failure: string | null}) {
    const appearance = useAppearance();
    const {palette} = appearance;
    const heading = journal.acknowledged === 3 ? "Saving was not confirmed."
        : `Writing stopped at ${SLOT_NAMES[journal.acknowledged]}.`;
    const mapped = failure === null ? null : writeError(failure, journal);
    const reason = mapped?.message ?? "The write stopped before it was confirmed. Your recipes are kept.";
    const colour = mapped?.tone === "error" ? palette.danger : palette.text;
    useEffect(() => {
        AccessibilityInfo.announceForAccessibility(`${heading} ${reason}`);
    }, [heading, reason]);
    return (
        <YStack gap="$4">
            {mapped?.tone === "error" &&
                <DotMatrixText fontSize={40} weight="bold" color={colour}>!</DotMatrixText>}
            <Text color={colour} fontSize={23} fontWeight="600">{heading}</Text>
            <Text selectable accessibilityRole="alert" color={palette.text}>{reason}</Text>
            <YStack padding="$4" gap="$3" borderRadius={18} backgroundColor={palette.raised}>
                <XStack gap="$3" justifyContent="space-around" flexWrap="wrap">
                    {SLOT_NAMES.map((name, index) => <YStack key={name} alignItems="center" gap="$2">
                        <DotMatrixText fontSize={28} weight="bold"
                            color={index < journal.acknowledged ? appearance.recipe(resolveAccent(new Recipe(undefined, journal.slots[index].recipeJSON))).ink
                                : index === journal.acknowledged ? colour : palette.dim}>{name}</DotMatrixText>
                        <Text color={palette.dim} fontSize={12}>
                            {`${name}: ${index < journal.acknowledged ? "received"
                                : journal.inFlight === index ? "not confirmed" : "pending"}`}
                        </Text>
                    </YStack>)}
                </XStack>
                {journal.slots.map((snapshot, index) => <YStack key={SLOT_NAMES[index]}
                    testID={`slot-${SLOT_NAMES[index]}`} gap="$1">
                    <Text color={palette.dim} fontSize={13}>{`${SLOT_NAMES[index]} · ${snapshot.name}`}</Text>
                    {new Recipe(undefined, snapshot.recipeJSON).isTea() && <DotMatrixText fontSize={11} color={palette.dim}>
                        {teaSlotFigures(new Recipe(undefined, snapshot.recipeJSON), isTeaProbeSnapshot(snapshot))}
                    </DotMatrixText>}
                </YStack>)}
            </YStack>
            <Text color={palette.dim} fontSize={14}>
                Your recipes are kept. The saving animation usually clears after about a minute.
                This set has not been confirmed saved.
            </Text>
        </YStack>
    );
}

export default function EasyModeSlots({
    record, recipes, incoming, header, deviceId, serial, connected, available, running, error,
    attempt = null, onDismissSuccess, writeControlRef, busy = false, serialMatches = true,
    guardLiveBrewBar = false, teaProbe, teaProbeOpen = false, onTeaProbeOpenChange,
    onAssign, onSetScaleEnabled, onWrite, onRecover, onCancel, onDismissWrite, onRestoreOriginal
}: EasyModeSlotsProps) {
    const appearance = useAppearance();
    const {palette, primary} = appearance;
    const onAccent = appearance.onFill(palette.text);
    const [picker, setPicker] = useState<{deviceId: string; index: SlotIndex} | null>(null);
    const [search, setSearch] = useState("");
    const [usedIncoming, setUsedIncoming] = useState<string | null>(null);
    const [confirmation, setConfirmation] = useState<{deviceId: string; kind: "retry" | "cancel"} | null>(null);
    const [help, setHelp] = useState(false);
    const changeA = useRef<React.ComponentRef<typeof Button>>(null);
    const changeB = useRef<React.ComponentRef<typeof Button>>(null);
    const changeC = useRef<React.ComponentRef<typeof Button>>(null);
    const changeRefs = [changeA, changeB, changeC];
    const helpRef = useRef<React.ComponentRef<typeof Button>>(null);
    const probeRef = useRef<React.ComponentRef<typeof Button>>(null);
    const retryRef = useRef<React.ComponentRef<typeof Button>>(null);
    const cancelRef = useRef<React.ComponentRef<typeof Button>>(null);
    const ownWriteRef = useRef<React.ComponentRef<typeof Button>>(null);
    const writeRef = writeControlRef ?? ownWriteRef;
    const focusOrigin = useRef<React.RefObject<React.ComponentRef<typeof Button> | null> | null>(null);
    const wasCovered = useRef(false);
    const bottomInset = useBottomInset();
    const currentAttempt: SlotAttempt | null = attempt === null && running
        ? {deviceId, serial: serial ?? record.journal?.serial ?? null, operation: "write", status: "writing"}
        : attempt?.deviceId === deviceId
            && (serial === undefined || attempt.serial === serial) ? attempt : null;
    const overlay = slotOverlayVisible(record, currentAttempt);
    const active = running || (currentAttempt !== null
        && ["writing", "saving", "cancelling"].includes(currentAttempt.status));
    const journal = record.journal;
    const probeStatus = teaProbeStatus(record);
    const showingWrittenProbe = probeStatus === "candidate-written";
    const locked = journal !== null || active || deviceId === "" || overlay || record.experiment?.phase === "active";
    const pickerIndex = picker?.deviceId === deviceId ? picker.index : null;
    const confirmationKind = confirmation?.deviceId === deviceId ? confirmation.kind : null;
    const pickerOpen = pickerIndex !== null && !locked;
    const confirmationOpen = confirmationKind !== null && !overlay && !active;
    const helpOpen = help && !overlay && !active;
    const probeOpen = teaProbeOpen && !overlay && !active && teaProbe !== undefined;
    const covered = overlay || pickerOpen || confirmationOpen || helpOpen || probeOpen;
    useLiveBrewBarGuard(guardLiveBrewBar, {covered});
    useEffect(() => {
        const dismissed = wasCovered.current && !covered;
        wasCovered.current = covered;
        if (!dismissed) return;
        // Wait for the host to be accessible and for surviving action refs to attach.
        const frame = requestAnimationFrame(() => {
            const target = focusOrigin.current?.current ?? retryRef.current ?? writeRef.current ?? helpRef.current;
            if (target !== null && "nodeType" in target) {
                target.focus();
                return;
            }
            const handle = findNodeHandle(target);
            if (handle !== null) AccessibilityInfo.setAccessibilityFocus(handle);
        });
        return () => cancelAnimationFrame(frame);
    }, [covered, writeRef]);
    const failure = error ?? journal?.error ?? null;
    const displayedFailure = failure === null ? null : writeError(failure, journal);
    const availability = slotWriteAvailability({record, deviceId, connected, available, busy, serialMatches});
    const blocked = active || overlay || availability !== null;
    const restoreBlocked = active || overlay || !connected || !serialMatches || busy || !available;
    const dirty = unwrittenSlotCount(record);
    const incomingProblem = incoming === undefined ? null : recipeProblem(incoming);
    const incomingKey = incoming === undefined ? null : JSON.stringify([deviceId, incoming]);
    const overflow = (journal?.slots ?? record.drafts).some(snapshot => snapshot !== null
        && overflowFor(new Recipe(undefined, snapshot.recipeJSON)) !== undefined);
    const filteredRecipes = recipes.filter(recipe =>
        recipe.displayName().toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));

    return (
        <YStack flex={1} backgroundColor={palette.base}>
            <View {...STABLE_HOST} testID="easy-mode-host" style={{flex: 1}} accessibilityElementsHidden={covered}
                importantForAccessibility={covered ? "no-hide-descendants" : "auto"}
                pointerEvents={covered ? "none" : "auto"}>
                {header}
                <ScrollView testID="easy-mode-cards" style={{flex: 1, minHeight: 0}}
                    contentContainerStyle={{paddingHorizontal: 14, gap: 10,
                        // The actions panel takes the inset while it is drawn.
                        // During a write it is not, and the cards reach the
                        // bottom of the screen themselves.
                        paddingBottom: journal === null ? 14 : 14 + bottomInset}}>
                    <XStack justifyContent="space-between" alignItems="center" gap="$2" flexWrap="wrap">
                        {journal === null && <Text color={palette.dim} fontSize={12} flex={1}>
                            {record.experiment?.phase === "active"
                                ? showingWrittenProbe ? "Tea candidate stored; behavior UNTESTED."
                                    : "Tea trial unconfirmed; restore originals."
                                : "Your machine shortcuts"}
                        </Text>}
                        {journal === null && record.experiment?.phase !== "active" &&
                            <DotMatrixText fontSize={11} color={palette.dim}>
                                {`${dirty} ${dirty === 1 ? "CHANGE" : "CHANGES"}`}
                            </DotMatrixText>}
                        {teaProbe !== undefined && (__DEV__ || record.experiment !== undefined) &&
                            <Button ref={probeRef} height="auto" minHeight={44}
                                paddingVertical="$1" paddingHorizontal="$2" backgroundColor={palette.none}
                                color={palette.dim} disabled={active || overlay}
                                accessibilityLabel="TEA SLOT PROBE"
                                onPress={() => {
                                    focusOrigin.current = probeRef;
                                    onTeaProbeOpenChange?.(true);
                                }}><DotMatrixText fontSize={11} color={palette.dim}>LAB</DotMatrixText></Button>}
                        <Button ref={helpRef} accessibilityLabel="About Easy Mode"
                            onPress={() => { focusOrigin.current = helpRef; setHelp(true); }}
                            height="auto" minHeight={44} paddingHorizontal="$2" paddingVertical="$1"
                            backgroundColor={palette.none} color={palette.dim}>
                            <DotMatrixText fontSize={14} color={palette.dim}>?</DotMatrixText>
                        </Button>
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
                    {journal !== null && !active && <YStack testID="easy-mode-recovery"
                        paddingHorizontal="$1" paddingTop="$2" gap="$4">
                        <StoppedWrite journal={journal} failure={failure}/>
                        {availability !== null && <Text color={palette.dim}>{availability}</Text>}
                        <Button ref={retryRef} accessibilityLabel="Retry slot write" height="auto" minHeight={48}
                            paddingVertical="$3" disabled={blocked} backgroundColor={primary.fill}
                            color={blocked ? onAccent.text : primary.ink}
                            disabledStyle={{backgroundColor: palette.text, opacity: 0.45}}
                            onPress={() => {
                                focusOrigin.current = retryRef; setConfirmation({deviceId, kind: "retry"});
                            }}><FillLabel fontSize={12} color={blocked ? onAccent.text : primary.ink}>RETRY WRITE</FillLabel></Button>
                        <Button ref={cancelRef} accessibilityLabel={onDismissWrite ? "Stop slot write" : "Cancel slot write"} height="auto" minHeight={48}
                            paddingVertical="$3" disabled={blocked} backgroundColor={palette.raised} color={palette.text}
                            borderWidth={1} borderColor={palette.line}
                            onPress={() => {
                                focusOrigin.current = cancelRef; setConfirmation({deviceId, kind: "cancel"});
                            }}><DotMatrixText fontSize={12} weight="bold">{onDismissWrite ? "STOP THIS WRITE" : "CANCEL THIS WRITE"}</DotMatrixText></Button>
                        <Text color={palette.dim} fontSize={12}>Finish or cancel this write to brew from the app.</Text>
                    </YStack>}
                    {journal === null && SLOT_NAMES.map((name, index) => {
                        const slotIndex = index as SlotIndex;
                        const snapshot = (showingWrittenProbe
                                ? record.written?.slots[index] : undefined) ?? record.drafts[index];
                        const current = recipes.find(recipe => recipe.uuid === snapshot?.sourceUuid);
                        const status = snapshot === null || isTeaProbeSnapshot(snapshot)
                            ? null : snapshotStatus(snapshot, current);
                        return <EasyModeSlotCard key={name} index={slotIndex} snapshot={snapshot}
                            needsWrite={!showingWrittenProbe && slotNeedsWrite(record, slotIndex)} status={status}
                            recovery={false} locked={locked}
                            updateProblem={status === "edited" && current !== undefined ? recipeProblem(current) : null}
                            changeRef={changeRefs[index]}
                            onSetScaleEnabled={onSetScaleEnabled === undefined ? undefined
                                : enabled => onSetScaleEnabled(slotIndex, enabled)}
                            onChange={() => {
                                focusOrigin.current = changeRefs[index];
                                setSearch(""); setPicker({deviceId, index: slotIndex});
                            }}
                            onUpdate={() => { if (current !== undefined) onAssign(slotIndex, current); }}/>;
                    })}
                </ScrollView>
                {journal === null && <ScrollView testID="easy-mode-actions" nestedScrollEnabled
                    style={{flexGrow: 0, flexShrink: 1, maxHeight: "60%", backgroundColor: palette.base,
                        borderTopWidth: 1, borderTopColor: palette.line}}
                    contentContainerStyle={{padding: 14, gap: 10, paddingBottom: Math.max(bottomInset, 14)}}>
                    {displayedFailure !== null && <Text selectable accessibilityRole="alert"
                        color={displayedFailure.tone === "error" ? palette.danger : palette.text}>
                        {displayedFailure.message}
                    </Text>}
                    {availability !== null && <Text color={palette.dim}>{availability}</Text>}
                    {record.experiment?.phase === "active" && onRestoreOriginal !== undefined &&
                        <Button accessibilityLabel="Restore original slot set" height="auto" minHeight={48}
                            paddingVertical="$3" backgroundColor={restoreBlocked ? palette.text : primary.fill}
                            color={restoreBlocked ? onAccent.text : primary.ink}
                            disabled={restoreBlocked}
                            onPress={onRestoreOriginal}>RESTORE ORIGINAL SET</Button>}
                    {overflow && <Text color={palette.dim}>
                        Stored slots do not run the app&apos;s automatic pause protection.
                    </Text>}
                    <Text color={palette.dim} fontSize={12} textAlign="center">Writes A, B and C. Switches to EASY.</Text>
                    <Button ref={writeRef} accessibilityLabel="Write all three slots" height="auto" minHeight="$4"
                        paddingVertical="$3" disabled={blocked} backgroundColor={primary.fill}
                        color={blocked ? onAccent.text : primary.ink}
                        disabledStyle={{backgroundColor: palette.text, opacity: 0.45}}
                        onPress={() => { focusOrigin.current = writeRef; onWrite(); }}>
                        <FillLabel fontSize={12} color={blocked ? onAccent.text : primary.ink}>WRITE TO MACHINE</FillLabel>
                    </Button>
                    {record.written !== null && <Text color={palette.dim} fontSize={12} textAlign="center">
                        {`Last written by XBRW++ ${new Date(record.written.at).toLocaleString()}.`}
                    </Text>}
                </ScrollView>}
            </View>
            {!overlay && <>
            <XbrwSheet open={pickerOpen} onOpenChange={open => { if (!open) setPicker(null); }}
                title={`SLOT ${pickerIndex === null ? "" : SLOT_NAMES[pickerIndex]}`} heightPercent={80}>
                <YStack flex={1} gap="$3">
                    {displayedFailure !== null && <Text selectable accessibilityRole="alert"
                        color={displayedFailure.tone === "error" ? palette.danger : palette.text}>
                        {displayedFailure.message}
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
                title={confirmationKind === "retry" ? "RETRY WRITE" : onDismissWrite ? "STOP THIS WRITE" : "CANCEL THIS WRITE"} heightPercent={70}>
                <ScrollView contentContainerStyle={{gap: 16}}>
                    <Text color={palette.text} fontSize={23} fontWeight="600">
                        {confirmationKind === "retry" ? "Which screen is your machine showing?"
                            : onDismissWrite ? "Stop this write?" : "Back to normal?"}
                    </Text>
                    {confirmationKind === "cancel" && onDismissWrite === undefined && <Text color={palette.text} fontSize={14}>
                        Wait for the saving animation to stop before cancelling.
                        It usually clears after about a minute.
                    </Text>}
                    <Text color={palette.dim}>
                        {confirmationKind === "retry"
                            ? journal?.acknowledged === 3
                                ? "If it is still saving, we will check for save confirmation without sending the recipes again."
                                : "If it is still saving, we will finish the same set. If it is back to normal, we will write all three again."
                            : onDismissWrite
                                ? "This returns the machine to normal and clears the unfinished write. Your assignments are kept. The machine's slot contents remain unconfirmed until you write the full set."
                                : "Cancelling clears this unfinished write from the app. Your assignments are kept, but the machine's slot contents remain unconfirmed."}
                    </Text>
                    {confirmationKind === "retry" && <Button height="auto" minHeight="$4" paddingVertical="$3"
                        backgroundColor={primary.fill} color={blocked ? onAccent.text : primary.ink}
                        disabledStyle={{backgroundColor: palette.text, opacity: 0.45}}
                        disabled={blocked} accessibilityLabel="Finish write while machine is still saving"
                        onPress={() => { setConfirmation(null); onRecover(false); }}>STILL SAVING, FINISH WRITE</Button>}
                    <Button height="auto" minHeight="$4" paddingVertical="$3" disabled={blocked}
                        backgroundColor={confirmationKind === "retry" ? palette.raised
                            : blocked ? palette.text : primary.fill}
                        color={confirmationKind === "retry" ? palette.text
                            : blocked ? onAccent.text : primary.ink}
                        accessibilityLabel={confirmationKind === "retry"
                            ? "Confirm machine is back to normal and retry"
                            : onDismissWrite ? "Confirm stop slot write" : "Confirm machine is back to normal and cancel"}
                        onPress={() => {
                            const action = confirmationKind;
                            setConfirmation(null);
                            if (action === "retry") onRecover(true);
                            else if (action === "cancel") (onDismissWrite ?? onCancel)();
                        }}>{confirmationKind === "retry" ? "BACK TO NORMAL, RETRY" : onDismissWrite ? "STOP THIS WRITE" : "BACK TO NORMAL, CANCEL"}</Button>
                    <Button backgroundColor={palette.none} color={palette.dim}
                        height="auto" minHeight={44} onPress={() => setConfirmation(null)}>KEEP THIS WRITE</Button>
                </ScrollView>
            </XbrwSheet>
            <XbrwSheet open={helpOpen} onOpenChange={setHelp} title="ABOUT EASY MODE" heightPercent={70}>
                <ScrollView contentContainerStyle={{gap: 16}}>
                    <Text color={palette.text}>Assign all three recipes. Your choices are kept on this phone immediately.</Text>
                    <Text color={palette.text}>Writing replaces A, B and C and switches the machine to EASY.</Text>
                    <Text color={palette.text}>Scale ON automatically tares the scale when that slot is started.</Text>
                    <Text color={palette.dim}>Scale changes are kept here until you choose WRITE TO MACHINE.</Text>
                    <Text color={palette.dim}>
                        This is the last set written by XBRW++. Changes made elsewhere cannot be read.
                    </Text>
                    <Text color={palette.dim}>The machine cannot tell us what is already in its slots. An empty phone draft does not mean an empty machine slot.</Text>
                    <Text color={palette.dim}>Library edits do not change a slot until you choose USE UPDATED RECIPE. Removed recipes keep their snapshot.</Text>
                    <Text color={palette.dim}>Stored slots do not run the app&apos;s automatic pause protection. Tea slots support up to three steeps with the grinder off.</Text>
                </ScrollView>
            </XbrwSheet>
            {teaProbe !== undefined && <XbrwSheet open={probeOpen}
                onOpenChange={open => onTeaProbeOpenChange?.(open)}
                title="SLOT LABS" heightPercent={85}>
                {probeOpen && <TeaSlotProbePanel key={record.experiment?.trialId ?? deviceId}
                    {...teaProbe} record={record} deviceId={deviceId} serial={serial ?? null}
                    connected={connected} available={available} busy={busy} running={active} error={error}/>}
            </XbrwSheet>}
            </>}
            <EasyModeWriteOverlay record={record} attempt={currentAttempt} onDismissSuccess={onDismissSuccess}/>
        </YStack>
    );
}
