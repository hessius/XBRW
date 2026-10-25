import {useAppearance} from "@/hooks/useAppearance";
import React from "react";
import {Pressable} from "react-native";
import {useSafeAreaInsets} from "react-native-safe-area-context";
import {Text, XStack, YStack} from "tamagui";

import DotIcon from "@/components/DotIcon";
import DotMatrixText from "@/components/DotMatrixText";
import ScreenTitle from "@/components/ScreenTitle";


/** Matches the well the recipe screen puts its own back glyph in. */
const KEY_SIZE = 32;

type Props = {
    title: string;
    /**
     * A machine-counted superscript beside the title, e.g. how many brews the
     * list below holds. Hidden when absent or zero, which `ScreenTitle` decides.
     */
    count?: number | string;
    /**
     * A machine-derived line about this particular screen — the brew record
     * uses the date and time of the brew — set flush right on the title's own
     * row.
     *
     * On the row rather than beneath it because a second line cost a band of
     * screen the size of the title itself, for one short string; and in Doto
     * because a timestamp is a machine's fact, not prose.
     */
    meta?: string;
    /**
     * Lines the title may wrap to. One unless the title is a recipe's name,
     * which `ScreenTitle` explains.
     */
    titleLines?: number;
    titleSize?: number;
    subtitle?: string;
    /** A trailing action that can wrap below the title when space is tight. */
    action?: React.ReactNode;
    onBack: () => void;
};

/**
 * The header for the screens that are pushed on top of the app.
 *
 * Settings, About and Licences had the platform's own navigation bar, which put
 * a system-font title and a blue chevron on top of a black app that uses
 * neither. This is the same shape the recipe screen already draws — a glyph in
 * a dark well, then the title — so a pushed screen looks like part of the app
 * rather than like a sheet borrowed from somewhere else.
 *
 * The route that uses this must set `headerShown: false` in `app/_layout.tsx`
 * and not from inside the screen: an effect runs after the first paint, so the
 * native bar this replaces would otherwise get one frame to flash.
 *
 * The title is announced as a heading because the bar it replaces was: without
 * it, a screen reader arriving on a pushed screen has nothing for the rotor to
 * land on and no announcement saying where it landed.
 */
export default function ScreenHeader({title, count, meta, titleLines, titleSize, subtitle, action, onBack}: Props) {
    const appearance = useAppearance();
    const {palette} = appearance;
    const insets = useSafeAreaInsets();
    const hasAction = action !== undefined && action !== null;
    const metaText = meta === undefined ? null : (
        <DotMatrixText testID="screen-header-meta" fontSize={11}
                       weight="bold" letterSpacing={1.2}
                       color={palette.dim} numberOfLines={1}
                       style={{marginLeft: "auto", paddingLeft: 8}}>
            {meta}
        </DotMatrixText>
    );
    const back = (
        <Pressable accessibilityRole="button" accessibilityLabel="Back"
                   onPress={onBack} hitSlop={12}>
            <YStack testID="screen-header-back" backgroundColor={palette.control}
                    borderRadius="$3" width={KEY_SIZE} height={KEY_SIZE}
                    alignItems="center" justifyContent="center">
                <DotIcon name="back" size={16} color={palette.text}/>
            </YStack>
        </Pressable>
    );

    return (
        <YStack backgroundColor={palette.base} paddingTop={insets.top}>
            <XStack alignItems="center" gap="$3"
                    testID={hasAction ? "screen-header-action-row" : undefined}
                    flexWrap={hasAction ? "wrap" : "nowrap"}
                    paddingHorizontal="$4" paddingTop="$2"
                    paddingBottom={subtitle === undefined ? "$3" : "$1"}>
                {hasAction ? (
                    <XStack alignItems="center" gap="$3" maxWidth="100%" flexShrink={1}>
                        {back}
                        <YStack flexShrink={1}>
                            <ScreenTitle title={title} count={count} heading lines={titleLines ?? 0}
                                         fontSize={titleSize}/>
                        </YStack>
                    </XStack>
                ) : <>
                    {back}
                    {/* Without flexShrink the title takes the whole row's width
                        beside the back key, so a long name wraps too late and
                        its end runs off the right edge. */}
                    <YStack testID="screen-header-title" flexShrink={1}>
                        <ScreenTitle title={title} count={count} heading lines={titleLines}
                                     fontSize={titleSize}/>
                    </YStack>
                </>}
                {hasAction && (
                    <YStack testID="screen-header-action" marginLeft="auto"
                            maxWidth="100%" flexShrink={1}>
                        {action}
                    </YStack>
                )}
                {subtitle === undefined && metaText}
            </XStack>
            {subtitle !== undefined && (
                <XStack alignItems="center" paddingLeft={16 + KEY_SIZE + 12}
                        paddingRight="$4" paddingBottom="$3">
                    <Text testID="screen-header-subtitle" fontSize={13} color={palette.dim}
                          flexShrink={1}>
                        {subtitle}
                    </Text>
                    {metaText}
                </XStack>
            )}
        </YStack>
    );
}
