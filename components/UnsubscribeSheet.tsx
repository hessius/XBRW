import React from "react";
import {Pressable} from "react-native";
import {Text, XStack, YStack} from "tamagui";

import DotMatrixText from "@/components/DotMatrixText";
import XbrwSheet from "@/components/XbrwSheet";
import {onAccent, palette} from "@/constants/colors";

/**
 * Asks before a roaster subscription ends.
 *
 * Built like `RemoveShelfSheet`, and it says the same reassuring thing for
 * the same reason: what people fear losing is the recipes, and none of them
 * go anywhere. Only the roaster's catalogue goes.
 */
export default function UnsubscribeSheet({open, roaster, onOpenChange, onConfirm}: {
    open: boolean;
    roaster: string;
    onOpenChange: (open: boolean) => void;
    onConfirm: () => void;
}) {
    return (
        <XbrwSheet open={open} onOpenChange={onOpenChange}
                   title={`Unsubscribe from ${roaster}?`} heightPercent={32}>
            <YStack gap="$3" paddingHorizontal="$4" paddingBottom="$4">
                <Text fontSize={13} color={palette.dim}>
                    {`${roaster}'s coffees leave the catalogue. Recipes in your library stay.`}
                </Text>

                <Pressable accessibilityRole="button"
                           accessibilityLabel={`Unsubscribe from ${roaster}`}
                           testID="unsubscribe-confirm"
                           onPress={onConfirm}>
                    <XStack height={48} alignItems="center" justifyContent="center"
                            borderRadius="$4" backgroundColor={palette.danger}>
                        <DotMatrixText fontSize={13} weight="bold" letterSpacing={1.5}
                                       color={onAccent.text}>
                            UNSUBSCRIBE
                        </DotMatrixText>
                    </XStack>
                </Pressable>

                <Pressable accessibilityRole="button"
                           accessibilityLabel="Stay subscribed"
                           testID="unsubscribe-cancel"
                           onPress={() => onOpenChange(false)}>
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
