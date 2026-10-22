import {useAppearance} from "@/hooks/useAppearance";
import React from "react";
import {Text, XStack, YStack} from "tamagui";

import DotMatrixText from "@/components/DotMatrixText";


/**
 * What tea does differently, said out loud.
 *
 * `Recipe` special-cases tea in eight places and the old editor explained none
 * of them, so a user who typed 120 ml watched it become 90 with no account of
 * why.
 */
export default function TeaBanner({accent}: {accent: string}) {
    const appearance = useAppearance();
    const {palette} = appearance;
    return (
        <XStack marginTop="$3" padding="$3" borderRadius="$4" gap="$2.5"
                backgroundColor={palette.raised}
                borderLeftWidth={2} borderLeftColor={appearance.recipe(accent).ink}>
            <YStack flex={1} gap={3}>
                <DotMatrixText fontSize={11} weight="bold" letterSpacing={1.8}
                               color={appearance.recipe(accent).ink}>
                    TEA
                </DotMatrixText>
                <Text testID="tea-banner-body" fontSize={12} lineHeight={17}
                      color={palette.dim}>
                    Tea stages are capped at 90 ml each and the grinder is not used.
                    A tea cycle may dispense water after the programmed fill; the
                    brew view keeps that separate from the fill target.
                </Text>
            </YStack>
        </XStack>
    );
}
