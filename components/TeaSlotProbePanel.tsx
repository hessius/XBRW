import React, {useState} from "react";
import {ScrollView} from "react-native";
import * as Clipboard from "expo-clipboard";
import {Button, Input, Text, XStack, YStack, type ColorTokens} from "tamagui";
import {notify} from "@/components/XbrwToast";
import {palette} from "@/constants/colors";
import {prepareSet, SLOT_NAMES, type SlotObservation, type SlotRecord} from "@/library/slots/slotModel";
import {teaProbeOriginal} from "@/library/slots/teaSlotCandidate";
import {
    formatTeaProbeEvidence, nextTeaProbeCandidate, teaProbeFlags, teaProbeStatus
} from "@/library/slots/teaSlotProbe";

export type TeaSlotProbePanelProps = {
    record: SlotRecord;
    deviceId: string;
    serial: string | null;
    connected: boolean;
    available: boolean;
    busy: boolean;
    running: boolean;
    error: string | null;
    onWriteProbe: () => void;
    onRestore: () => void;
    onObserve: (trialId: string, observation: SlotObservation) => boolean;
};

const STATUS = {
    none: "UNTESTED candidate. One trial per approved candidate.",
    "pending-candidate": "Candidate saving is unresolved. Do not start A. Close this panel and use RETRY WRITE or CANCEL THIS WRITE.",
    "candidate-written": "Candidate storage confirmed. Tea hold/drain behavior is still UNTESTED until manually observed.",
    "candidate-unconfirmed": "Candidate or restoration was not confirmed. Do not start A. Restore the original set after resolving any incomplete write.",
    "pending-restore": "Original-set saving is unresolved. Do not brew. Close this panel and use RETRY WRITE or CANCEL THIS WRITE.",
    restored: "Original set restored. This trial is retained and copyable."
};

