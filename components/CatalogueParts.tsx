import React, {useState} from "react";
import {Image, Pressable} from "react-native";
import {Button, Switch, Text, XStack, YStack} from "tamagui";

import DotIcon from "@/components/DotIcon";
import DotMatrixText from "@/components/DotMatrixText";
import {openLink} from "@/components/openLink";
import {onAccent, palette} from "@/constants/colors";
import type {CoffeeBadge} from "@/library/roasterAlerts";
import type {BuyOption} from "@/library/roasterBuy";

const PHOTO_HEIGHT = 260;
const PHOTO_RADIUS = 12;

/**
 * Pieces the two catalogue detail screens share: the community hub's recipe
 * (`app/hubRecipe.tsx`) and a roaster's coffee (`app/roasterCoffee.tsx`).
 * Lifted out of the hub screen unchanged, so both read as one catalogue.
 */

/** The widest a whole-photo frame is drawn, so it stays a photo on a tablet or a Fold's inner screen. */
export const PHOTO_MAX_WIDTH = 420;
/** The tallest and widest shapes a whole-photo frame takes: 4:5 and 16:9, as width over height. */
export const PHOTO_MIN_ASPECT = 4 / 5;
export const PHOTO_MAX_ASPECT = 16 / 9;

/**
 * The shape to draw a product photo in, from its real size once it has
 * loaded: its own aspect ratio, held between 4:5 and 16:9 so a strange image
 * cannot become a sliver. Square until the size is known, because a roaster's
 * product shot usually is.
 */
export function photoAspect(width?: number, height?: number): number {
    if (width === undefined || height === undefined || !(width > 0) || !(height > 0)) return 1;
    return Math.min(PHOTO_MAX_ASPECT, Math.max(PHOTO_MIN_ASPECT, width / height));
}

/**
 * The photo at the top of a detail screen, or a quiet blank.
 *
 * Two shapes. The community catalogue's recipe photos are drawn as a wide
 * banner, cropped to fill it. A roaster's product photo (`whole`) is a bag
 * with a label on it, and a banner cut the label off, so it is drawn in its
 * own shape (square until it loads), full width up to `PHOTO_MAX_WIDTH` and
 * centred beyond that.
 */
export function DetailPhoto({uri, testID = "hub-recipe-photo", whole = false}: {
    uri: string | null;
    testID?: string;
    whole?: boolean;
}) {
    const [failed, setFailed] = useState(false);
    const [aspect, setAspect] = useState(1);
    if (whole) {
        return (
            <XStack width="100%" justifyContent="center">
                {uri !== null && !failed ? (
                    <Image
                        testID={testID}
                        source={{uri}}
                        resizeMode="cover"
                        onError={() => setFailed(true)}
                        onLoad={(event) => {
                            const size = event.nativeEvent?.source;
                            setAspect(photoAspect(size?.width, size?.height));
                        }}
                        style={{
                            width: "100%",
                            maxWidth: PHOTO_MAX_WIDTH,
                            aspectRatio: aspect,
                            borderRadius: PHOTO_RADIUS
                        }}/>
                ) : (
                    <YStack testID={`${testID}-blank`} width="100%" maxWidth={PHOTO_MAX_WIDTH}
                            aspectRatio={1} borderRadius={PHOTO_RADIUS}
                            backgroundColor={palette.raised}/>
                )}
            </XStack>
        );
    }
    if (uri !== null && !failed) {
        return (
            <Image
                testID={testID}
                source={{uri}}
                onError={() => setFailed(true)}
                style={{
                    width: "100%",
                    height: PHOTO_HEIGHT,
                    borderBottomLeftRadius: PHOTO_RADIUS,
                    borderBottomRightRadius: PHOTO_RADIUS
                }}/>
        );
    }

    return (
        <YStack testID={`${testID}-blank`}
                width="100%" height={PHOTO_HEIGHT}
                borderBottomLeftRadius={PHOTO_RADIUS}
                borderBottomRightRadius={PHOTO_RADIUS}
                backgroundColor={palette.raised}/>
    );
}

/** A small Doto tag: a flavour, a process, a size. */
export function Chip({label}: {label: string}) {
    return (
        <YStack paddingHorizontal="$2" paddingVertical="$1"
                borderRadius="$3" backgroundColor={palette.raised}
                borderWidth={1} borderColor={palette.line}>
            <DotMatrixText fontSize={11} weight="bold" letterSpacing={1.2}
                           color={palette.dim}>
                {label.toUpperCase()}
            </DotMatrixText>
        </YStack>
    );
}

