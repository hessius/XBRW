import React, {useState} from "react";
import {Image, Pressable} from "react-native";
import {Text, XStack, YStack} from "tamagui";

import DotMatrixText from "@/components/DotMatrixText";
import {palette} from "@/constants/colors";
import {bagLine, notesLine} from "@/library/roasterCatalogue";
import type {FeedCoffee} from "@/library/roasterFeed";

/** The hub row's measurements, so a roaster's list reads as the same catalogue. */
const PHOTO_SIZE = 104;
const PHOTO_RADIUS = 8;
const SIDE_PADDING = 12;
const ROW_PADDING = 8;

/**
 * One coffee in a roaster's catalogue.
 *
 * Built on `HubRow`'s layout rather than on the component itself: a hub row
 * leads with dose, ratio and grind, which a roaster's list does not have
 * until a recipe is opened. A coffee leads with what a bag says instead:
 * roast level, tasting notes, the sizes on sale, and whether it is on sale
 * at all. Sold out is shown, never hidden: a coffee someone has a bag of is
 * still worth looking up.
 */
export default function RoasterCoffeeRow({coffee, onPress, testID}: {
    coffee: FeedCoffee;
    onPress: () => void;
    testID: string;
}) {
    const [failed, setFailed] = useState(false);
    const image = coffee.image ?? null;
    const roast = coffee.roast?.level;
    const notes = notesLine(coffee.coffee.aromatics);
    const bags = bagLine(coffee);
    const spoken = [
        coffee.name,
        coffee.available ? undefined : "sold out",
        roast === undefined ? undefined : `${roast} roast`,
        notes,
        bags === null ? undefined : `bags ${bags.replace(/ · /g, ", ")}`
    ].filter((part) => part !== undefined).join(", ");

    return (
        <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={spoken}
                   onPress={onPress}>
            <XStack alignItems="center" maxWidth={600} paddingHorizontal={SIDE_PADDING}
                    paddingVertical={ROW_PADDING} gap="$3"
                    opacity={coffee.available ? 1 : 0.6}>
                {image !== null && !failed ? (
                    <Image testID="roaster-row-photo" source={{uri: image}}
                           onError={() => setFailed(true)}
                           style={{width: PHOTO_SIZE, height: PHOTO_SIZE, borderRadius: PHOTO_RADIUS}}/>
                ) : (
                    <YStack testID="roaster-row-photo-blank" width={PHOTO_SIZE} height={PHOTO_SIZE}
                            borderRadius={PHOTO_RADIUS} backgroundColor={palette.raised}/>
                )}

                <YStack flex={1} gap="$1">
                    {!coffee.available && (
                        <DotMatrixText testID="roaster-row-sold-out" fontSize={11} weight="bold"
                                       letterSpacing={1.4} color={palette.text}>
                            SOLD OUT
                        </DotMatrixText>
                    )}
                    <Text color={palette.text} fontSize={17} fontWeight="700" numberOfLines={2}>
                        {coffee.name}
                    </Text>
                    {roast !== undefined && (
                        <DotMatrixText testID="roaster-row-roast" fontSize={11} weight="bold"
                                       letterSpacing={1.4} color={palette.dim} numberOfLines={1}>
                            {roast.toUpperCase()}
                        </DotMatrixText>
                    )}
                    {notes !== undefined && (
                        <Text color={palette.dim} fontSize={13} numberOfLines={2}>{notes}</Text>
                    )}
                    {bags !== null && (
                        <DotMatrixText testID="roaster-row-bags" fontSize={11} weight="bold"
                                       letterSpacing={1.2} color={palette.dim} numberOfLines={1}>
                            {bags.toUpperCase()}
                        </DotMatrixText>
                    )}
                </YStack>
            </XStack>
        </Pressable>
    );
}
