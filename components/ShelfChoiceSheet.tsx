import React from "react";
import {Pressable, ScrollView} from "react-native";
import {Text, XStack, YStack} from "tamagui";

import DotIcon from "@/components/DotIcon";
import DotMatrixText from "@/components/DotMatrixText";
import XbrwSheet from "@/components/XbrwSheet";
import {palette} from "@/constants/colors";

/**
 * Which shelf a catalogue coffee goes on.
 *
 * The user's own shelves (the ones in YOUR SHELVES), in their order, and a
 * NEW SHELF row that hands over to `NameShelfSheet`. A shelf is what the user
 * owns, so the app never picks one for them.
 */
export default function ShelfChoiceSheet({open, shelves, onOpenChange, onChoose, onNew}: {
    open: boolean;
    /** The user's shelf names, as they spelled them. */
    shelves: readonly string[];
    onOpenChange: (open: boolean) => void;
    onChoose: (shelf: string) => void;
    onNew: () => void;
}) {
    const row = (label: string, icon: "shelves" | "plus", onPress: () => void, testID: string) => (
        <Pressable key={testID} accessibilityRole="button" accessibilityLabel={label}
                   testID={testID} onPress={onPress}>
            <XStack alignItems="center" gap="$3" paddingVertical="$3" paddingHorizontal="$3"
                    backgroundColor={palette.raised} borderRadius="$4">
                <DotIcon name={icon} size={16} color={palette.text}/>
                {icon === "plus" ? (
                    <DotMatrixText fontSize={11} weight="bold" letterSpacing={1.8}
                                   color={palette.text}>
                        NEW SHELF
                    </DotMatrixText>
                ) : (
                    <Text fontSize={15} color={palette.text} flexShrink={1}>{label}</Text>
                )}
            </XStack>
        </Pressable>
    );

    return (
        <XbrwSheet open={open} onOpenChange={onOpenChange} title="Add to shelf"
                   heightPercent={Math.min(70, 26 + shelves.length * 8)}>
            <ScrollView>
                <YStack gap="$2" paddingBottom="$4">
                    {shelves.map((shelf) => row(shelf, "shelves", () => onChoose(shelf),
                                                `shelf-choice-${shelf}`))}
                    {row("New shelf", "plus", onNew, "shelf-choice-new")}
                </YStack>
            </ScrollView>
        </XbrwSheet>
    );
}
