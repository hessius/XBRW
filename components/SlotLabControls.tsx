import React, {useState} from "react";
import {Button, Text, YStack} from "tamagui";
import {palette} from "@/constants/colors";
import {type SlotRecord} from "@/library/slots/slotModel";
import {
    slotLabAvailable, SLOT_RECOVERY_PROBE_ID, TEA_SLOT_STEEPS_ID
} from "@/library/slots/teaSlotCandidate";

export type SlotLabActions = {
    onWriteLab: (candidateId: string) => void;
    onRecoveryCommand: () => void;
    onClearRecovery: () => void;
};

export default function SlotLabControls({record, blocked, onWriteLab, onRecoveryCommand, onClearRecovery}: {
    record: SlotRecord;
    blocked: boolean;
} & SlotLabActions) {
    const [confirm, setConfirm] = useState<"partial" | "command" | "clear" | null>(null);
    const recovery = record.experiment?.candidateId === SLOT_RECOVERY_PROBE_ID
        && record.experiment.phase === "active";
    const partial = recovery && record.experiment?.pending?.kind === "candidate"
        && record.journal?.acknowledged === 1 && record.journal.inFlight === null;
    const receipt = record.experiment?.evidence.at(-1)?.kind === "recovery-receipt";
    const canStartRecovery = !blocked && slotLabAvailable(record, SLOT_RECOVERY_PROBE_ID);
    const canCommand = !blocked && partial;
    const canClear = canCommand && receipt;
    const canConfirm = confirm === "partial" ? canStartRecovery
        : confirm === "command" ? canCommand : canClear;

    function run(): void {
        if (!canConfirm) return;
        if (confirm === "partial") onWriteLab(SLOT_RECOVERY_PROBE_ID);
        else if (confirm === "command") onRecoveryCommand();
        else if (confirm === "clear") onClearRecovery();
        setConfirm(null);
    }

    return <YStack gap="$3" testID="source-backed-slot-labs">
        <Text color={palette.text} fontWeight="600">Official app protocol tests</Text>
        <Text color={palette.dim}>
            A: 1 steep. B: 2 steeps. C: 3 steeps. Each steep is 90 ml at 92 C,
            held for 20 seconds. Grinder off, scale off, no leaves.
            Flags are 0x0C, 0x2C and 0x4C. Check the steep counter before manually running each slot.
            Drain behavior is not yet confirmed. Allow at least 360 ml for C.
        </Text>
        {__DEV__ && <>
            <Button height="auto" minHeight={44} paddingVertical="$3"
                disabled={blocked || !slotLabAvailable(record, TEA_SLOT_STEEPS_ID)}
                onPress={() => {
                    if (!blocked && slotLabAvailable(record, TEA_SLOT_STEEPS_ID)) onWriteLab(TEA_SLOT_STEEPS_ID);
                }}>WRITE STEEP TEST</Button>
            <Button height="auto" minHeight={44} paddingVertical="$3" disabled={!canStartRecovery}
                onPress={() => { if (canStartRecovery) setConfirm("partial"); }}>
                TEST SINGLE SLOT RECOVERY
            </Button>
            <Text color={palette.dim}>
                Each lab runs once. Restore your originals before starting the other test.
                The recovery test resends your preserved A, not a tea candidate.
            </Text>
        </>}
        {recovery && <YStack gap="$3">
            <Text color={palette.text}>
                {partial ? "A received. B and C have deliberately not been sent. The set is not saved."
                    : "Recovery trial retained. Finish any incomplete write, then restore your originals."}
            </Text>
            <Button height="auto" minHeight={44} paddingVertical="$3" disabled={!canCommand}
                onPress={() => { if (canCommand) setConfirm("command"); }}>TRY RECOVERY COMMAND</Button>
            {receipt && <Text color={palette.dim}>
                Command acknowledged. That does not prove the machine is usable or that its old slots survived.
                Check that the saving display stops and the machine responds to its physical controls.
            </Text>}
            {receipt && <Button height="auto" minHeight={44} paddingVertical="$3" disabled={!canClear}
                onPress={() => { if (canClear) setConfirm("clear"); }}>MACHINE IS USABLE</Button>}
            <Text color={palette.dim}>
                If recovery does not work, close LAB and use RETRY WRITE to finish B and C.
                After the write is resolved, return here to RESTORE ORIGINAL SET.
                Record the display and responsiveness in the observation note, then copy the evidence.
            </Text>
        </YStack>}
        {confirm !== null && <YStack gap="$3" padding="$3" backgroundColor={palette.raised}>
            <Text color={palette.warn}>
                {confirm === "partial"
                    ? "This sends only A. The saving screen usually clears after about a minute, so try recovery before then. Keep the app open. B and C are kept so you can finish the set."
                    : confirm === "command"
                        ? "Send the recovery command while the saving animation is still running. It returned the machine to normal in our hardware test. The unfinished set stays recorded until you confirm the machine is usable."
                        : "Confirm the saving display has stopped and the machine responds normally. This clears only the phone's pending write. Its slot contents remain unconfirmed until you restore the original set."}
            </Text>
            <Button height="auto" minHeight={44} paddingVertical="$3" disabled={!canConfirm} onPress={run}>
                {confirm === "partial" ? "WRITE ONLY A" : confirm === "command" ? "SEND 40526" : "CONFIRM MACHINE IS USABLE"}
            </Button>
            <Button onPress={() => setConfirm(null)}>NOT NOW</Button>
        </YStack>}
    </YStack>;
}
