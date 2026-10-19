import React, {useState} from "react";
import {Pressable} from "react-native";
import {Text, XStack, YStack} from "tamagui";

import DotMatrixText from "@/components/DotMatrixText";
import XbrwSheet from "@/components/XbrwSheet";
import {onAccent, palette} from "@/constants/colors";
import {useMachine} from "@/hooks/useMachine";
import {machineLabel} from "@/library/machine/savedMachines";
import type {Settings} from "@/library/Settings";

type Props = {
    /** The machine to ask about, or null when the sheet is closed. */
    machineId: string | null;
    onClose: () => void;
    settings?: Settings;
};

/**
 * Asks before a saved machine is forgotten.
 *
 * Forget used to act on the tap, and the owner forgot a machine by accident.
 * There is no undo: the machine comes back only by being found again by a
 * scan, which needs it switched on and nearby. So the question comes first,
 * the way `RemoveShelfSheet` asks before a shelf goes.
 *
 * Owned by the settings screen, like `MachineDetailSheet`, because a sheet
 * inside the settings scroll view would have no height. Forgetting still goes
 * through `forgetMachine`, so the mid-brew and Easy Mode guards refuse here
 * exactly as they did on the row: a brew that starts while this is open is
 * still protected.
 */
export default function ForgetMachineSheet({machineId, onClose, settings}: Props) {
    const {machines, forgetMachine} = useMachine(undefined, {settings});
    const index = machines.findIndex((entry) => entry.id === machineId);
    // Kept while the sheet closes, so the title does not fall back to a
    // placeholder for the length of the closing animation.
    const [lastName, setLastName] = useState("this machine");
    const name = index < 0 ? lastName : machineLabel(machines[index], index);
    if (index >= 0 && name !== lastName) setLastName(name);
    const [forgetting, setForgetting] = useState(false);

    function confirm(): void {
        if (machineId === null || forgetting) return;
        setForgetting(true);
        void forgetMachine(machineId)
            .then((gone) => {
                if (gone) onClose();
            })
            .finally(() => setForgetting(false));
    }

    return (
        <XbrwSheet open={machineId !== null}
                   onOpenChange={(next) => {
                       if (!next) onClose();
                   }}
                   title={`Forget ${name}?`} heightPercent={34}>
            <YStack gap="$3" paddingHorizontal="$4" paddingBottom="$4">
                <Text fontSize={13} color={palette.dim}>
                    It comes off your list. To use it again, switch it on nearby and add it again.
                </Text>

                <Pressable accessibilityRole="button"
                           accessibilityLabel={`Forget ${name}`}
                           accessibilityState={{disabled: forgetting}}
                           testID="forget-machine-confirm"
                           onPress={confirm}>
                    <XStack height={48} alignItems="center" justifyContent="center"
                            borderRadius="$4" backgroundColor={palette.danger}>
                        <DotMatrixText fontSize={13} weight="bold" letterSpacing={1.5}
                                       color={onAccent.text}>
                            FORGET
                        </DotMatrixText>
                    </XStack>
                </Pressable>

                <Pressable accessibilityRole="button"
                           accessibilityLabel={`Keep ${name}`}
                           testID="forget-machine-keep"
                           onPress={onClose}>
                    <XStack height={48} alignItems="center" justifyContent="center"
                            borderRadius="$4" borderWidth={1} borderColor={palette.line}>
                        <DotMatrixText fontSize={13} weight="bold" letterSpacing={1.5}
                                       color={palette.dim}>
                            KEEP IT
                        </DotMatrixText>
                    </XStack>
                </Pressable>
            </YStack>
        </XbrwSheet>
    );
}