/**
 * A centred status for a catalogue screen with nothing to list, with an
 * optional way out drawn as the community catalogue's NO MATCHES draws one.
 */
export function CatalogueStatus({title, body, testID, action, onAction}: {
    title: string;
    body: string;
    testID?: string;
    action?: string;
    onAction?: () => void;
}) {
    return (
        <YStack testID={testID} flex={1} alignItems="center" justifyContent="center"
                gap="$4" paddingHorizontal="$6" paddingVertical="$8">
            <YStack alignItems="center" gap="$2">
                <DotMatrixText fontSize={14} weight="bold" letterSpacing={1.6} color={palette.dim}>
                    {title}
                </DotMatrixText>
                <Text fontSize={14} textAlign="center" color={palette.muted}>{body}</Text>
            </YStack>
            {action !== undefined && onAction !== undefined && (
                <Button accessibilityRole="button"
                        accessibilityLabel={action}
                        testID={testID === undefined ? undefined : `${testID}-action`}
                        backgroundColor={palette.text}
                        color={onAccent.text}
                        borderRadius="$4"
                        onPress={onAction}>
                    {action}
                </Button>
            )}
        </YStack>
    );
}

/**
 * A sold-out bag of a coffee that is on sale: SOLD OUT, and a switch-like
 * pill to be told when this size is back. TELL ME off, WATCHING on.
 */
function BagWatch({label, bag, on, onWatch}: {
    label: string;
    bag: string;
    on: boolean;
    onWatch: (bag: string, on: boolean) => void;
}) {
    return (
        <XStack alignItems="center" gap="$2">
            <DotMatrixText fontSize={11} weight="bold" letterSpacing={1.4} color={palette.muted}>
                SOLD OUT
            </DotMatrixText>
            <Pressable accessibilityRole="switch" accessibilityState={{checked: on}}
                       accessibilityLabel={`${label}, sold out. Tell me when it's back`}
                       testID={`buy-${bag}-watch`}
                       onPress={() => onWatch(bag, !on)}>
                <XStack height={36} paddingHorizontal="$3" alignItems="center" borderRadius="$4"
                        borderWidth={on ? 0 : 1} borderColor={palette.line}
                        backgroundColor={on ? palette.success : palette.none}>
                    <DotMatrixText fontSize={11} weight="bold" letterSpacing={1.4}
                                   color={on ? onAccent.text : palette.text}>
                        {on ? "WATCHING" : "TELL ME"}
                    </DotMatrixText>
                </XStack>
            </Pressable>
        </XStack>
    );
}

/**
 * BUY: each bag the roaster sells, its size and price, and a button that
 * opens the shop at that bag in the browser.
 *
 * Compact on purpose: one line per bag. A bag with no link shows its price
 * and nothing to tap; a sold-out one says so and cannot be pressed.
 */
export function BuySection({options, watching, onWatch}: {
    options: readonly BuyOption[];
    /** Bag keys being watched. */
    watching?: ReadonlySet<string>;
    /**
     * Offered while the coffee itself is on sale: a sold-out bag can then be
     * watched on its own. Absent, and a sold-out bag only says so.
     */
    onWatch?: (bag: string, on: boolean) => void;
}) {
    return (
        <YStack testID="roaster-coffee-buy" gap="$2">
            <DotMatrixText fontSize={12} weight="bold" letterSpacing={1.5} color={palette.dim}>
                BUY
            </DotMatrixText>
            {options.map((option) => (
                <XStack key={option.key} testID={`buy-${option.key}`} alignItems="center"
                        gap="$3" minHeight={44}>
                    <Text flex={1} fontSize={15} color={palette.text}>{option.label}</Text>
                    {!option.available && onWatch !== undefined && option.bag !== undefined ? (
                        <BagWatch label={option.label} bag={option.bag}
                                  on={watching?.has(option.bag) ?? false} onWatch={onWatch}/>
                    ) : !option.available ? (
                        <XStack accessible accessibilityRole="button"
                                accessibilityLabel={`${option.label}, sold out`}
                                accessibilityState={{disabled: true}}
                                testID={`buy-${option.key}-sold-out`}
                                height={36} paddingHorizontal="$3" alignItems="center"
                                borderRadius="$4" borderWidth={1} borderColor={palette.line}
                                opacity={0.5}>
                            <DotMatrixText fontSize={11} weight="bold" letterSpacing={1.4}
                                           color={palette.dim}>
                                SOLD OUT
                            </DotMatrixText>
                        </XStack>
                    ) : option.url !== undefined && (
                        <Pressable accessibilityRole="link"
                                   accessibilityLabel={`Buy ${option.label}. Opens in your browser.`}
                                   testID={`buy-${option.key}-link`}
                                   onPress={() => openLink(option.url as string)}>
                            <XStack height={36} paddingHorizontal="$3" alignItems="center"
                                    borderRadius="$4" backgroundColor={palette.text}>
                                <DotMatrixText fontSize={11} weight="bold" letterSpacing={1.4}
                                               color={onAccent.text}>
                                    BUY
                                </DotMatrixText>
                            </XStack>
                        </Pressable>
                    )}
                </XStack>
            ))}
        </YStack>
    );
}

