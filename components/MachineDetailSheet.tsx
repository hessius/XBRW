import React, {useState} from "react";
import {Pressable, ScrollView, TextInput, View} from "react-native";
import {Text, XStack, YStack} from "tamagui";

import SegmentedControl from "@/components/SegmentedControl";
import SettingsActionRow from "@/components/SettingsActionRow";
import {MODEL_NAMES} from "@/components/MachinePickerSheet";
import XbrwSheet from "@/components/XbrwSheet";
import {notify} from "@/components/XbrwToast";
import {machineColours, palette} from "@/constants/colors";
import {useMachine} from "@/hooks/useMachine";
import {useSavedMachines} from "@/hooks/useSavedMachines";
import {MACHINE_MODELS, isMachineModel, modelFromSerial} from "@/library/machine/machineModel";
import {
    MACHINE_LABEL_MAX,
    machineColourOf,
    machineLabel,
    machineTag
} from "@/library/machine/savedMachines";
import type {Settings} from "@/library/Settings";

const MODEL_OPTIONS = MACHINE_MODELS.map((value) => ({value, label: MODEL_NAMES[value]}));

/**
 * The machine's colour, one swatch per entry in `machineColours`.
 *
 * Radio buttons, named by colour, so a screen reader hears "Blue, selected"
 * and the choice never rests on telling hues apart. The chosen swatch also
 * carries a white ring, which says "this one" without any colour at all.
 */
function ColourChoice({value, onChange}: {value: number; onChange: (index: number) => void}) {
    return (
        <XStack accessibilityRole="radiogroup" accessibilityLabel="Colour" gap="$2"
                alignItems="center">
            {machineColours.map((colour, index) => {
                const chosen = index === value;
                return (
                    <Pressable key={colour.name} testID={`machine-colour-${index}`}
                               accessibilityRole="radio"
                               accessibilityLabel={colour.name}
                               accessibilityState={{selected: chosen, checked: chosen}}
                               onPress={() => onChange(index)}
                               style={{width: 44, height: 44, alignItems: "center",
                                       justifyContent: "center"}}>
                        <View style={{
                            width: 32, height: 32, borderRadius: 16,
                            borderWidth: 2,
                            borderColor: chosen ? palette.text : palette.none,
                            alignItems: "center", justifyContent: "center"
                        }}>
                            <View style={{width: 22, height: 22, borderRadius: 11,
                                          backgroundColor: colour.ink}}/>
                        </View>
                    </Pressable>
                );
            })}
        </XStack>
    );
}

type Props = {
    /** The machine on show, or null when the sheet is closed. */
    machineId: string | null;
    onClose: () => void;
    settings?: Settings;
};

/**
 * One saved machine: its name, its model, its place in the order, and the
 * way out of the list.
 *
 * Owned by the settings screen rather than by `MachineSection`, because a
 * sheet has to be a sibling of the screen's scroll view to have any height at
 * all (see the comment above `settings-screen` in `app/settings.tsx`).
 *
 * The name is committed when editing ends rather than on each keystroke, so
 * the chip on the editor does not flicker through "H", "Ho", "Hom".
 */
