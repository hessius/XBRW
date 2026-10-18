import React from "react";
import {Pressable} from "react-native";
import {Text, XStack, YStack} from "tamagui";

import DotMatrixText from "@/components/DotMatrixText";
import {palette, primary} from "@/constants/colors";

/**
 * The question asked when a recipe is imported again, the user has edited
 * their copy, and the roaster's version has moved on
 * (`library/importRefresh.ts`).
 *
 * Inline rather than a sheet of its own, because it appears where the import
 * already is: in the import sheet, or on the catalogue coffee that was added.
 * It says what survives either answer, because that is the worry.
 */
export default function NewerVersionPrompt({name, onLatest, onKeep}: {
    /** The user's name for their copy. */
    name: string;
    onLatest: () => void;
    onKeep: () => void;
}) {
    return (
        <YStack testID="newer-version" gap="$3" accessibilityLiveRegion="polite">
            <Text fontSize={15} fontWeight="700" color={palette.text}>
                The roaster has a newer version
            </Text>
            <Text fontSize={13} color={palette.dim}>
                {`You have changed ${name}. Your name, notes and brews stay either way.`}
            </Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Use the roaster's latest"
                       testID="newer-version-latest" onPress={onLatest}>
                <XStack height={48} alignItems="center" justifyContent="center"
                        borderRadius="$4" backgroundColor={primary.fill}>
                    <DotMatrixText fontSize={12} weight="bold" letterSpacing={1.5}
                                   color={primary.ink}>
                        USE THE ROASTER&apos;S LATEST
                    </DotMatrixText>
                </XStack>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Keep mine"
                       testID="newer-version-keep" onPress={onKeep}>
                <XStack height={48} alignItems="center" justifyContent="center"
                        borderRadius="$4" borderWidth={1} borderColor={palette.line}>
                    <DotMatrixText fontSize={12} weight="bold" letterSpacing={1.5}
                                   color={palette.dim}>
                        KEEP MINE
                    </DotMatrixText>
                </XStack>
            </Pressable>
        </YStack>
    );
}
