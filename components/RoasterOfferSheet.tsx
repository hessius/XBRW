import React, {useState} from "react";
import {Pressable} from "react-native";
import {Text, XStack, YStack} from "tamagui";

import DotMatrixText from "@/components/DotMatrixText";
import XbrwSheet from "@/components/XbrwSheet";
import {onAccent, palette} from "@/constants/colors";
import type {RoasterOfferState} from "@/hooks/useRoasterOffer";

const BUTTON_HEIGHT = 48;

export const ROASTER_OFFER_BODY =
    "Browse all their coffees and recipes. New coffees appear as they're released.";
const BOX = 20;

/**
 * Offers a subscription to a roaster's catalogue.
 *
 * Asked after an import link that names a roaster feed (`useRoasterOffer`).
 * Subscribing adds nothing to the library: it puts the roaster's coffees in
 * the catalogue, where each one can be brewed, added or shelved.
 *
 * The opt-out is a tick rather than a third button. "Not now" and "never"
 * are both a no, and a row of three equal buttons makes the permanent one
 * as easy to hit by accident as the polite one.
 */
export default function RoasterOfferSheet({state, onAccept, onDecline}: {
    state: RoasterOfferState;
    onAccept: (dontAskAgain: boolean) => void;
    onDecline: (dontAskAgain: boolean) => void;
}) {
    const [dontAsk, setDontAsk] = useState(false);
    const open = state.phase === "offer";
    // Kept while the sheet animates away, so it has something to draw.
    const [last, setLast] = useState("");
    if (state.phase === "offer" && state.roaster !== last) setLast(state.roaster);
    const roaster = state.phase === "offer" ? state.roaster : last;

    function answer(accepted: boolean) {
        const choice = dontAsk;
        setDontAsk(false);
        if (accepted) onAccept(choice);
        else onDecline(choice);
    }

    return (
        <XbrwSheet open={open} title={`Subscribe to ${roaster}?`} heightPercent={40}
                   onOpenChange={(next) => {
                       // Dismissing is "not now".
                       if (!next && state.phase === "offer") answer(false);
                   }}>
            <YStack gap="$3" paddingHorizontal="$4" paddingBottom="$4">
                {/* No count and no app name. The count is whatever the feed
                    held today and changes as coffees sell out, and the app's
                    name broke across a line between its two plus signs. */}
                <Text testID="roaster-offer-body" fontSize={13} color={palette.dim}>
                    {ROASTER_OFFER_BODY}
                </Text>

                <Pressable accessibilityRole="checkbox"
                           accessibilityState={{checked: dontAsk}}
                           accessibilityLabel="Don't ask again for this roaster"
                           testID="roaster-offer-dont-ask"
                           hitSlop={8}
                           onPress={() => setDontAsk((was) => !was)}>
                    <XStack alignItems="center" gap="$3" minHeight={44}>
                        <XStack width={BOX} height={BOX} borderRadius={4} borderWidth={1.5}
                                borderColor={dontAsk ? palette.text : palette.dim}
                                alignItems="center" justifyContent="center">
                            {dontAsk && (
                                <YStack width={BOX - 10} height={BOX - 10} borderRadius={2}
                                        backgroundColor={palette.text}/>
                            )}
                        </XStack>
                        <Text fontSize={13} color={palette.text} flexShrink={1}>
                            Don&apos;t ask again for this roaster
                        </Text>
                    </XStack>
                </Pressable>

                <Pressable accessibilityRole="button"
                           accessibilityLabel={`Subscribe to ${roaster}`}
                           testID="roaster-offer-subscribe"
                           onPress={() => answer(true)}>
                    <XStack height={BUTTON_HEIGHT} alignItems="center" justifyContent="center"
                            borderRadius="$4" backgroundColor={palette.text}>
                        <DotMatrixText fontSize={13} weight="bold" letterSpacing={1.5}
                                       color={onAccent.text}>
                            SUBSCRIBE
                        </DotMatrixText>
                    </XStack>
                </Pressable>

                <Pressable accessibilityRole="button" accessibilityLabel="Not now"
                           testID="roaster-offer-not-now"
                           onPress={() => answer(false)}>
                    <XStack height={BUTTON_HEIGHT} alignItems="center" justifyContent="center"
                            borderRadius="$4" borderWidth={1} borderColor={palette.line}>
                        <DotMatrixText fontSize={13} weight="bold" letterSpacing={1.5}
                                       color={palette.dim}>
                            NOT NOW
                        </DotMatrixText>
                    </XStack>
                </Pressable>
            </YStack>
        </XbrwSheet>
    );
}
