import React, {useState} from "react";
import {Image} from "react-native";
import {Text, YStack} from "tamagui";

import DotMatrixText from "@/components/DotMatrixText";
import {palette} from "@/constants/colors";

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

/** A centred status for a catalogue screen with nothing to list. */
export function CatalogueStatus({title, body, testID}: {
    title: string;
    body: string;
    testID?: string;
}) {
    return (
        <YStack testID={testID} flex={1} alignItems="center" justifyContent="center"
                gap="$2" paddingHorizontal="$6" paddingVertical="$8">
            <DotMatrixText fontSize={14} weight="bold" letterSpacing={1.6} color={palette.dim}>
                {title}
            </DotMatrixText>
            <Text fontSize={14} textAlign="center" color={palette.muted}>{body}</Text>
        </YStack>
    );
}
