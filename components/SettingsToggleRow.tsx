import React from "react";
import {Text, XStack, YStack} from "tamagui";

import XbrwSwitch from "@/components/XbrwSwitch";
import {palette} from "@/constants/colors";

type Props = {
    label: string;
    description: string;
    value: boolean;
    onChange: (value: boolean) => void;
};

/** A setting that is on or off. */
export default function SettingsToggleRow({label, description, value, onChange}: Props) {
    return (
        // No borderBottom, and `paddingHorizontal="$4"` / `minHeight={44}` to
        // match the other rows inside `SettingsSection`'s card: the section owns
        // the dividers, the inset is the editor `FieldRow`'s, and the switch's
        // 44pt keeps the row a full touch target even when the description wraps
        // to a single line.
        <XStack alignItems="center" justifyContent="space-between" gap="$4"
                minHeight={44} paddingVertical="$3" paddingHorizontal="$4">
            <YStack flex={1} gap="$1">
                <Text fontSize={16} color={palette.text}>{label}</Text>
                <Text fontSize={13} color={palette.dim}>{description}</Text>
            </YStack>
            <XbrwSwitch accessibilityLabel={label} checked={value} onCheckedChange={onChange}/>
        </XStack>
    );
}
