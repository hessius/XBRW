import React from "react";
import {Pressable, ScrollView, View} from "react-native";
import {Text, XStack, YStack} from "tamagui";

import DotIcon from "@/components/DotIcon";
import DotMatrixText from "@/components/DotMatrixText";
import MachineColourDot from "@/components/MachineColourDot";
import XbrwSheet from "@/components/XbrwSheet";
import {useAppearance} from "@/hooks/useAppearance";
import type {MachineModel} from "@/library/machine/machineModel";
import {
    machineColourOf,
    machineLabel,
    machineOrderWord,
    machineTag,
    splitByRange,
    type SavedMachine
} from "@/library/machine/savedMachines";

/** What each model is called on screen. The settings row says the same. */
export const MODEL_NAMES: Record<MachineModel, string> = {
    studio:   "Studio",
    original: "Original"
};

/** Where the picker's look around has got to. */
export type MachineSurveyState = {
    /** Ids heard by the latest scan, or null if nobody has looked yet. */
    heard: string[] | null;
    looking: boolean;
    /** Why the last look failed, such as Bluetooth being off, or null. */
    error: string | null;
};

type Props = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    machines: SavedMachine[];
    activeId: string;
    /** Whether the active machine holds a link right now. */
    connected: boolean;
    survey: MachineSurveyState;
    onRescan: () => void;
    /** Why the machine cannot be changed now, or null. Locks every row. */
    blocker: string | null;
    onChoose: (id: string) => void;
};

type RowKind = "connected" | "nearby" | "away";

const ROW_WORDS: Record<RowKind, string> = {
    connected: "CONNECTED",
    nearby:    "NEARBY",
    away:      "NOT NEARBY"
};

/** One saved machine. At module scope, so a repaint does not remount it. */
function MachineRow({machine, index, count, kind, selectable, onChoose}: {
    machine: SavedMachine;
    index: number;
    count: number;
    kind: RowKind;
    selectable: boolean;
    onChoose: (id: string) => void;
}) {
    const appearance = useAppearance();
    const {palette} = appearance;
    const name = machineLabel(machine, index);
    const order = machineOrderWord(index, count);
    const detail = [MODEL_NAMES[machine.model], order, machineTag(machine)]
        .filter((part) => part !== null).join(" · ");
    const words = ROW_WORDS[kind];
    const ink = kind === "connected" ? palette.success : kind === "nearby" ? palette.text : palette.muted;

    return (
        <Pressable accessibilityRole="button"
                   accessibilityLabel={`${name}, ${detail}, ${words.toLowerCase()}`}
                   // The connected row is the current choice, not an
                   // unavailable one, so it says selected and nothing else.
                   accessibilityState={kind === "connected"
                       ? {selected: true}
                       : {disabled: !selectable}}
                   // Not `disabled` on the connected row: Pressable would add
                   // `disabled` to its state, and it is chosen, not unavailable.
                   disabled={!selectable && kind !== "connected"}
                   onPress={selectable ? () => onChoose(machine.id) : undefined}
                   style={({pressed}) => ({
                       opacity: kind === "away" ? 0.5 : pressed && selectable ? 0.7 : 1
                   })}>
            <XStack testID={`machine-pick-${machine.id}`} minHeight={56} alignItems="center"
                    gap="$3" paddingHorizontal="$3" paddingVertical="$2.5" borderRadius="$3"
                    borderWidth={1}
                    borderColor={kind === "connected" ? palette.success : palette.line}
                    backgroundColor={palette.raised}>
                {/* Decorative: the row's label already says "Tried 1st". */}
                <YStack width={16} alignItems="center">
                    {index === 0 && <DotIcon name="favourite" size={14} color={palette.dim}/>}
                </YStack>
                <YStack flex={1} gap="$1">
                    <XStack alignItems="center" gap="$2">
                        <MachineColourDot testID={`machine-pick-colour-${machine.id}`}
                                          colour={appearance.machineColour(machineColourOf(machine)).ink}/>
                        <Text fontSize={16} color={kind === "away" ? palette.dim : palette.text}
                              numberOfLines={1} flexShrink={1}>{name}</Text>
                    </XStack>
                    <Text fontSize={13} color={palette.dim} numberOfLines={1}>{detail}</Text>
                </YStack>
                <DotMatrixText fontSize={11} weight="bold" letterSpacing={1.6} color={ink}>
                    {words}
                </DotMatrixText>
            </XStack>
        </Pressable>
    );
}