/** Room for two digits without the dot growing into a pill. */
const DOT_SIZE = 20;

/**
 * The small count on ROASTERS and on a roaster's row: NEW coffees not yet
 * looked at, plus coffees that came back. Nothing at all when it is zero.
 *
 * Decorative to a screen reader: the row it sits on says the same in words.
 */
export function AlertDot({count, testID}: {count: number; testID?: string}) {
    if (count <= 0) return null;
    return (
        <XStack testID={testID} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
                minWidth={DOT_SIZE} height={DOT_SIZE} paddingHorizontal={5}
                borderRadius={DOT_SIZE / 2} alignItems="center" justifyContent="center"
                backgroundColor={palette.info}>
            <DotMatrixText fontSize={11} weight="bold" color={onAccent.text}>
                {count > 99 ? "99+" : String(count)}
            </DotMatrixText>
        </XStack>
    );
}

const BADGE_COPY: Record<NonNullable<CoffeeBadge>, {label: string; color: string}> = {
    new:  {label: "NEW", color: palette.info},
    back: {label: "BACK IN STOCK", color: palette.success}
};

/** NEW or BACK IN STOCK above a coffee's name, in the colour of the dot that counted it. */
export function CoffeeBadgeTag({badge, testID}: {badge: CoffeeBadge; testID?: string}) {
    if (badge === undefined) return null;
    const copy = BADGE_COPY[badge];
    return (
        <DotMatrixText testID={testID} fontSize={11} weight="bold" letterSpacing={1.4}
                       color={copy.color}>
            {copy.label}
        </DotMatrixText>
    );
}

/**
 * The switch on a sold-out coffee: tell me when it is back. In the app only,
 * on the next sync that finds it on sale; there are no push notifications.
 */
export function WatchToggle({on, onChange}: {on: boolean; onChange: (on: boolean) => void}) {
    return (
        <XStack alignItems="center" justifyContent="space-between" gap="$4" minHeight={44}>
            <YStack flex={1} gap="$1">
                <Text fontSize={15} color={palette.text}>Tell me when it&apos;s back</Text>
                <Text fontSize={13} color={palette.dim}>
                    Shown here and in the list when the roaster has it again.
                </Text>
            </YStack>
            <Switch testID="roaster-coffee-watch" accessibilityLabel="Tell me when it's back"
                    accessibilityRole="switch" accessibilityState={{checked: on}} checked={on}
                    onCheckedChange={onChange} size="$3"
                    backgroundColor={on ? palette.success : palette.control}>
                <Switch.Thumb backgroundColor={palette.text}/>
            </Switch>
        </XStack>
    );
}

/**
 * A link out of the app, as a bordered row with a chevron.
 *
 * The shape of FROM's "View the recipe page" on ABOUT, so a link to a web
 * page looks the same wherever it is. Not `LinkText`: that draws the label in
 * brand magenta, and magenta is the app's own mark rather than a link colour.
 */
export function PageLinkRow({label, url, testID}: {
    label: string;
    url: string;
    testID?: string;
}) {
    return (
        <Pressable accessibilityRole="link"
                   testID={testID}
                   accessibilityLabel={`${label}. Opens in your browser.`}
                   onPress={() => openLink(url)}
                   style={({pressed}) => ({
                       opacity:   pressed ? 0.7 : 1,
                       transform: [{scale: pressed ? 0.98 : 1}]
                   })}>
            <XStack alignItems="center" justifyContent="space-between"
                    gap="$3" minHeight={44}
                    paddingVertical="$2" paddingHorizontal="$3"
                    borderWidth={1} borderColor={palette.line}
                    borderRadius="$5">
                <Text flex={1} fontSize={14} fontWeight="600" color={palette.text}>
                    {label}
                </Text>
                {/* Decorative: the row is already one labelled link. */}
                <XStack style={{transform: [{rotate: "180deg"}]}}>
                    <DotIcon name="back" size={12} color={palette.dim}/>
                </XStack>
            </XStack>
        </Pressable>
    );
}
