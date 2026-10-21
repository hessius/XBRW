import React from "react";
import {Pressable, ScrollView} from "react-native";
import {Text, XStack, YStack} from "tamagui";

import DotMatrixText from "@/components/DotMatrixText";
import XbrwSheet from "@/components/XbrwSheet";
import {palette} from "@/constants/colors";
import type {MachineAdder} from "@/hooks/useMachineAdder";
import {machineTag} from "@/library/machine/savedMachines";
import type {FoundMachine} from "@/library/machine/Transport";

/** One unsaved machine the scan heard. At module scope, so it is not remounted. */
function FoundRow({machine, nearest, busy, adding, onPick}: {
    machine: FoundMachine;
    nearest: boolean;
    busy: boolean;
    adding: boolean;
    onPick: (id: string) => void;
}) {
    const name = machine.name.trim() === "" ? "xBloom" : machine.name.trim();
    const tag = machineTag(machine);
    const hint = adding ? "CONNECTING…" : nearest ? "NEAREST" : "";
    return (
        <Pressable accessibilityRole="button"
                   accessibilityLabel={`${name}, ${tag}${nearest ? ", probably the nearest" : ""}`}
                   accessibilityState={{disabled: busy, busy: adding}}
                   disabled={busy}
                   onPress={() => onPick(machine.id)}
                   style={({pressed}) => ({opacity: busy && !adding ? 0.5 : pressed ? 0.7 : 1})}>
            <XStack testID={`machine-add-${machine.id}`} minHeight={56} alignItems="center"
                    gap="$3" paddingHorizontal="$3" paddingVertical="$2.5" borderRadius="$3"
                    borderWidth={1} borderColor={palette.line} backgroundColor={palette.raised}>
                <YStack flex={1} gap="$1">
                    <Text fontSize={16} color={palette.text} numberOfLines={1}>{name}</Text>
                    <Text fontSize={13} color={palette.dim}>{tag}</Text>
                </YStack>
                {hint !== "" && (
                    <DotMatrixText fontSize={11} weight="bold" letterSpacing={1.6} color={palette.dim}>
                        {hint}
                    </DotMatrixText>
                )}
            </XStack>
        </Pressable>
    );
}

/**
 * Pick which unsaved xBloom to add.
 *
 * Every unsaved machine the scan heard, with a short tag each, because in a
 * room with several the names alone are all "XBLOOM". The one heard loudest is
 * marked NEAREST as a hint and listed first; signal strength is a guess about
 * distance, so it only orders this list and never picks. The machine beeps
 * when it connects, which is how somebody standing among several confirms it
 * took the right one, and its serial is in its sheet afterwards.
 */
export default function MachineAddSheet({adder}: {adder: MachineAdder}) {
    const {open, close, looking, found, adding, error, pick, start} = adder;
    const machines = found ?? [];
    const loudest = machines.length > 1 && machines[0].rssi !== undefined ? machines[0].id : null;

    let note: string;
    if (looking) note = "Looking for xBloom machines that are not saved yet…";
    else if (error !== null) note = error;
    else if (machines.length === 0) {
        note = "No new xBloom found. Saved machines are skipped. Check the new one is switched on and nearby.";
    } else {
        note = "Pick the one to add. It beeps when XBRW++ connects, so you know it is the right one.";
    }

    return (
        <XbrwSheet open={open} onOpenChange={(next) => { if (!next) close(); }}
                   title="Add a machine" heightPercent={70}>
            <ScrollView testID="machine-add-scroll" style={{flex: 1}}
                        contentContainerStyle={{paddingHorizontal: 16, paddingBottom: 24, gap: 8}}>
                <Text testID="machine-add-note" fontSize={13}
                      color={error !== null && !looking ? palette.danger : palette.dim}>
                    {note}
                </Text>
                {machines.map((machine) => (
                    <FoundRow key={machine.id} machine={machine} nearest={machine.id === loudest}
                              busy={adding !== null} adding={adding === machine.id} onPick={pick}/>
                ))}
                <Pressable accessibilityRole="button" accessibilityLabel="Scan again"
                           accessibilityState={{disabled: looking || adding !== null}}
                           disabled={looking || adding !== null}
                           onPress={start}>
                    <YStack testID="machine-add-rescan" marginTop="$2" minHeight={44}
                            alignItems="center" justifyContent="center" borderRadius="$4"
                            borderWidth={1} borderColor={palette.line}
                            opacity={looking || adding !== null ? 0.5 : 1}>
                        <DotMatrixText fontSize={11} weight="bold" letterSpacing={2}
                                       color={palette.dim}>
                            {looking ? "LOOKING…" : "SCAN AGAIN"}
                        </DotMatrixText>
                    </YStack>
                </Pressable>
            </ScrollView>
        </XbrwSheet>
    );
}
