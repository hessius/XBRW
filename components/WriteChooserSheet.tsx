import React from "react";
import {Pressable, ScrollView} from "react-native";
import {Text, XStack, YStack} from "tamagui";

import DotIcon from "@/components/DotIcon";
import DotMatrixText from "@/components/DotMatrixText";
import XbrwSheet from "@/components/XbrwSheet";
import {useAppearance} from "@/hooks/useAppearance";
import type {DotIconName} from "@/constants/dotIcons";

/** The rows can scroll when larger text exceeds the sheet. */
export const WRITE_CHOOSER_HEIGHT = 36;

type Props = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Goes to Easy Mode, saving an unsaved recipe first. */
    onEasyMode: () => void;
    /** The editor's own card write, bypass question and all. */
    onCard: () => void;
    easyModeProblem?: string | null;
    cardProblem?: string | null;
    oneTapEasyMode?: boolean;
};

/**
 * Where WRITE puts the recipe, asked only when there is a machine.
 *
 * A recipe can go to the machine's Easy Mode slots or onto an NFC card. With
 * no machine remembered there are no slots to choose, so WRITE goes straight
 * to the card and this sheet never opens. The rows follow the editor's more
 * menu (`RecipeOverflowSheet`): a picked row closes the sheet, then acts.
 */
export default function WriteChooserSheet({
    open, onOpenChange, onEasyMode, onCard, easyModeProblem = null, cardProblem = null, oneTapEasyMode = false
}: Props) {
    const {palette} = useAppearance();
    function pick(action: () => void) {
        onOpenChange(false);
        action();
    }

    const row = (
        label: string, icon: DotIconName, detail: string, action: () => void,
        testID: string, problem: string | null
    ) => (
        <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityHint={problem ?? detail}
                   accessibilityState={{disabled: problem !== null}} disabled={problem !== null}
                   testID={testID} onPress={() => pick(action)}>
            <XStack alignItems="center" gap="$3" paddingVertical="$3"
                    paddingHorizontal="$3" backgroundColor={palette.raised}
                    borderRadius="$4">
                <DotIcon name={icon} size={16} color={problem ? palette.muted : palette.text}/>
                <YStack flex={1} gap="$1">
                    <DotMatrixText fontSize={11} weight="bold" letterSpacing={1.8}
                                   color={problem ? palette.muted : palette.text}>
                        {label.toUpperCase()}
                    </DotMatrixText>
                    <Text fontSize={13} color={palette.dim}>{problem ?? detail}</Text>
                </YStack>
            </XStack>
        </Pressable>
    );

    return (
        <XbrwSheet open={open} onOpenChange={onOpenChange} title="WRITE TO"
                   heightPercent={WRITE_CHOOSER_HEIGHT}>
            <ScrollView>
                <YStack gap="$2" paddingBottom="$4">
                    {row("Easy Mode slot", "brew", oneTapEasyMode
                        ? "Choosing a slot writes all three slot drafts. Unsaved recipes are saved to your library first."
                        : "Assign to A, B or C. Unsaved recipes are saved to your library first.",
                        onEasyMode, "write-choice-easy-mode", easyModeProblem)}
                    {row("NFC card", "write", "Write it to an xBloom recipe card.",
                        onCard, "write-choice-card", cardProblem)}
                </YStack>
            </ScrollView>
        </XbrwSheet>
    );
}
