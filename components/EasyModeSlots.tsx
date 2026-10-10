import React, {useState} from "react";
import {FlatList, ScrollView, View} from "react-native";
import {Button, Text, XStack, YStack} from "tamagui";
import {useSafeAreaInsets} from "react-native-safe-area-context";
import Recipe from "@/library/Recipe";
import {
    SLOT_NAMES, snapshotRecipe, snapshotStatus,
    type SlotIndex, type SlotRecord, type SlotSnapshot
} from "@/library/slots/slotModel";
import {SLOT_INTEGRATION_BLOCK} from "@/library/slots/slotWriter";
import XbrwSheet from "@/components/XbrwSheet";
import {palette} from "@/constants/colors";

const OVERWRITE_WARNING =
    "Writing replaces A, B and C and leaves your machine in EASY. Changes made outside XBRW++ cannot be detected.";
const BREW_BUSY = "The machine is busy with a running or held brew. Finish the brew before writing or recovering.";
const SERIAL_BLOCK = "This incomplete write belongs to a different machine. Reconnect to the machine you started with.";

function writeError(message: string): string {
    if (/refused.*Easy Mode/i.test(message)) {
        return "The machine refused the Easy Mode write. Fill the tank if needed, then retry.";
    }
    if (/receipt|verified.*evidence|native dispatch|storage completion/i.test(message)) {
        return "The write was not confirmed. Check the machine's display, then retry or cancel.";
    }
    return message;
}

export type EasyModeSlotsProps = {
    record: SlotRecord;
    recipes: readonly Recipe[];
    incoming?: Recipe;
    header?: React.ReactNode;
    deviceId: string;
    connected: boolean;
    busy?: boolean;
    serialMatches?: boolean;
    available: boolean;
    running: boolean;
    error: string | null;
    onAssign: (index: SlotIndex, recipe: Recipe) => boolean | void;
    onWrite: () => void;
    onRecover: (restart: boolean) => void;
    onCancel: () => void;
};

function snapshotFigures(snapshot: SlotSnapshot): string {
    const recipe = new Recipe(undefined, snapshot.recipeJSON);
    return `${recipe.dosage} g · 1:${recipe.ratio} · ${
        recipe.grinder ? `Grind ${recipe.grindSize}` : "Grinder off"
    }`;
}

function RecipeChoice({recipe, onPick}: {recipe: Recipe; onPick: () => void}) {
    let problem: string | null = null;
    try {
        snapshotRecipe(recipe);
    } catch (error) {
        problem = error instanceof Error ? error.message : String(error);
    }
    return (
        <YStack gap="$2" paddingVertical="$2">
            <Button accessibilityLabel={`Choose ${recipe.displayName()}`}
                    disabled={problem !== null} onPress={onPick}
                    backgroundColor={palette.raised} color={palette.text}>
                {recipe.displayName()}
            </Button>
            {problem !== null && <Text color={palette.warn} fontSize={13}>{problem}</Text>}
        </YStack>
    );
}