export default function MachineDetailSheet({machineId, onClose, settings}: Props) {
    const {machines, rename, setModel, setColour, makeDefault, move} = useSavedMachines(settings);
    const {remembered, status, changeBlocker, choose, forgetMachine}
        = useMachine(undefined, {settings});
    const index = machines.findIndex((entry) => entry.id === machineId);
    const machine = index < 0 ? null : machines[index];

    const [draft, setDraft] = useState(machine?.label ?? "");
    // Seeded per machine rather than per mount, the `RenameSheet` way: read at
    // render against the machine it was seeded for, never from an effect.
    const [seededFor, setSeededFor] = useState(machineId);
    if (seededFor !== machineId) {
        setSeededFor(machineId);
        setDraft(machine?.label ?? "");
    }

    function commitName(): void {
        if (machine !== null && draft.trim() !== machine.label) rename(machine.id, draft);
    }

    const active = machine !== null && machine.id === remembered;
    const title = machine === null ? "Machine" : machineLabel(machine, index);

    return (
        <XbrwSheet open={machine !== null}
                   onOpenChange={(next) => {
                       if (next) return;
                       commitName();
                       onClose();
                   }}
                   title={title} heightPercent={80}>
            {machine !== null && (
                // Scrolls: with the keyboard up on a small screen, or on a
                // folded phone's cover screen, the rows below the name field
                // would otherwise be out of reach.
                <ScrollView testID="machine-detail-scroll" style={{flex: 1}}
                            keyboardShouldPersistTaps="handled"
                            contentContainerStyle={{paddingHorizontal: 16, paddingBottom: 24}}>
                <YStack gap="$3">
                    <Text fontSize={13} color={palette.dim}>
                        {active
                            ? status === "connected" ? "Selected and connected." : "Selected. Not connected."
                            : index === 0 ? "Tried first." : `Tried after ${index} other${index === 1 ? "" : "s"}.`}
                    </Text>
                    <Text testID="machine-detail-id" fontSize={13} color={palette.dim}>
                        {machine.serial !== ""
                            ? `Serial ${machine.serial}. Printed on the machine, so you can check which one this is.`
                            : `${machineTag(machine)}. The serial shows here once it has connected.`}
                    </Text>

                    <TextInput
                        testID="machine-name-field"
                        accessibilityLabel="Machine name"
                        value={draft}
                        onChangeText={setDraft}
                        onEndEditing={commitName}
                        onSubmitEditing={commitName}
                        maxLength={MACHINE_LABEL_MAX}
                        returnKeyType="done"
                        placeholder="e.g. Home or Work"
                        placeholderTextColor={palette.placeholder}
                        autoCorrect={false}
                        style={{
                            fontSize:          16,
                            color:             palette.text,
                            backgroundColor:   palette.raised,
                            borderRadius:      12,
                            paddingHorizontal: 14,
                            paddingVertical:   12
                        }}/>

                    {/* Beside the name, because it is the same job: telling
                        this machine from the others at a glance. Only with
                        two or more saved, so one machine stays the green it
                        has always been. */}
                    {machines.length > 1 && (
                        <YStack gap="$1">
                            <Text fontSize={13} color={palette.dim}>
                                Colour. The link glyph on the home screen takes it while this machine is connected.
                            </Text>
                            <ColourChoice value={machineColours.indexOf(machineColourOf(machine))}
                                          onChange={(next) => setColour(machine.id, next)}/>
                        </YStack>
                    )}

                    {/* No choice once the serial has named the model: the
                        serial set it, and a choice could only point imports at
                        the wrong grind scale. */}
                    {modelFromSerial(machine.serial) === machine.model ? (
                        <Text testID="machine-detail-model" fontSize={13} color={palette.dim}>
                            {`${MODEL_NAMES[machine.model]}, read from its serial. Recipes are fetched for this model.`}
                        </Text>
                    ) : <YStack gap="$2">
                        <Text fontSize={13} color={palette.dim}>
                            Which xBloom this is. Recipes are fetched for the model of the machine in use, and grind
                            scales differ, so set each machine to its own model.
                        </Text>
                        <SegmentedControl value={machine.model} options={MODEL_OPTIONS}
                                          accessibilityLabel="Model"
                                          onChange={(value) => {
                                              if (isMachineModel(value)) setModel(machine.id, value);
                                          }}/>
                    </YStack>}

                    <YStack borderRadius="$4" backgroundColor={palette.surface} overflow="hidden">
                        {!(active && status === "connected") && (
                            <SettingsActionRow
                                label="Use this machine now"
                                detail={changeBlocker ?? "Connects to it until the app is closed."}
                                onPress={() => {
                                    if (changeBlocker !== null) return;
                                    commitName();
                                    onClose();
                                    // The sheet is closed by now, so the
                                    // outcome is said in a toast, the way the
                                    // picker says it.
                                    notify({tone: "info", message: `Connecting to ${title}…`});
                                    choose(machine.id).then(
                                        () => notify({tone: "success", message: `Connected to ${title}`}),
                                        (error: unknown) => notify({
                                            tone: "error",
                                            message: `${error instanceof Error ? error.message : String(error)} `
                                                + "Check it is switched on and nearby, then try again."
                                        })
                                    );
                                }}/>
                        )}
                        {index > 0 && (
                            <SettingsActionRow label="Try this one first"
                                               detail="Moves it to the top. When the app connects by itself, it takes the highest machine nearby."
                                               onPress={() => makeDefault(machine.id)}/>
                        )}
                        {index > 0 && (
                            <SettingsActionRow label="Move up"
                                               onPress={() => move(machine.id, -1)}/>
                        )}
                        {index < machines.length - 1 && (
                            <SettingsActionRow label="Move down"
                                               onPress={() => move(machine.id, 1)}/>
                        )}
                        <SettingsActionRow
                            label="Forget this machine" tone="danger"
                            // Locked like "Use this machine now": forgetting
                            // the machine in use mid-brew would hand the next
                            // BREW to another machine while this one pours.
                            detail={changeBlocker ?? (machines.length > 1
                                ? "Takes it off the list. Add it again to get it back."
                                : "XBRW++ will scan again next time.")}
                            onPress={() => {
                                if (changeBlocker !== null) return;
                                void forgetMachine(machine.id).then((gone) => {
                                    if (gone) onClose();
                                });
                            }}/>
                    </YStack>
                </YStack>
                </ScrollView>
            )}
        </XbrwSheet>
    );
}
