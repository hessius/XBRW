import React, {useState} from "react";
import {Image, Pressable} from "react-native";
import {Text, XStack, YStack} from "tamagui";

import DotMatrixText from "@/components/DotMatrixText";
import {palette} from "@/constants/colors";
import type {RoasterMatch} from "@/library/roasterHome";

const PHOTO = 56;
const PHOTO_RADIUS = 8;

/**
 * A subscribed roaster's coffee in the home search, under FROM YOUR ROASTERS.
 *
 * Shorter than the roaster list's row: the photo, the name, who roasts it and
 * the roast level. The rest is a tap away on the coffee's own screen, which
 * is where BREW NOW and ADD TO SHELF are.
 */
export default function RoasterSearchRow({match, onPress}: {
    match: RoasterMatch;
    onPress: () => void;
}) {
    const [failed, setFailed] = useState<string | null>(null);
    const {coffee, roaster} = match;
    const image = coffee.image ?? null;
    const roast = coffee.roast?.level;
    const spoken = [
        coffee.name,
        `from ${roaster}`,
        coffee.available ? undefined : "sold out",
        roast === undefined ? undefined : `${roast} roast`
    ].filter((part) => part !== undefined).join(", ");

    return (
        <Pressable testID={`roaster-result-${match.ref}`} accessibilityRole="button"
                   accessibilityLabel={spoken} onPress={onPress}
                   style={({pressed}) => ({opacity: pressed ? 0.7 : 1})}>
            <XStack alignItems="center" gap="$3" paddingHorizontal="$3" paddingVertical="$2"
                    opacity={coffee.available ? 1 : 0.6}>
                {image !== null && failed !== image ? (
                    <Image testID="roaster-result-photo" source={{uri: image}} onError={() => setFailed(image)}
                           style={{width: PHOTO, height: PHOTO, borderRadius: PHOTO_RADIUS}}/>
                ) : (
                    <YStack width={PHOTO} height={PHOTO} borderRadius={PHOTO_RADIUS}
                            backgroundColor={palette.raised}/>
                )}
                <YStack flex={1} minWidth={0} gap={2}>
                    <Text fontSize={15} fontWeight="700" color={palette.text} numberOfLines={2}>
                        {coffee.name}
                    </Text>
                    <Text fontSize={13} color={palette.dim} numberOfLines={1}>{roaster}</Text>
                    {(roast !== undefined || !coffee.available) && (
                        <DotMatrixText fontSize={11} weight="bold" letterSpacing={1.4}
                                       color={palette.dim} numberOfLines={1}>
                            {[roast?.toUpperCase(), coffee.available ? undefined : "SOLD OUT"]
                                .filter((part) => part !== undefined).join(" · ")}
                        </DotMatrixText>
                    )}
                </YStack>
            </XStack>
        </Pressable>
    );
}
