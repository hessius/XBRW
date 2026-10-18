import React from "react";
import {View} from "react-native";
import {Button, Text, YStack} from "tamagui";

import DotBloom from "@/components/DotBloom";
import DotMatrixText from "@/components/DotMatrixText";
import {onAccent, palette} from "@/constants/colors";

const MARK_SIZE = 96;
const MARK_DOT_SIZE = 5;

/**
 * What the list area shows when there are no recipes.
 *
 * It replaces the list only. The header and all three CTA tiles stay exactly
 * where they are, so the first thing a new user sees is the three things they
 * can do, which is also why there is normally no button in here.
 *
 * The one exception is `browse`: somebody who subscribed to a roaster from
 * its import link has a fourth thing to do, and it is the likeliest one, so
 * the empty library offers that roaster's coffees. Absent without a
 * subscription, so a new user's first screen is unchanged.
 */
export default function EmptyLibrary({browse}: {
    browse?: {label: string; onPress: () => void};
} = {}) {
    return (
        <YStack flex={1} alignItems="center" justifyContent="center"
                gap="$4" paddingHorizontal="$6" paddingVertical="$8">
            {/* The bloom is the app's mark here, not a progress report. */}
            <View accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants">
                <DotBloom progress={0} size={MARK_SIZE} dotSize={MARK_DOT_SIZE}/>
            </View>

            {/* Doto, to match the empty states on its sibling screens: brew
                history says NO BREWS YET and the brew record says NO TRACE
                KEPT. This one was Inter sentence case, which made the same
                moment look like two different apps depending on which list you
                had emptied. */}
            <YStack alignItems="center" gap="$2">
                <DotMatrixText fontSize={14} weight="bold" letterSpacing={1.6}
                               color={palette.dim}>
                    NO RECIPES YET
                </DotMatrixText>
                <Text fontSize={13} textAlign="center" color={palette.muted}>
                    Read a card, import a recipe, or write one from scratch using
                    the buttons above.
                </Text>
            </YStack>

            {browse !== undefined && (
                <Button testID="empty-library-browse"
                        accessibilityRole="button"
                        accessibilityLabel={browse.label}
                        backgroundColor={palette.text}
                        color={onAccent.text}
                        borderRadius="$4"
                        minHeight={44}
                        onPress={browse.onPress}>
                    {browse.label.toUpperCase()}
                </Button>
            )}
        </YStack>
    );
}
