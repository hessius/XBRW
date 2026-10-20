import React, {useState} from "react";
import {Pressable, ScrollView, useWindowDimensions} from "react-native";
import {Text, XStack, YStack} from "tamagui";

import DotIcon from "@/components/DotIcon";
import DotMatrixText from "@/components/DotMatrixText";
import RecipePhoto from "@/components/RecipePhoto";
import {CARD_PHOTO_SIZE, PHOTO_GAP} from "@/library/recipePictureLayout";
import {onAccent, palette} from "@/constants/colors";

function ReadyText({name, freshnessLine, bagLine, measuring = false}: {
    name: string; freshnessLine?: string | null; bagLine?: string | null; measuring?: boolean;
}) {
    return <YStack flex={measuring ? undefined : 1} minWidth={0} gap="$1">
        <Text testID={measuring ? undefined : "ready-to-brew-name"} fontSize={16} fontWeight="600"
            color={palette.text} numberOfLines={measuring ? undefined : 2}>{name}</Text>
        {freshnessLine && <Text testID={measuring ? undefined : "ready-to-brew-freshness"}
            fontSize={13} color={palette.dim}>{freshnessLine}</Text>}
        {bagLine && <Text testID={measuring ? undefined : "ready-to-brew-bag"}
            fontSize={13} color={palette.dim}>{bagLine}</Text>}
    </YStack>;
}

export type ReadyToBrewCardProps<T> = {
    /**
     * What the card is about, handed back to `onOpen` and `onBrew`. The card
     * never reads it; taking it here lets the screen pass its own `openRecipe`
     * and `openBrew` as they are.
     */
    item: T;
    /** `Vinka`, drawn on up to two lines. */
    name: string;
    /** The recipe's colour, used for BREW when it is the loud one. */
    accent: string;
    /** The pod photo, already gated on the pictures setting. Absent draws none. */
    imageUri?: string;
    /** `At its peak`, `Ready, peak around 29 Oct`, or absent. */
    freshnessLine?: string | null;
    /** `212 g left, about 11 brews`, in this app's bag mode only. */
    bagLine?: string | null;
    /**
     * Whether BREW is the loud button. False for a resting bag or one with not
     * enough left: the button is still there, but it does not ask to be pressed.
     */
    emphasised: boolean;
    /** Opens the recipe. The whole name and photo area is this button. */
    onOpen: (item: T) => unknown;
    /** Starts the brew. Absent with no machine to brew on, which draws no BREW. */
    onBrew?: (item: T) => unknown;
    /**
     * `Vinka is running low`, and where to reorder it. Without a `reorderUrl`
     * the line draws no Reorder.
     */
    low?: {line: string; reorderUrl?: string} | null;
    /** Opens a reorder link. */
    onReorder: (url: string) => void;
    /** `+2 more ready`, or absent. */
    moreLine?: string | null;
    onMore?: () => void;
    /** Puts the card away until tomorrow. */
    onDismiss: () => void;
};

/**
 * The home screen's "Ready to brew" card: the one open bag worth brewing now.
 *
 * Drawn only when there is an open bag, and nothing at all otherwise, so the
 * library below never moves for someone who does not track bags.
 *
 * The open area, BREW and the close button are three sibling controls rather
 * than buttons nested inside one big button, because VoiceOver and TalkBack
 * cannot reach a control nested inside another accessible element.
 */
