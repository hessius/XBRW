import React, {useState} from "react";
import {Image, Pressable, View} from "react-native";
import {Text, XStack, YStack} from "tamagui";

import DotIcon from "@/components/DotIcon";
import DotMatrixText from "@/components/DotMatrixText";
import {palette} from "@/constants/colors";
import {
    stripRowLabel, stripSummaryLabel, type HomeStrip, type StripRow
} from "@/library/roasterHome";

const PHOTO = 28;
const PHOTO_OVERLAP = 10;
const PHOTO_RADIUS = 6;
/** Wide enough for three photos, so every row's name starts at the same place. */
const STACK_WIDTH = PHOTO + 2 * (PHOTO - PHOTO_OVERLAP);

function StackPhoto({uri, index}: {uri: string; index: number}) {
    const [failed, setFailed] = useState(false);
    const style = {
        width: PHOTO, height: PHOTO, borderRadius: PHOTO_RADIUS,
        marginLeft: index === 0 ? 0 : -PHOTO_OVERLAP,
        borderWidth: 2, borderColor: palette.base,
        backgroundColor: palette.raised
    };
    return failed
        ? <View style={style}/>
        : <Image source={{uri}} onError={() => setFailed(true)} style={style}/>;
}

/** A few of the roaster's coffees, overlapped. Decorative: the row says who it is. */
function PhotoStack({photos}: {photos: readonly string[]}) {
    return (
        <XStack width={STACK_WIDTH} accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants">
            {photos.length === 0 ? (
                <YStack width={PHOTO} height={PHOTO} borderRadius={PHOTO_RADIUS}
                        backgroundColor={palette.raised}/>
            ) : photos.map((uri, index) => <StackPhoto key={uri} uri={uri} index={index}/>)}
        </XStack>
    );
}

function Count({testID, label, color}: {testID: string; label: string; color: string}) {
    return (
        <DotMatrixText testID={testID} fontSize={11} weight="bold" letterSpacing={1.4}
                       color={color} numberOfLines={1}>
            {label}
        </DotMatrixText>
    );
}

/** The pin mark: the favourite star, small, so a pinned roaster reads as chosen. */
function PinMark({testID}: {testID: string}) {
    return (
        <XStack testID={testID} accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants">
            <DotIcon name="favourite" size={12} color={palette.muted}/>
        </XStack>
    );
}

function Chevron() {
    return (
        <XStack style={{transform: [{rotate: "180deg"}]}}>
            <DotIcon name="back" size={12} color={palette.muted}/>
        </XStack>
    );
}

/**
 * The roasters on the home screen, under the three tiles.
 *
 * Following hessius's suggestion: with up to three subscriptions every
 * roaster has a short row of its own, pinned ones first. With more, only the
 * pinned roasters keep a row, and one `Roasters · {n}` row opens the full list
 * with the NEW and back-in-stock counts of all of them. Which rows those are
 * is `homeStrip` in `library/roasterHome.ts`. Nothing at all with no
 * subscriptions, or with "Show roasters on the home screen" off, so the home
 * screen of somebody who never subscribed does not move.
 */
export default function RoasterStrip({strip, onOpen, onAll}: {
    strip: HomeStrip;
    onOpen: (row: StripRow) => void;
    onAll: () => void;
}) {
    const {rows, summary} = strip;
    if (rows.length === 0 && summary === null) return null;
    return (
        <YStack testID="roaster-strip" paddingHorizontal="$3" paddingBottom="$2">
            <XStack alignItems="center" minHeight={24}>
                <DotMatrixText fontSize={11} weight="bold" letterSpacing={1.6} color={palette.dim}>
                    YOUR ROASTERS
                </DotMatrixText>
            </XStack>
            {rows.map((row) => (
                <Pressable key={row.feedUrl} testID={`roaster-strip-${row.roaster}`}
                           accessibilityRole="button"
                           accessibilityLabel={stripRowLabel(row)}
                           onPress={() => onOpen(row)}
                           style={({pressed}) => ({opacity: pressed ? 0.7 : 1})}>
                    <XStack alignItems="center" gap="$3" minHeight={48} paddingVertical="$1">
                        <PhotoStack photos={row.photos}/>
                        <YStack flex={1} minWidth={0}>
                            <XStack alignItems="center" gap="$2">
                                <Text fontSize={15} fontWeight="700" color={palette.text}
                                      numberOfLines={1} flexShrink={1}>
                                    {row.roaster}
                                </Text>
                                {row.pinned && <PinMark testID={`roaster-strip-${row.roaster}-pinned`}/>}
                            </XStack>
                            <Text testID={`roaster-strip-${row.roaster}-detail`}
                                  fontSize={13} color={palette.dim} numberOfLines={1}>
                                {row.detail}
                            </Text>
                        </YStack>
                        {row.paused && (
                            <Count testID={`roaster-strip-${row.roaster}-paused`}
                                   label="PAUSED" color={palette.muted}/>
                        )}
                        {row.back > 0 && (
                            <Count testID={`roaster-strip-${row.roaster}-back`}
                                   label={`${row.back} BACK`} color={palette.success}/>
                        )}
                        {row.fresh > 0 && (
                            <Count testID={`roaster-strip-${row.roaster}-new`}
                                   label={`${row.fresh} NEW`} color={palette.info}/>
                        )}
                        <Chevron/>
                    </XStack>
                </Pressable>
            ))}
            {summary !== null && (
                <Pressable testID="roaster-strip-all" accessibilityRole="button"
                           accessibilityLabel={stripSummaryLabel(summary)}
                           onPress={onAll}
                           style={({pressed}) => ({opacity: pressed ? 0.7 : 1})}>
                    {/* Compact: one line, no photos, because it stands for a list. */}
                    <XStack alignItems="center" gap="$3" minHeight={44} paddingVertical="$1">
                        <Text flex={1} fontSize={15} fontWeight="700" color={palette.text}
                              numberOfLines={1}>
                            {`Roasters · ${summary.count}`}
                        </Text>
                        {summary.back > 0 && (
                            <Count testID="roaster-strip-all-back"
                                   label={`${summary.back} BACK`} color={palette.success}/>
                        )}
                        {summary.fresh > 0 && (
                            <Count testID="roaster-strip-all-new"
                                   label={`${summary.fresh} NEW`} color={palette.info}/>
                        )}
                        <Chevron/>
                    </XStack>
                </Pressable>
            )}
        </YStack>
    );
}
