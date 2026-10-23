import React from "react";
import {Pressable} from "react-native";
import {XStack} from "tamagui";

import DotIcon from "@/components/DotIcon";
import DotMatrixText from "@/components/DotMatrixText";
import {useAppearance} from "@/hooks/useAppearance";

/** The HIG's smallest comfortable target, as in `HomeHeader` and `MachineDot`. */
const TOUCH_TARGET = 44;

/**
 * Which machine BREW will use, centred above the editor's deck switch.
 *
 * Only drawn with two or more machines saved. With one there is nothing to
 * choose, and a label on every recipe saying the same word would be chrome.
 *
 * Above the deck switch rather than in the hero. The hero is the recipe's own
 * header: its title, rename glyph and pour silhouette fill it, and it
 * collapses on scroll. A chip in there would crowd the one line the hero
 * exists for and then disappear. Here it sits on the screen's centre line,
 * where the request put it, and above all three decks, so it says which machine
 * the split BREW at the bottom will reach whichever deck is showing.
 *
 * Quiet on purpose: outline, dim ink, no accent. The recipe's accent belongs
 * to the recipe.
 */
export default function MachineChip({label, onPress}: {
    label: string;
    /**
     * Opens the picker, always. While a brew is running the sheet opens with
     * its rows locked and says why, which tells somebody more than a chip
     * that silently ignores the tap.
     */
    onPress: () => void;
}) {
    const {palette} = useAppearance();
    return (
        <XStack justifyContent="center">
            <Pressable testID="machine-chip"
                       accessibilityRole="button"
                       accessibilityLabel={`Machine, ${label}`}
                       accessibilityHint="Choose another saved machine"
                       onPress={onPress}
                       style={({pressed}) => ({opacity: pressed ? 0.7 : 1})}>
                <XStack minHeight={TOUCH_TARGET} alignItems="center" justifyContent="center">
                    <XStack alignItems="center" gap="$2" paddingHorizontal="$3" paddingVertical="$1.5"
                            borderRadius={999} borderWidth={1} borderColor={palette.line}
                            maxWidth={260}>
                        <DotMatrixText fontSize={11} weight="bold" letterSpacing={1.6}
                                       color={palette.muted}>
                            MACHINE
                        </DotMatrixText>
                        <DotMatrixText testID="machine-chip-label" fontSize={11} weight="bold"
                                       letterSpacing={1.6} color={palette.dim} numberOfLines={1}
                                       style={{flexShrink: 1}}>
                            {label.toUpperCase()}
                        </DotMatrixText>
                        <DotIcon name="chevron-down" size={10} color={palette.dim}/>
                    </XStack>
                </XStack>
            </Pressable>
        </XStack>
    );
}