export default function EasyModeSlots({
    record, recipes, incoming, header, deviceId, connected, available, running, error,
    busy = false, serialMatches = true, onAssign, onWrite, onRecover, onCancel
}: EasyModeSlotsProps) {
    const [picker, setPicker] = useState<SlotIndex | null>(null);
    const [incomingUsed, setIncomingUsed] = useState(false);
    const [confirmation, setConfirmation] = useState<"retry" | "cancel" | null>(null);
    const insets = useSafeAreaInsets();
    const journal = record.journal;
    const locked = journal !== null || running || deviceId === "";
    const completeDraft = record.drafts.every((slot) => slot !== null);
    const recoveryKnown = journal !== null && journal.inFlight === null
        && journal.acknowledged < 3;
    const failure = error ?? journal?.error ?? null;
    const covered = picker !== null || confirmation !== null;
    const blocked = running || !connected || !available || busy || !serialMatches;

    return (
        <YStack flex={1} backgroundColor={palette.base}>
            <View style={{flex: 1}} accessibilityElementsHidden={covered}
                  importantForAccessibility={covered ? "no-hide-descendants" : "auto"}>
                {header}
                <ScrollView testID="easy-mode-cards" style={{flex: 1, minHeight: 0}}
                            contentContainerStyle={{padding: 16, gap: 16}}>
                    <Text color={palette.dim} fontSize={14}>
                        {record.written === null
                            ? "The machine cannot tell us what is already in its slots."
                            : `Last written by XBRW++ ${new Date(record.written.at).toLocaleString()}. Not read back from the machine.`}
                    </Text>
                    {deviceId === "" && <Text color={palette.warn}>
                        Choose a machine in Settings before assigning slots.
                    </Text>}
                    {incoming !== undefined && !incomingUsed && (
                        <YStack gap="$2" padding="$3" backgroundColor={palette.raised} borderRadius="$4">
                            <Text color={palette.text}>Choose a slot for {incoming.displayName()}.</Text>
                            <XStack gap="$2" flexWrap="wrap">
                                {SLOT_NAMES.map((name, index) => (
                                    <Button key={name} disabled={locked}
                                            accessibilityLabel={`Put ${incoming.displayName()} in slot ${name}`}
                                            onPress={() => {
                                                if (onAssign(index as SlotIndex, incoming) !== false) {
                                                    setIncomingUsed(true);
                                                }
                                            }}>
                                        {name}
                                    </Button>
                                ))}
                            </XStack>
                        </YStack>
                    )}
                    {journal !== null && (
                        <YStack gap="$2" borderWidth={1} borderColor={palette.warn}
                                padding="$3" borderRadius="$4">
                            <Text color={palette.warn} fontWeight="700">
                                {running ? "Writing all three slots" : "Write incomplete"}
                            </Text>
                            <Text color={palette.text}>
                                {running
                                    ? "Keep the app open while all three slots are written."
                                    : "An interrupted write can leave the machine stuck on its saving screen. Retry to finish the write. If the machine is back to normal, you can retry all three slots or cancel."}
                            </Text>
                            {SLOT_NAMES.map((name, index) => (
                                <Text key={name} color={palette.dim}>
                                    {`${name}: ${index < journal.acknowledged ? "received"
                                        : journal.inFlight === index
                                            ? running ? "writing" : "not confirmed"
                                            : "not sent"}`}
                                </Text>
                            ))}
                            {journal.acknowledged === 3 && <Text color={palette.warn}>
                                All three slots were received, but the machine has not confirmed they were saved.
                            </Text>}
                        </YStack>
                    )}
                    {SLOT_NAMES.map((name, index) => {
                        const slotIndex = index as SlotIndex;
                        const snapshot = journal?.slots[index] ?? record.drafts[index];
                        const current = recipes.find((recipe) => recipe.uuid === snapshot?.sourceUuid);
                        const status = snapshot === null ? null : snapshotStatus(snapshot, current);
                        const written = record.written?.slots[index];
                        return (
                            <YStack key={name} gap="$2" backgroundColor={palette.raised}
                                    padding="$4" borderRadius="$4">
                                <XStack gap="$3" alignItems="center">
                                    <Text color={palette.text} fontSize={28} fontWeight="700">{name}</Text>
                                    <YStack flex={1} gap="$1">
                                        <Text color={palette.text} fontSize={18} fontWeight="600">
                                            {snapshot?.name ?? "Choose a recipe"}
                                        </Text>
                                        <Text color={palette.dim} fontSize={13}>
                                            {snapshot === null ? "Existing machine contents unknown"
                                                : snapshotFigures(snapshot)}
                                        </Text>
                                    </YStack>
                                </XStack>
                                {status === "edited" && <Text color={palette.warn}>Edited since assignment</Text>}
                                {status === "removed" && <Text color={palette.warn}>
                                    Recipe removed from library. Snapshot kept.
                                </Text>}
                                {written !== undefined && <Text color={palette.dim} fontSize={13}>
                                    Last written: {written.name}. {snapshotFigures(written)}
                                </Text>}
                                {!locked && (
                                    <YStack gap="$2">
                                        {status === "edited" && current !== undefined && (
                                            <Button accessibilityLabel={`Update slot ${name} from library`}
                                                    onPress={() => onAssign(slotIndex, current)}>
                                                USE LIBRARY VERSION
                                            </Button>
                                        )}
                                        <Button accessibilityLabel={`Change slot ${name} recipe`}
                                                onPress={() => setPicker(slotIndex)}>
                                            {snapshot === null ? "CHOOSE RECIPE" : "CHANGE RECIPE"}
                                        </Button>
                                    </YStack>
                                )}
                            </YStack>
                        );
                    })}
                </ScrollView>
                <ScrollView testID="easy-mode-actions" nestedScrollEnabled
                            style={{flexGrow: 0, flexShrink: 1, maxHeight: "60%",
                                backgroundColor: palette.surface}}
                            contentContainerStyle={{padding: 16, gap: 12,
                                paddingBottom: Math.max(insets.bottom, 16)}}>
                    <Text selectable color={palette.warn} fontSize={14}>
                        {OVERWRITE_WARNING}
                    </Text>
                    {busy && <Text accessibilityRole="alert" color={palette.warn}>{BREW_BUSY}</Text>}
                    {!serialMatches && <Text accessibilityRole="alert" color={palette.warn}>{SERIAL_BLOCK}</Text>}
                    {!available && <Text selectable color={palette.warn}>{SLOT_INTEGRATION_BLOCK}</Text>}
                    {!connected && deviceId !== "" && <Text color={palette.dim}>
                        Connect to this machine before writing, retrying or cancelling.
                    </Text>}
                    {failure !== null && <Text selectable accessibilityRole="alert"
                                                color={palette.danger}>{writeError(failure)}</Text>}
                    {journal === null ? (
                        <Button accessibilityLabel="Write all three slots"
                                height="auto" minHeight="$4" paddingVertical="$3"
                                disabled={!completeDraft || locked || !connected || !available || busy || !serialMatches}
                                onPress={onWrite}>
                            {running ? "WRITING" : "WRITE ALL THREE"}
                        </Button>
                    ) : (
                        <YStack gap="$2">
                            <Button accessibilityLabel="Retry slot write"
                                    height="auto" minHeight="$4" paddingVertical="$3"
                                    disabled={blocked}
                                    onPress={() => setConfirmation("retry")}>
                                {running ? "WRITING" : "RETRY WRITE"}
                            </Button>
                            <Button accessibilityLabel="Cancel slot write"
                                    height="auto" minHeight="$4" paddingVertical="$3"
                                    disabled={blocked} onPress={() => setConfirmation("cancel")}>
                                CANCEL WRITE
                            </Button>
                        </YStack>
                    )}
                </ScrollView>
            </View>
            <XbrwSheet open={picker !== null} onOpenChange={(open) => {
                if (!open) setPicker(null);
            }} title={`SLOT ${picker === null ? "" : SLOT_NAMES[picker]}`} heightPercent={80}>
                <FlatList data={recipes} keyExtractor={(recipe) => recipe.uuid}
                          ListEmptyComponent={<Text color={palette.dim}>No recipes in your library.</Text>}
                          renderItem={({item}) => (
                              <RecipeChoice recipe={item} onPick={() => {
                                  if (picker === null) return;
                                  if (onAssign(picker, item) !== false) setPicker(null);
                              }}/>
                          )}/>
            </XbrwSheet>
            <XbrwSheet open={confirmation !== null} onOpenChange={(open) => {
                if (!open) setConfirmation(null);
            }} title={confirmation === "retry" ? "RETRY WRITE" : "CANCEL WRITE"} heightPercent={60}>
                <YStack gap="$4" padding="$4">
                    <Text color={palette.text}>
                        {confirmation === "retry"
                            ? "Retrying all three slots is only safe once the machine is back to its normal screen, with no saving animation."
                            : "Cancelling clears the unfinished write from XBRW++. It does not stop a write on the machine. Only cancel once the machine is back to its normal screen, with no saving animation."}
                    </Text>
                    <Text color={palette.dim}>
                        {confirmation === "retry" && recoveryKnown
                            ? "If it still shows a saving animation, finish the interrupted write instead. Do not start a brew."
                            : "If it still shows a saving animation, leave this write open. Do not start a brew. Reconnect and check the display again before retrying or cancelling."}
                    </Text>
                    <Button accessibilityLabel={confirmation === "retry"
                        ? "Confirm machine is back to normal and retry"
                        : "Confirm machine is back to normal and cancel"}
                            height="auto" minHeight="$4" paddingVertical="$3"
                            onPress={() => {
                                const action = confirmation;
                                setConfirmation(null);
                                if (action === "retry") onRecover(true);
                                else if (action === "cancel") onCancel();
                            }}>
                        {confirmation === "retry" ? "BACK TO NORMAL, RETRY" : "BACK TO NORMAL, CANCEL"}
                    </Button>
                    {confirmation === "retry" && recoveryKnown && (
                        <Button height="auto" minHeight="$4" paddingVertical="$3"
                                accessibilityLabel="Finish write while machine is still saving"
                                onPress={() => {
                                    setConfirmation(null);
                                    onRecover(false);
                                }}>
                            STILL SAVING, FINISH WRITE
                        </Button>
                    )}
                    <Button onPress={() => setConfirmation(null)}>KEEP THIS WRITE</Button>
                </YStack>
            </XbrwSheet>
        </YStack>
    );
}
