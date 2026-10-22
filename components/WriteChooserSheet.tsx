import React from "react";
import {Pressable} from "react-native";
import {Text, XStack, YStack} from "tamagui";

import DotIcon from "@/components/DotIcon";
import DotMatrixText from "@/components/DotMatrixText";
import XbrwSheet from "@/components/XbrwSheet";
import {useAppearance} from "@/hooks/useAppearance";
import type {DotIconName} from "@/constants/dotIcons";

/** Two rows and nothing that scrolls, so the sheet is sized to them. */
export const WRITE_CHOOSER_HEIGHT = 36;

type Props = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Goes to Assign to Easy Mode, which saves an unsaved recipe first. */
    onEasyMode: () => void;
    /** The editor's own card write, bypass question and all. */
    onCard: () => void;
};

/**
 * Where WRITE puts the recipe, asked only when there is a machine.
 *
 * A recipe can go to the machine's Easy Mode slots or onto an NFC card. With
 * no machine remembered there are no slots to choose, so WRITE goes straight
 * to the card and this sheet never opens. The rows follow the editor's more
 * menu (`RecipeOverflowSheet`): a picked row closes the sheet, then acts.
 */
export default function WriteChooserSheet({open, onOpenChange, onEasyMode, onCard}: Props) {
    const {palette} = useAppearance();
    function pick(action: () => void) {
        onOpenChange(false);
        action();
    }

    const row = (label: string, icon: DotIconName, detail: string, action: () => void, testID: string) => (
        <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityHint={detail}
                   testID={testID} onPress={() => pick(action)}>
            <XStack alignItems="center" gap="$3" paddingVertical="$3"
                    paddingHorizontal="$3" backgroundColor={palette.raised}
                    borderRadius="$4">
                <DotIcon name={icon} size={16} color={palette.text}/>
                <YStack flex={1} gap="$1">
                    <DotMatrixText fontSize={11} weight="bold" letterSpacing={1.8} color={palette.text}>
                        {label.toUpperCase()}
                    </DotMatrixText>
                    <Text fontSize={13} color={palette.dim}>{detail}</Text>
                </YStack>
            </XStack>
        </Pressable>
    );

    return (
        <XbrwSheet open={open} onOpenChange={onOpenChange} title="WRITE TO"
                   heightPercent={WRITE_CHOOSER_HEIGHT}>
            <YStack gap="$2" paddingBottom="$4">
                {row("Easy Mode slot", "brew", "Put it in slot A, B or C on your machine.",
                    onEasyMode, "write-choice-easy-mode")}
                {row("NFC card", "write", "Write it to an xBloom recipe card.",
                    onCard, "write-choice-card")}
            </YStack>
        </XbrwSheet>
    );
}
