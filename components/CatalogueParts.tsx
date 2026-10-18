import React, {useState} from "react";
import {Image, Pressable} from "react-native";
import {Button, Text, XStack, YStack} from "tamagui";

import DotIcon from "@/components/DotIcon";
import DotMatrixText from "@/components/DotMatrixText";
import {openLink} from "@/components/openLink";
import {onAccent, palette} from "@/constants/colors";

const PHOTO_HEIGHT = 260;
const PHOTO_RADIUS = 12;

/**
 * Pieces the two catalogue detail screens share: the community hub's recipe
 * (`app/hubRecipe.tsx`) and a roaster's coffee (`app/roasterCoffee.tsx`).
 * Lifted out of the hub screen unchanged, so both read as one catalogue.
 */

/** The full-width photo at the top of a detail screen, or a quiet blank. */
export function DetailPhoto({uri, testID = "hub-recipe-photo"}: {
    uri: string | null;
    testID?: string;
}) {
    const [failed, setFailed] = useState(false);
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
