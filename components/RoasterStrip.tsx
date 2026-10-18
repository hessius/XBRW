import React, {useState} from "react";
import {Image, Pressable, View} from "react-native";
import {Text, XStack, YStack} from "tamagui";

import DotIcon from "@/components/DotIcon";
import DotMatrixText from "@/components/DotMatrixText";
import {palette} from "@/constants/colors";
import {STRIP_MAX_ROWS, stripRowLabel, type StripRow} from "@/library/roasterHome";

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

/**
 * The roasters on the home screen, under the three tiles.
 *
 * One short row per subscribed roaster, so a coffee from one is a tap away
 * rather than four screens into Settings. Every subscription has a row,
 * paused and still-loading ones included; the line under the name says which
 * (`stripDetail` in `library/roasterHome.ts`). Two rows at most; with more, ALL
 * ROASTERS opens the full list. Nothing at all with no subscriptions, so the
 * home screen of somebody who never subscribed does not move.
 */
export default function RoasterStrip({rows, onOpen, onAll}: {
    rows: readonly StripRow[];
    onOpen: (row: StripRow) => void;
    onAll: () => void;
}) {
    if (rows.length === 0) return null;
    const shown = rows.slice(0, STRIP_MAX_ROWS);
    return (
        <YStack testID="roaster-strip" paddingHorizontal="$3" paddingBottom="$2">
            <XStack alignItems="center" justifyContent="space-between" minHeight={24}>
                <DotMatrixText fontSize={11} weight="bold" letterSpacing={1.6} color={palette.dim}>
                    YOUR ROASTERS
                </DotMatrixText>
                {rows.length > STRIP_MAX_ROWS && (
                    <Pressable testID="roaster-strip-all" accessibilityRole="button"
                               accessibilityLabel={`All roasters, ${rows.length}`}
                               hitSlop={{top: 10, bottom: 10, left: 8, right: 8}}
                               onPress={onAll}>
                        <DotMatrixText fontSize={11} weight="bold" letterSpacing={1.6}
                                       color={palette.text}>
                            ALL ROASTERS
                        </DotMatrixText>
                    </Pressable>
                )}
            </XStack>
            {shown.map((row) => (
                <Pressable key={row.feedUrl} testID={`roaster-strip-${row.roaster}`}
                           accessibilityRole="button"
                           accessibilityLabel={stripRowLabel(row)}
                           onPress={() => onOpen(row)}
                           style={({pressed}) => ({opacity: pressed ? 0.7 : 1})}>
                    <XStack alignItems="center" gap="$3" minHeight={48} paddingVertical="$1">
                        <PhotoStack photos={row.photos}/>
                        <YStack flex={1} minWidth={0}>
                            <Text fontSize={15} fontWeight="700" color={palette.text}
                                  numberOfLines={1}>
                                {row.roaster}
                            </Text>
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
                        <XStack style={{transform: [{rotate: "180deg"}]}}>
                            <DotIcon name="back" size={12} color={palette.muted}/>
                        </XStack>
                    </XStack>
                </Pressable>
            ))}
        </YStack>
    );
}
