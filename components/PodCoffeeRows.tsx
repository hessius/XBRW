import React, {useState} from "react";
import {Pressable} from "react-native";
import {Text, XStack, YStack} from "tamagui";

import Collapsible from "@/components/Collapsible";
import DotMatrixText from "@/components/DotMatrixText";
import LinkText from "@/components/LinkText";
import {palette} from "@/constants/colors";
import {
    coffeeDetails,
    NOTE_INLINE_MAX,
    type CoffeeDetailRow
} from "@/library/coffeeDetails";
import Recipe from "@/library/Recipe";

/**
 * Room for the longest caption, ELEVATION, so values line up.
 *
 * A floor rather than a width: at a large text size the caption grows instead
 * of breaking mid-word, and only that row's value moves over.
 */
const LABEL_MIN_WIDTH = 92;

/**
 * Says where the link goes without naming coffee, because a tea pod carries
 * the same block and the same kind of link.
 */
export const PRODUCT_PAGE_LABEL = "View the product page";

/**
 * One label and value.
 *
 * Doto for the caption, because it is a label the app prints, and Inter for
 * the value, because a roaster wrote it. Grouped as one element for a screen
 * reader, which then hears "Region, Huila" rather than a capitalised caption
 * spelled out and a value with nothing to say what it is.
 *
 * Values wrap rather than truncate. This is the one place a long farm name or a
 * list of flavours can be read whole.
 */
function DetailRow({row}: {row: CoffeeDetailRow}) {
    return (
        <XStack testID={`coffee-${row.field}`}
                accessible
                accessibilityLabel={`${row.spokenLabel}, ${row.value}`}
                alignItems="flex-start" gap="$2">
            <DotMatrixText fontSize={11} weight="bold" letterSpacing={1.3}
                           color={palette.dim}
                           style={{minWidth: LABEL_MIN_WIDTH, paddingTop: 2}}>
                {row.label}
            </DotMatrixText>
            <Text flex={1} minWidth={0} fontSize={13} lineHeight={19}
                  color={palette.text}>
                {row.value}
            </Text>
        </XStack>
    );
}

/**
 * The producer's longer text.
 *
 * Short notes are drawn as they are. A long one is folded behind a control and
 * opened with `Collapsible`, the same height animation the stage tiles and the
 * machine panel use, so it honours Reduced Motion without a second rule.
 */
function CoffeeNote({note}: {note: string}) {
    const [open, setOpen] = useState(false);

    if (note.length <= NOTE_INLINE_MAX) {
        return (
            <Text testID="coffee-note" fontSize={13} lineHeight={19} color={palette.dim}>
                {note}
            </Text>
        );
    }

    return (
        <YStack>
            <Pressable accessibilityRole="button"
                       accessibilityLabel="Pod note"
                       accessibilityState={{expanded: open}}
                       testID="coffee-note-toggle"
                       onPress={() => setOpen((was) => !was)}
                       style={({pressed}) => ({
                           minHeight:      44,
                           justifyContent: "center",
                           opacity:        pressed ? 0.7 : 1
                       })}>
                <DotMatrixText fontSize={11} weight="bold" letterSpacing={1.4}
                               color={palette.dim}>
                    {open ? "HIDE NOTE" : "SHOW NOTE ›"}
                </DotMatrixText>
            </Pressable>
            <Collapsible open={open}>
                <Text testID="coffee-note" fontSize={13} lineHeight={19} color={palette.dim}>
                    {note}
                </Text>
            </Collapsible>
        </YStack>
    );
}

/**
 * What the pod carries, field by field, under the pod line in XPOD.
 *
 * A recipe gets this block from an xPod, from an import link (BrewMind, or a
 * roaster's own page) or from a backup, and keeps it for Beanconqueror. XPOD
 * used to show only its name and photo.
 *
 * Inside XPOD rather than under a heading of its own, because it answers the
 * same question the pod line does, and because a tea pod carries the same block:
 * a heading saying COFFEE would be wrong for it.
 *
 * Every field is optional and an empty one gets no row. The coffee's name is
 * drawn only when it differs from the pod name on the line above, and a block
 * with nothing else to say draws nothing at all.
 */
export default function PodCoffeeRows({recipe}: {recipe: Recipe}) {
    const details = coffeeDetails(recipe.coffee, {
        podName:   recipe.xbloomName,
        recipeUrl: recipe.recipeUrl
    });
    if (details === null) return null;

    return (
        <YStack testID="pod-coffee" gap="$2">
            {details.name !== undefined && (
                <Text testID="coffee-name" fontSize={14} color={palette.text}>
                    {details.name}
                </Text>
            )}

            {details.groups.length > 0 && (
                <YStack gap="$3">
                    {details.groups.map((group) => (
                        <YStack key={group[0].field} gap="$1">
                            {group.map((row) => <DetailRow key={row.field} row={row}/>)}
                        </YStack>
                    ))}
                </YStack>
            )}

            {details.note !== undefined && <CoffeeNote note={details.note}/>}

            {details.url !== undefined && (
                <LinkText label={PRODUCT_PAGE_LABEL}
                          url={details.url}
                          accessibilityLabel={`${PRODUCT_PAGE_LABEL}. Opens in your browser.`}/>
            )}
        </YStack>
    );
}