export default function ReadyToBrewCard<T>({
    item, name, accent, imageUri, freshnessLine, bagLine, emphasised,
    onOpen, onBrew, low, onReorder, moreLine, onMore, onDismiss
}: ReadyToBrewCardProps<T>) {
    const reorderUrl = low?.reorderUrl;
    // A photo that will not load is skipped rather than left as an empty
    // square, the rule `PodSection` follows. Keyed on the uri so a new coffee
    // gets its own try.
    const [failed, setFailed] = useState<string | null>(null);
    const photo = imageUri !== undefined && imageUri !== "" && failed !== imageUri
        ? imageUri : undefined;
    const {width, fontScale} = useWindowDimensions();
    const signature = JSON.stringify([name, freshnessLine, bagLine, imageUri, width, fontScale, !!onBrew]);
    const [available, setAvailable] = useState<{key: string; width: number}>();
    const [intrinsic, setIntrinsic] = useState<{key: string; width: number}>();
    const availableWidth = available?.key === signature ? available.width : undefined;
    const naturalKey = JSON.stringify([signature, availableWidth]);
    const fits = availableWidth !== undefined && intrinsic?.key === naturalKey
        && Math.ceil(intrinsic.width + CARD_PHOTO_SIZE + PHOTO_GAP) <= Math.floor(availableWidth);

    const spoken = ["Ready to brew", name, freshnessLine, bagLine]
        .filter((part): part is string => typeof part === "string" && part !== "")
        .join(", ");

    return (
        <YStack testID="ready-to-brew" marginHorizontal="$3" marginBottom="$3"
                padding="$3" gap="$2" borderRadius="$5"
                backgroundColor={palette.surface} borderWidth={1} borderColor={palette.line}>
            <XStack alignItems="center" justifyContent="space-between" gap="$2">
                <DotMatrixText fontSize={11} weight="bold" letterSpacing={1.4} color={palette.dim}>
                    READY TO BREW
                </DotMatrixText>
                <Pressable testID="ready-to-brew-dismiss"
                           accessibilityRole="button"
                           accessibilityLabel="Hide until tomorrow"
                           hitSlop={{top: 14, bottom: 14, left: 14, right: 14}}
                           onPress={onDismiss}>
                    <DotIcon name="close" size={14} color={palette.dim}/>
                </Pressable>
            </XStack>

            <XStack alignItems="center" gap="$3">
                <XStack key={signature} testID="ready-to-brew-open" flex={1} minWidth={0}
                        alignItems="center" gap={PHOTO_GAP}
                        onLayout={event => setAvailable({key: signature, width: event.nativeEvent.layout.width})}
                        accessible accessibilityRole="button"
                        accessibilityLabel={spoken}
                        accessibilityHint="Opens the recipe."
                        onPress={() => onOpen(item)}
                        pressStyle={{opacity: 0.7}}>
                    {photo !== undefined && fits && (
                        <RecipePhoto testID="ready-to-brew-photo" uri={photo}
                            size={CARD_PHOTO_SIZE} radius={CARD_PHOTO_SIZE / 2}
                            onError={() => setFailed(photo)}/>
                    )}
                    <ReadyText name={name} freshnessLine={freshnessLine} bagLine={bagLine}/>
                    {photo !== undefined && <ScrollView key={naturalKey} horizontal
                        testID="ready-to-brew-text-measure" pointerEvents="none" accessible={false}
                        accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
                        style={{height: 0, opacity: 0, position: "absolute", width: "100%"}}
                        onContentSizeChange={value => setIntrinsic({key: naturalKey, width: value})}>
                        <ReadyText name={name} freshnessLine={freshnessLine} bagLine={bagLine} measuring/>
                    </ScrollView>}
                </XStack>

                {onBrew !== undefined && (
                    <XStack testID="ready-to-brew-brew"
                            accessible accessibilityRole="button"
                            accessibilityLabel={`Brew ${name}`}
                            onPress={() => onBrew(item)}
                            minHeight={44} minWidth={72}
                            alignItems="center" justifyContent="center"
                            paddingHorizontal="$3" borderRadius="$4"
                            backgroundColor={emphasised ? accent : palette.raised}
                            borderWidth={1} borderColor={emphasised ? accent : palette.line}
                            pressStyle={{opacity: 0.7, scale: 0.98}}>
                        <DotMatrixText fontSize={13} weight="bold" letterSpacing={1.6}
                                       color={emphasised ? onAccent.text : palette.dim}>
                            BREW
                        </DotMatrixText>
                    </XStack>
                )}
            </XStack>

            {((low !== null && low !== undefined) || (moreLine !== null && moreLine !== undefined)) && (
                <XStack flexWrap="wrap" alignItems="center" columnGap="$3" rowGap="$1">
                    {low !== null && low !== undefined && (
                        <XStack testID="ready-to-brew-low" alignItems="center" gap="$2" flexShrink={1}>
                            <Text fontSize={13} color={palette.warnMuted} flexShrink={1}>
                                {low.line}
                            </Text>
                            {reorderUrl !== undefined && (
                                <>
                                    <Text fontSize={13} color={palette.muted}
                                          accessibilityElementsHidden
                                          importantForAccessibility="no">
                                        ·
                                    </Text>
                                    <Text testID="ready-to-brew-reorder" fontSize={13}
                                          color={palette.text} textDecorationLine="underline"
                                          accessibilityRole="link"
                                          accessibilityLabel="Reorder"
                                          accessibilityHint="Opens the roaster's page in your browser."
                                          hitSlop={{top: 12, bottom: 12, left: 8, right: 8}}
                                          onPress={() => onReorder(reorderUrl)}>
                                        Reorder
                                    </Text>
                                </>
                            )}
                        </XStack>
                    )}
                    {moreLine !== null && moreLine !== undefined && onMore !== undefined && (
                        <Text testID="ready-to-brew-more" fontSize={13} color={palette.dim}
                              accessibilityRole="button"
                              accessibilityLabel={moreLine}
                              accessibilityHint="Shows the next coffee that is ready."
                              hitSlop={{top: 12, bottom: 12, left: 8, right: 8}}
                              onPress={onMore}>
                            {moreLine}
                        </Text>
                    )}
                </XStack>
            )}
        </YStack>
    );
}
