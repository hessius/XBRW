import {useAppearance} from "@/hooks/useAppearance";
import React from "react";
import {Pressable, ScrollView} from "react-native";
import {Text, XStack, YStack} from "tamagui";

import DotMatrixText from "@/components/DotMatrixText";
import XbrwSheet from "@/components/XbrwSheet";


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
    const appearance = useAppearance();
    const {palette} = appearance;
    const onAccent = appearance.onFill(palette.danger);
    return (
        <XbrwSheet open={open} onOpenChange={onOpenChange}
                   title="Unsubscribe?" heightPercent={32}>
            <ScrollView testID="unsubscribe-scroll" style={{flex: 1, minHeight: 0, flexShrink: 1}}>
                <YStack gap="$3" paddingHorizontal="$4" paddingBottom="$4">
                    <Text fontSize={13} color={palette.dim}>
                        {`${roaster}'s coffees leave the catalogue. Recipes in your library stay.`}
                    </Text>

                    <Pressable accessibilityRole="button"
                               accessibilityLabel={`Unsubscribe from ${roaster}`}
                               testID="unsubscribe-confirm"
                               onPress={onConfirm}>
                        <XStack minHeight={48} paddingVertical="$3" alignItems="center" justifyContent="center"
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
                        <XStack minHeight={48} paddingVertical="$3" alignItems="center" justifyContent="center"
                                borderRadius="$4" borderWidth={1} borderColor={palette.line}>
                            <DotMatrixText fontSize={13} weight="bold" letterSpacing={1.5}
                                           color={palette.dim}>
                                KEEP IT
                            </DotMatrixText>
                        </XStack>
                    </Pressable>
                </YStack>
            </ScrollView>
        </XbrwSheet>
    );
}