/** A group heading, announced as one by a screen reader. */
function Heading({group, children}: {group: RowKind; children: string}) {
    const {palette} = useAppearance();
    return (
        <View accessible accessibilityRole="header" accessibilityLabel={children}
              style={{marginTop: 8}}>
            <DotMatrixText testID={`machine-heading-${group}`}
                           fontSize={11} weight="bold" letterSpacing={1.6} color={palette.dim}>
                {children}
            </DotMatrixText>
        </View>
    );
}

/**
 * Which saved xBloom to use, from the home screen's machine panel and the
 * editor's machine chip. One sheet for both, so the two doors cannot drift.
 *
 * Three groups, in the order somebody in a cafe needs them: the machine
 * connected now, the saved machines the last scan heard (one tap switches),
 * and the saved machines it did not hear, greyed and not selectable. A
 * machine that was not heard cannot be connected to either, so offering it
 * would only be an offer to wait for a timeout. RESCAN looks again.
 *
 * It only switches. Naming, ordering and removing live in Settings. Picking a
 * row sends nothing but a connect: no recipe, and no brew.
 */
export default function MachinePickerSheet({
    open, onOpenChange, machines, activeId, connected, survey, onRescan, blocker, onChoose
}: Props) {
    const {palette} = useAppearance();
    const connectedId = connected ? activeId : null;
    const {inRange, away} = splitByRange(machines, survey.heard, connectedId);
    const current = inRange.filter(({machine}) => machine.id === connectedId);
    const nearby = inRange.filter(({machine}) => machine.id !== connectedId);
    const locked = blocker !== null;
    const choose = (id: string) => {
        onOpenChange(false);
        onChoose(id);
    };

    let note: string;
    if (blocker !== null) note = blocker;
    else if (survey.looking) note = "Looking for your machines…";
    else if (survey.error !== null) note = survey.error;
    else if (survey.heard !== null && nearby.length === 0 && current.length === 0) {
        note = "None of your saved machines is nearby. Check one is switched on, then rescan.";
    } else {
        note = "XBRW++ connects to the highest machine in your order that is nearby. "
            + "A machine you pick here stays picked until the app is closed.";
    }

    return (
        <XbrwSheet open={open} onOpenChange={onOpenChange} title="Machine" heightPercent={70}>
            {/* Scrolls, because a cafe can save ten machines and a sheet has
                a fixed height. */}
            <ScrollView testID="machine-pick-scroll" style={{flex: 1}}
                        contentContainerStyle={{paddingHorizontal: 16, paddingBottom: 24, gap: 8}}>
                <Text testID="machine-pick-note" fontSize={13} color={palette.dim}>{note}</Text>

                {current.length > 0 && <Heading group="connected">CONNECTED</Heading>}
                {current.map(({machine, index}) => (
                    <MachineRow key={machine.id} machine={machine} index={index}
                                count={machines.length} kind="connected"
                                selectable={false} onChoose={choose}/>
                ))}

                {nearby.length > 0 && <Heading group="nearby">NEARBY</Heading>}
                {nearby.map(({machine, index}) => (
                    <MachineRow key={machine.id} machine={machine} index={index}
                                count={machines.length} kind="nearby"
                                selectable={!locked} onChoose={choose}/>
                ))}

                {away.length > 0 && (
                    <Heading group="away">
                        {survey.heard === null ? "NOT LOOKED FOR YET" : "NOT NEARBY"}
                    </Heading>
                )}
                {away.map(({machine, index}) => (
                    <MachineRow key={machine.id} machine={machine} index={index}
                                count={machines.length} kind="away"
                                selectable={false} onChoose={choose}/>
                ))}

                <Pressable accessibilityRole="button" accessibilityLabel="Rescan for machines"
                           accessibilityState={{disabled: survey.looking || locked}}
                           disabled={survey.looking || locked}
                           onPress={onRescan}>
                    <YStack testID="machine-rescan" marginTop="$2" minHeight={44}
                            alignItems="center" justifyContent="center" borderRadius="$4"
                            borderWidth={1} borderColor={palette.line}
                            opacity={survey.looking || locked ? 0.5 : 1}>
                        <DotMatrixText fontSize={11} weight="bold" letterSpacing={2}
                                       color={palette.dim}>
                            {survey.looking ? "LOOKING…" : "RESCAN"}
                        </DotMatrixText>
                    </YStack>
                </Pressable>
            </ScrollView>
        </XbrwSheet>
    );
}