export default function TeaSlotProbePanel({
    record, deviceId, serial, connected, available, busy, running, error,
    onWriteProbe, onRestore, onObserve
}: TeaSlotProbePanelProps) {
    const experiment = record.experiment;
    const status = teaProbeStatus(record);
    const nextCandidate = nextTeaProbeCandidate(record);
    const shownCandidate = nextCandidate ?? experiment?.candidateId;
    const flags = shownCandidate === undefined ? null
        : `0x${teaProbeFlags(shownCandidate).toString(16).padStart(2, "0")}`;
    const [display, setDisplay] = useState(experiment?.observation?.display ?? "");
    const [held, setHeld] = useState(experiment?.observation?.heldSeconds?.toString() ?? "");
    const [drained, setDrained] = useState<boolean | null>(experiment?.observation?.drainedAsTea ?? null);
    const [note, setNote] = useState(experiment?.observation?.note ?? "");
    const [localError, setLocalError] = useState<string | null>(null);
    const [observationSaved, setObservationSaved] = useState(false);
    let original = nextCandidate === null ? experiment?.original : undefined;
    let preparationError: string | null = null;
    if (original === undefined) {
        try {
            original = teaProbeOriginal(record);
            prepareSet(original.slots);
        } catch (error) {
            preparationError = error instanceof Error ? error.message : String(error);
        }
    }
    const stale = experiment !== undefined && (experiment.deviceId !== deviceId
        || (serial !== null && experiment.serial !== serial));
    const block = deviceId === "" ? "Choose a machine first."
        : stale ? "Reconnect to the machine and serial that own this trial."
            : running ? "Wait for the current slot operation to finish."
                : record.journal !== null ? "Resolve the incomplete write before probing or restoring."
                    : !connected ? "Connect to this machine before writing or restoring."
                        : serial === null || serial.trim() === "" ? "Wait for the machine's reported serial."
                            : busy ? "Finish the running or held brew first."
                                : !available ? "The shared machine transport is unavailable." : null;
    const canWrite = __DEV__ && nextCandidate !== null && block === null && preparationError === null;
    const canRestore = experiment?.phase === "active" && block === null;

    function saveObservation(): void {
        if (experiment === undefined || running || stale) return;
        const seconds = held.trim() === "" ? null : Number(held);
        if (seconds !== null && (!Number.isFinite(seconds) || seconds < 0)) {
            setLocalError("Enter an actual held time in seconds, or leave it blank if unknown.");
            return;
        }
        setLocalError(null);
        setObservationSaved(onObserve(experiment.trialId, {
            at: Date.now(), display, heldSeconds: seconds, drainedAsTea: drained, note
        }));
    }

    async function copy(): Promise<void> {
        if (experiment === undefined) return;
        try {
            await Clipboard.setStringAsync(formatTeaProbeEvidence(experiment, record.experimentHistory ?? []));
            notify({tone: "success", message: "Tea slot probe evidence copied"});
        } catch (error) {
            notify({tone: "error", message: `Could not copy tea slot probe evidence: ${
                error instanceof Error ? error.message : String(error)}`});
        }
    }

    return (
        <ScrollView testID="tea-slot-probe-panel" keyboardShouldPersistTaps="handled"
            contentContainerStyle={{gap: 16, paddingBottom: 24}} contentInsetAdjustmentBehavior="automatic">
            <Text selectable color={palette.warn}>{STATUS[status]}</Text>
            {flags !== null && <Text selectable color={palette.text} fontWeight="600">
                {`${nextCandidate === null ? "This trial" : "Next trial"}: A flag ${flags}`}
            </Text>}
            {status === "restored" && nextCandidate === null && <Text color={palette.dim}>
                No further trial is approved. Current and archived evidence remain copyable.
            </Text>}
            <Text selectable color={palette.text}>
                A: 1 steep, 60 ml, 70 C, 60 s. Grinder OFF. No agitation or bypass. No leaves.
                B and C keep the exact original snapshots and flag 0x02.
                The encoded nominal dose is 5 g; do not put leaves in the brewer.
            </Text>
            {flags === "0x04" && <Text color={palette.dim}>
                Only A&apos;s flag changes from 0x02 to 0x04. The tea blob is unchanged.
            </Text>}
            {original !== undefined && <YStack gap="$2">
                <Text selectable color={palette.text}>
                    {original.source === "written"
                        ? `Originals: last written by XBRW++ ${new Date(original.writtenAt!).toLocaleString()}.`
                        : "Originals: complete phone draft set, not confirmed machine contents."}
                </Text>
                {original.slots.map((slot, index) => <Text key={SLOT_NAMES[index]} selectable color={palette.text}>
                    {`Original ${SLOT_NAMES[index]}: ${slot.name}`}
                </Text>)}
                <Text color={palette.dim}>
                    Restores the app-recorded set, not unknowable changes made through the official app.
                    Phone drafts remain distinct from restored machine snapshots.
                </Text>
            </YStack>}
            <Text selectable color={palette.dim}>
                {`Machine: ${(experiment?.deviceId ?? deviceId) || "unpaired"}\nSerial: ${experiment?.serial ?? serial ?? "unknown"}`}
            </Text>
            {experiment !== undefined && Object.entries(experiment.machine).map(([key, value]) =>
                <Text key={key} selectable color={palette.dim}>{`${key}: ${value}`}</Text>)}
            <Text color={palette.text}>
                After confirmed storage, inspect A on the machine before starting. Check grinder OFF and
                displayed values. Start A manually only, with the Omni Tea Brewer, an empty receiving vessel,
                adequate water, no leaves and the user present. Follow the device&apos;s physical safety
                instructions. Do not touch or move the hot brewer.
            </Text>
            <Text color={palette.warn}>
                Stop after refusal, incomplete or uncertain saving, or unexpected behavior. Never start a
                brew while this write is unresolved. No automatic brewing or restoration.
                Observe the actual hold time and whether it drains as tea, not as an ordinary coffee pour.
                Writes or a tea-looking display alone do not prove tea behavior.
            </Text>
            {[error, localError, block, preparationError].filter((value): value is string => value !== null)
                .map((value, index) => <Text key={index} selectable accessibilityRole="alert"
                    color={palette.danger}>{value}</Text>)}
            {nextCandidate !== null && __DEV__ && <Button height="auto" minHeight={44} paddingVertical="$3"
                disabled={!canWrite} onPress={() => { if (canWrite) onWriteProbe(); }}>WRITE PROBE</Button>}
            {experiment?.phase === "active" && <Button height="auto" minHeight={44} paddingVertical="$3"
                disabled={!canRestore} onPress={() => { if (canRestore) onRestore(); }}>RESTORE ORIGINAL SET</Button>}
            {experiment !== undefined && <YStack gap="$3">
                <Text color={palette.text}>Manual observation (separate from radio evidence)</Text>
                <Input accessibilityLabel="Actual machine display" value={display}
                    onChangeText={value => { setDisplay(value); setObservationSaved(false); }}
                    placeholder="What A actually displayed" color={palette.text} backgroundColor={palette.raised}
                    placeholderTextColor={palette.placeholder as ColorTokens}/>
                <Input accessibilityLabel="Observed held seconds" value={held} keyboardType="decimal-pad"
                    onChangeText={value => { setHeld(value); setObservationSaved(false); }}
                    placeholder="Seconds held; blank means unknown" color={palette.text}
                    backgroundColor={palette.raised} placeholderTextColor={palette.placeholder as ColorTokens}/>
                <Text color={palette.text}>Drained as tea?</Text>
                <XStack gap="$2" flexWrap="wrap">
                    {(["Unknown", "Yes", "No"] as const).map((label, index) => {
                        const value = index === 0 ? null : index === 1;
                        return <Button key={label} accessibilityLabel={`Drained as tea: ${label}`}
                            accessibilityState={{selected: drained === value}}
                            backgroundColor={drained === value ? palette.raised : palette.surface}
                            onPress={() => { setDrained(value); setObservationSaved(false); }}>{label}</Button>;
                    })}
                </XStack>
                <Input accessibilityLabel="Tea probe observation note" value={note} multiline
                    onChangeText={value => { setNote(value); setObservationSaved(false); }}
                    color={palette.text} backgroundColor={palette.raised}/>
                <Button height="auto" minHeight={44} paddingVertical="$3" disabled={running || stale}
                    onPress={saveObservation}>SAVE OBSERVATION</Button>
                {observationSaved && <Text color={palette.success}>Observation saved on this phone.</Text>}
                <Button height="auto" minHeight={44} paddingVertical="$3" onPress={() => void copy()}>
                    COPY PROBE EVIDENCE
                </Button>
                <Text color={palette.dim}>
                    Copy includes current and archived trials with saved observations only. Save edits before copying.
                </Text>
            </YStack>}
        </ScrollView>
    );
}
