import React, {useState} from "react";
import {Pressable} from "react-native";
import {Text, XStack, YStack} from "tamagui";

import Collapsible from "@/components/Collapsible";
import DeckSection from "@/components/DeckSection";
import DotMatrixText from "@/components/DotMatrixText";
import LinkText from "@/components/LinkText";
import {palette} from "@/constants/colors";
import {
    coffeeDetails,
    NOTE_INLINE_MAX,
    type CoffeeDetailRow
} from "@/library/coffeeDetails";
import Recipe from "@/library/Recipe";

/** Wide enough for the longest caption, ELEVATION, so values line up. */
const LABEL_WIDTH = 92;

export const COFFEE_TITLE = "COFFEE";
export const COFFEE_PAGE_LABEL = "View the coffee page";

/**
 * One label and value.
 *
 * Doto for the caption, because it is a label the app prints, and Inter for
 * the value, because a roaster wrote it. Grouped as one element for a screen
 * reader, which then hears "Region, Huila" rather than a capitalised caption
 * spelled out and a value with nothing to say what it is.
 *
 * Values wrap rather than truncate. This is the one place a long farm name or a
 * list of tasting notes can be read whole.
 */
function DetailRow({row}: {row: CoffeeDetailRow}) {
    return (
        <XStack testID={`coffee-${row.field}`}
                accessible
                accessibilityLabel={`${row.spokenLabel}, ${row.value}`}
                alignItems="flex-start" gap="$2">
            <DotMatrixText fontSize={11} weight="bold" letterSpacing={1.3}
                           color={palette.dim}
                           style={{width: LABEL_WIDTH, paddingTop: 2}}>
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
                       accessibilityLabel="Coffee note"
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
 * The coffee a recipe carries, field by field.
 *
 * A recipe gets a coffee from an xPod, from an import link (BrewMind, or a
 * roaster's own page) or from a backup, and keeps it for Beanconqueror. Until
 * this section the deck showed almost none of it.
 *
 * It sits straight after XPOD because both answer what is in the cup, and
 * before FROM, which answers who the recipe arrived from. The pod's name and
 * photo stay in XPOD: this section repeats the coffee's name only when no other
 * part of the screen already shows it, and draws no picture of its own.
 *
 * Every field is optional and an empty one gets no row. A coffee with nothing
 * left to say once the duplicates are gone draws no section at all, rather
 * than a heading over nothing.
 */
export default function CoffeeSection({recipe}: {recipe: Recipe}) {
    const details = coffeeDetails(recipe.coffee, {
        shownNames: [recipe.xbloomName, recipe.displayName()],
        recipeUrl:  recipe.recipeUrl
    });
    if (details === null) return null;

    return (
        <DeckSection title={COFFEE_TITLE} testID="about-coffee">
            {details.name !== undefined && (
                <Text testID="coffee-name" fontSize={16} color={palette.text}
                      accessibilityLabel={`Coffee, ${details.name}`}>
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
                <LinkText label={COFFEE_PAGE_LABEL}
                          url={details.url}
                          accessibilityLabel={`${COFFEE_PAGE_LABEL}. Opens in your browser.`}/>
            )}
        </DeckSection>
    );
}
