import React from "react";
import {Pressable} from "react-native";
import {Text, XStack, YStack} from "tamagui";

import DotIcon from "@/components/DotIcon";
import {openLink} from "@/components/openLink";
import {useAppearance} from "@/hooks/useAppearance";

/** Where the tap goes. */
export const SUPPORT_URL = "https://buymeacoffee.com/hsus";

export const SUPPORT_TITLE = "Buy me a coffee";
export const SUPPORT_BODY =
    "Built by one person in his own time. Free and open source. If you want to, I won't refuse.";

export function SupportAction() {
    const {palette, onBrand} = useAppearance();
    return (
        <Pressable testID="support-action" accessibilityRole="link"
                   accessibilityLabel={`${SUPPORT_TITLE}. Opens in your browser.`}
                   onPress={() => openLink(SUPPORT_URL)}
                   style={({pressed}) => ({
                       minHeight: 44, maxWidth: "100%",
                       justifyContent: "center",
                       paddingHorizontal: 12, paddingVertical: 10,
                       borderRadius: 12, backgroundColor: palette.brandFill,
                       opacity: 1,
                       transform: [{scale: pressed ? 0.98 : 1}]
                   })}>
            <Text color={onBrand.text} fontSize={13} fontWeight="700">
                {SUPPORT_TITLE}
            </Text>
        </Pressable>
    );
}

/**
 * The tip jar.
 *
 * The full-size counterpart to Settings' compact header action.
 * `brand` is documented as marking the app being itself and never a
 * state, which is exactly what this is: the author asking, not the app
 * reporting. The one exception is a switch that is on (`switchColours`);
 * position carries the state too, so the colour is reinforcement, not the
 * only cue. It is loud on purpose. Almost nobody opens an About screen, and a
 * row that reads like every other row is a row that gets scrolled past.
 *
 * It unlocks nothing and remembers nothing. There is no receipt, no thanks
 * screen and no "already supported" flag, so it needs no setting, which keeps
 * it out of `Settings.DEFAULTS` and out of the backup snapshot.
 *
 * Both lines take solid `onBrand.text`, which is white. The tile is filled with
 * `brandFill` rather than `brand` itself to make that readable: `brand` is also
 * used as ink on the dark surfaces, so it has to stay light, and white on it
 * measures only 3.78:1. `brandFill` is the same magenta deepened until white
 * clears AA at 5.36:1, which is within a whisker of the 5.18:1 the dark ink
 * used to measure, so the tile reads at the weight it always did.
 *
 * There is no softer second ink. The hierarchy between the two lines comes from
 * size and weight, as it did when the ink was dark.
 */
export default function SupportTile() {
    const {palette, onBrand} = useAppearance();
    return (
        // One label for the whole tile, the way `SettingsActionRow` composes
        // its label and detail: the body is the reason for the tap, not a hint,
        // and a VoiceOver hint can be switched off. "Opens in your browser"
        // because a link that leaves the app should say so before it is taken.
        //
        // Scale preserves the measured brand pair, including its translucent
        // chevron, on the Pressable's own pressed state rather than a Tamagui
        // `pressStyle` -- this is a plain React Native Pressable and RN's press
        // system does not drive Tamagui's.
        <Pressable accessibilityRole="link"
                   accessibilityLabel={`${SUPPORT_TITLE}. ${SUPPORT_BODY} Opens in your browser.`}
                   onPress={() => openLink(SUPPORT_URL)}
                   style={({pressed}) => ({
                       opacity:   1,
                       transform: [{scale: pressed ? 0.98 : 1}]
                   })}>
            <XStack testID="support-tile"
                    alignItems="center" justifyContent="space-between" gap="$4"
                    minHeight={44} marginTop="$4"
                    paddingVertical="$3" paddingHorizontal="$4"
                    backgroundColor={palette.brandFill} borderRadius="$5">
                <YStack flex={1} gap="$1">
                    <Text fontSize={16} fontWeight="700" color={onBrand.text}>
                        {SUPPORT_TITLE}
                    </Text>
                    <Text fontSize={13} lineHeight={18} color={onBrand.text}>
                        {SUPPORT_BODY}
                    </Text>
                </YStack>
                {/* Decorative: the tile is already one labelled link, so the
                    glyph must not become a second accessibility element. The
                    chevron is the `back` glyph rotated, as everywhere else. */}
                <XStack style={{transform: [{rotate: "180deg"}]}}>
                    <DotIcon name="back" size={14} color={onBrand.marker}/>
                </XStack>
            </XStack>
        </Pressable>
    );
}
