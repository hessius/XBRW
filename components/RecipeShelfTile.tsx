import React from "react";
import {Pressable, ScrollView, View, useWindowDimensions} from "react-native";
import {Text, XStack, YStack} from "tamagui";

import DotIcon from "@/components/DotIcon";
import DotMatrixText from "@/components/DotMatrixText";
import PourProfile, {PROFILE_BLEED} from "@/components/PourProfile";
import RecipePhoto from "@/components/RecipePhoto";
import {metadataPhotoFits, TILE_PHOTO_SIZE, PHOTO_GAP} from "@/library/recipePictureLayout";
import {TILE_HEIGHT} from "@/components/ShelfTile";
import Recipe from "@/library/Recipe";
import {accentGroupFor, resolveAccent} from "@/library/accent";
import {canWriteToCard} from "@/library/cardLimits";
import type {RecipeEvidence} from "@/library/libraryQuery";
import type {SlotMarkerValue} from "@/library/slots/slotModel";
import {evidenceLine, isSet, spokenEvidence} from "@/library/recipeEvidence";
import {bagBadge, readBag, spokenBag} from "@/library/coffeeBag";
import {freshnessBadge, spokenFreshness, type Freshness} from "@/library/restPeak";
import type {StoredBagReading} from "@/library/CoffeeBagDatabase";
import {onAccent} from "@/constants/colors";

/**
 * How far past the tile's corner the pour profile is pushed, matching the card.
 *
 * The same silhouette the list card wears, at the same overhang, so a recipe is
 * recognisable by its shape whether it is a row or a tile. The number is the
 * card's, copied deliberately rather than shared: the card's constant is private
 * to it and a tile is a different shape, so tying the two together would couple
 * two views that only happen to agree today.
 */
const PROFILE_OVERHANG = 2;

/**
 * The tile's inset, as a number: Tamagui's `$3`, which it used to be written as.
 * The profile's corner reaches back out through it to the tile's edges, and a
 * negative margin needs the number.
 */
const TILE_PADDING = 13;

/**
 * The silhouette's tallest height, and the room it keeps from the text above.
 *
 * The profile sits in the corner the text leaves free, the way it sits beside
 * the card's figures rather than under them: badges, a two-line name and the
 * figures fill the top of the tile, and the profile takes what is left down to
 * the bottom edge. 26 is about what a two-line name leaves at the default text
 * size (badges 15, name 2 x 18, figures 15, gaps and clearance), so tiles in a
 * row draw their silhouettes at the same height whether a name takes one line
 * or two. Larger text
 * leaves less, and the profile shrinks to fit rather than run under the
 * figures; below `PROFILE_MIN_HEIGHT` a staircase is no longer readable as one,
 * so it is not drawn at all.
 */
export const PROFILE_HEIGHT = 26;
export const PROFILE_CLEARANCE = 4;
export const PROFILE_MIN_HEIGHT = 12;

/**
 * How tall the profile can be in a corner `room` points tall.
 *
 * `room` is measured, not estimated: it is what the badges, the name and the
 * figures actually left at this text size. Zero means do not draw.
 */
export function tileProfileHeight(room: number): number {
    const height = Math.min(PROFILE_HEIGHT, Math.floor(room - PROFILE_CLEARANCE));
    return height >= PROFILE_MIN_HEIGHT ? height : 0;
}

/**
 * The card's three figures, as one line for a tile that has no room for three.
 *
 * `12g · 1:16 · 22`, in the card's own order, with a missing figure dropped
 * rather than drawn as a sentinel. Grind is left out for tea for the reason the
 * card leaves it out: a tea recipe always writes the default grind, so the
 * number is the app's rather than the user's and printing it invites them to
 * read meaning into it.
 */
function figuresLine(recipe: Recipe, isTea: boolean): string | null {
    const parts = [
        isSet(recipe.dosage) ? `${recipe.dosage}G` : undefined,
        isSet(recipe.ratio) ? `1:${recipe.ratio}` : undefined,
        isTea
            ? undefined
            : recipe.grinder
                ? (isSet(recipe.grindSize) ? String(recipe.grindSize) : undefined)
                : "OFF"
    ].filter((part) => part !== undefined);
    return parts.length > 0 ? parts.join(" · ") : null;
}

export {TILE_PHOTO_SIZE} from "@/library/recipePictureLayout";

type MetadataProps = {
    evidence: string | null;
    bag?: string;
    freshness?: string;
    slot?: string;
    marker?: string;
    favourite: boolean;
    editing: boolean;
    uuid: string;
    measuring?: boolean;
    onActions?: () => void;
};

function RecipeTileMetadata({
    evidence, bag, freshness, slot, marker, favourite, editing, uuid, measuring = false, onActions
}: MetadataProps) {
    const id = (name: string) => measuring ? undefined : `recipe-tile-${name}`;
    return (
        <XStack testID={measuring ? "recipe-tile-metadata-intrinsic" : id("badges")} alignItems="center" gap={PHOTO_GAP}
                flexWrap={measuring ? "nowrap" : "wrap"} justifyContent="flex-end" rowGap={2}>
            {evidence !== null && <DotMatrixText testID={id("evidence")} fontSize={10}
                weight="bold" letterSpacing={1.1} numberOfLines={1}
                style={{flexShrink: measuring ? 0 : 1}} color={onAccent.label}>{evidence}</DotMatrixText>}
            <XStack width={0} flexGrow={measuring ? 0 : 1}/>
            {editing && (measuring
                ? <View style={{width: 12, height: 12}}/>
                : <Pressable testID={`recipe-tile-actions-${uuid}`} accessibilityElementsHidden
                    importantForAccessibility="no-hide-descendants" hitSlop={8} onPress={onActions}>
                    <DotIcon testID="recipe-tile-actions" name="overflow" size={12} color={onAccent.marker}/>
                </Pressable>)}
            {slot && <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                <DotMatrixText testID={measuring ? undefined : "slot-marker"} color={onAccent.marker}
                    fontSize={11} weight="extrabold" letterSpacing={1} numberOfLines={1}>{slot}</DotMatrixText>
            </View>}
            {bag && <DotMatrixText testID={id("bag")} fontSize={10} weight="bold"
                letterSpacing={1.1} numberOfLines={1} color={onAccent.marker}>{bag}</DotMatrixText>}
            {freshness && <DotMatrixText testID={id("freshness")} fontSize={10} weight="bold"
                letterSpacing={1.1} numberOfLines={1} color={onAccent.marker}>{freshness}</DotMatrixText>}
            {favourite && (measuring ? <View style={{width: 12, height: 12}}/>
                : <DotIcon testID={id("favourite")} name="favourite" size={12} color={onAccent.marker}/>)}
            {marker && <DotMatrixText fontSize={11} weight="bold" letterSpacing={1.4}
                color={onAccent.marker}>{marker}</DotMatrixText>}
        </XStack>
    );
}

type Props = {
    recipe: Recipe;
    /** Open the recipe in the editor, the tile's plain tap. */
    onPress: () => void;
    /**
     * Open the recipe's actions.
     *
     * A square tile has no room to swipe a tray open the way a list row does, so
     * the write/brew/delete actions the row reaches by swiping are reached here
     * by a long press, which opens the one overflow sheet both views share. The
     * gesture is unreachable by a screen reader, which is what the
     * `accessibilityActions` below are for: the same acts, by another route.
     */
    onLongPress: () => void;
    /** Forwarded to the mark. Owned by the settings screen. */
    showCoffeeMarker?: boolean;
    /** Fill the pour profile with a dot screen. Owned by the settings screen. */
    dottedProfile?: boolean;
    /** Optional coffee photo, admitted only when the metadata row has room. */
    showPicture?: boolean;
    /**
     * How this recipe has gone: rating, brew count, how lately.
     *
     * The same figures the list card draws, from the same helper, because a
     * user moving between the two views is reading one recipe and is entitled
     * to one answer about it.
     */
    evidence?: RecipeEvidence;
    /** The open bag, as on the card: a badge in the corner row, no new row. */
    bag?: StoredBagReading;
    /** How fresh the open bag is, as on the card: beside the bag badge, no new row. */
    freshness?: Freshness;
    /**
     * The recipe's own actions, mirrored from the overflow sheet the long press
     * opens. Each is optional for the same reason its row in the sheet is: brew
     * needs a machine, write needs a card-worthy recipe, and a star is only
     * offered where one can be set. They exist on the tile so a screen reader,
     * which cannot long-press, still reaches every act the sheet offers.
     */
    onBrew?: () => void;
    onShare: () => void;
    onWrite?: () => void;
    onDuplicate: () => void;
    onDelete: () => void;
    onToggleFavourite?: () => void;
    /**
     * Open this recipe's brew history, the sheet's one row that no tray carries.
     *
     * Every other action here mirrors something a list row can also be swiped
     * to; this one mirrors the long press itself, so without it the history
     * would be reachable only by a gesture a reader cannot make.
     */
    onHistory?: () => void;
    /**
     * Reveal the tile's actions as a visible control.
     *
     * A tile's acts are behind a long press, which is a shortcut rather than an
     * affordance: nothing on screen says it is there. Edit mode is the answer
     * the list already gives, where it turns the swipe-only destructive actions
     * into visible ones, so the room gives the same answer in its own geometry
     * and opens the same sheet the long press opens. No new acts, just a door
     * that can be seen.
     */
    editing?: boolean;
    slotMarker?: SlotMarkerValue;
    onEasyMode?: () => void;
};

/**
 * A recipe as a shelf tile.
 *
 * Opening a shelf changes what is on the squares, not what a square is: a recipe
 * tile is the same 44-plus-two-lines geometry the shelf grid draws, at the same
 * `TILE_HEIGHT`, so a shelf room reads as the same grid with different tiles
 * rather than a different screen. It carries no `ShelfMark` -- that 44 pt square
 * is a shelf's art, and a recipe is a different thing -- but it wears the
 * recipe's accent and its pour-profile silhouette, the same identity the list
 * card wears, so the same recipe is recognisable in either view.
 *
 * The name is prose and stays in Inter, matching the list card and the manual
 * shelf's own label; the marker is machine vocabulary and is Doto.
 *
 * Top to bottom: badges, the name on up to two lines, the figures, and the pour
 * profile in the bottom corner. A picture may lead the metadata row, never the
 * name. The text is laid out first and the profile gets
 * what it leaves, so the silhouette can never be drawn across the name or the
 * figures. That is the card's arrangement too: its profile shares the bottom
 * edge with the figures but sits beside them, not under them.
 */
export default function RecipeShelfTile({
    recipe, onPress, onLongPress, showCoffeeMarker = true, dottedProfile = false,
    evidence, bag, freshness, onBrew, onShare, onWrite, onDuplicate, onDelete, onToggleFavourite,
    onHistory, editing = false, slotMarker, onEasyMode, showPicture = false
}: Props) {
    const accent = resolveAccent(recipe);
    const picture = showPicture ? recipe.imageURL ?? "" : "";
    const isTea = accentGroupFor(recipe) === "tea";
    const marker = isTea ? "TEA" : "COFFEE";
    const showMarker = isTea || showCoffeeMarker;
    const [profileRoom, setProfileRoom] = React.useState(0);
    const profileHeight = tileProfileHeight(profileRoom);

    // The whole tile is one accessibility element, so nothing inside is spoken
    // on its own: everything it shows has to be in this label or it reaches a
    // screen reader as the accent colour alone.
    const figures = figuresLine(recipe, isTea);
    const shownEvidence = evidenceLine(evidence);
    const bagReading = bag === undefined ? undefined : readBag(bag.bag, bag.usedGrams, recipe.dosage);
    const {width, fontScale} = useWindowDimensions();
    const metadata = {
        evidence: shownEvidence, bag: bagReading === undefined ? undefined : bagBadge(bagReading),
        freshness: freshness === undefined ? undefined : freshnessBadge(freshness),
        slot: slotMarker?.slots.join(" "), marker: showMarker ? marker : undefined,
        favourite: recipe.favourite, editing, uuid: recipe.uuid
    };
    const signature = JSON.stringify([metadata, recipe.displayName(), figures, width, fontScale, picture]);
    const [available, setAvailable] = React.useState<{key: string; value: number}>();
    const [intrinsic, setIntrinsic] = React.useState<{key: string; value: number}>();
    const [failed, setFailed] = React.useState<string>();
    const requested = picture.length > 0 && failed !== picture;
    const availableWidth = available?.key === signature ? available.value : undefined;
    const naturalKey = JSON.stringify([signature, availableWidth]);
    const showPhoto = requested && metadataPhotoFits(availableWidth,
        intrinsic?.key === naturalKey ? intrinsic.value : undefined);
    const summary = [
        recipe.displayName(),
        marker.toLowerCase(),
        recipe.favourite ? "starred" : undefined,
        slotMarker?.label,
        // Spoken in words rather than as the drawn line: "12G · 1:16 · 22" is a
        // glance's shorthand and reads as noise when it is read aloud.
        isSet(recipe.dosage) ? `${recipe.dosage} grams` : undefined,
        isSet(recipe.ratio) ? `ratio 1 to ${recipe.ratio}` : undefined,
        // The tile prints OFF in place of the size, so the label has to say it:
        // a figure drawn and not spoken is one a screen reader user never gets.
        !isTea && !recipe.grinder ? "grinder off" : undefined,
        !isTea && recipe.grinder && isSet(recipe.grindSize)
            ? `grind ${recipe.grindSize}`
            : undefined,
        ...spokenEvidence(evidence),
        bagReading !== undefined ? spokenBag(bagReading) : undefined,
        freshness !== undefined ? spokenFreshness(freshness) : undefined
    ].filter((part) => part !== undefined).join(", ");

    // The long press is unreachable by a screen reader, so the acts it opens are
    // offered here as actions instead. The set is the overflow sheet's, gated
    // the same way: brew only with a machine, write only on a card-worthy
    // recipe, favourite only where a star can be set. Drift between this list
    // and the sheet's rows is the failure the shared-sheet design guards, and a
    // test pins the two together.
    const actions = [
        ...(onEasyMode !== undefined
            ? [{name: "easyMode", label: "Assign to Easy Mode"}] : []),
        ...(onBrew !== undefined ? [{name: "brew", label: "Brew this recipe"}] : []),
        {name: "share", label: "Share recipe"},
        ...(onWrite !== undefined && canWriteToCard(recipe)
            ? [{name: "write", label: "Write recipe to card"}]
            : []),
        {name: "duplicate", label: "Duplicate recipe"},
        ...(onToggleFavourite !== undefined
            ? [{
                name:  "favourite",
                label: recipe.favourite ? "Remove star from recipe" : "Star recipe"
            }]
            : []),
        ...(onHistory !== undefined
            ? [{name: "history", label: "Brew history"}]
            : []),
        {name: "delete", label: "Delete recipe"}
    ];

    return (
        <Pressable
            testID={`recipe-tile-${recipe.uuid}`}
            accessible
            accessibilityRole="button"
            accessibilityLabel={summary}
            accessibilityHint="Opens this recipe. Long press for its actions."
            accessibilityActions={actions}
            onPress={onPress}
            onLongPress={onLongPress}
            onAccessibilityAction={(event) => {
                if (event.nativeEvent.actionName === "easyMode") {
                    onEasyMode?.();
                } else if (event.nativeEvent.actionName === "brew") {
                    onBrew?.();
                } else if (event.nativeEvent.actionName === "share") {
                    onShare();
                } else if (event.nativeEvent.actionName === "write") {
                    onWrite?.();
                } else if (event.nativeEvent.actionName === "duplicate") {
                    onDuplicate();
                } else if (event.nativeEvent.actionName === "favourite") {
                    onToggleFavourite?.();
                } else if (event.nativeEvent.actionName === "history") {
                    onHistory?.();
                } else if (event.nativeEvent.actionName === "delete") {
                    onDelete();
                }
            }}
            style={({pressed}) => ({
                flex:      1,
                opacity:   pressed ? 0.85 : 1,
                transform: [{scale: pressed ? 0.99 : 1}]
            })}>
            <YStack testID="recipe-tile" height={TILE_HEIGHT}
                    gap="$1.5" overflow="hidden"
                    padding={TILE_PADDING} borderRadius="$4"
                    style={{backgroundColor: accent}}>

                <XStack testID="recipe-tile-top" alignItems="flex-start">
                    <YStack flex={1} gap="$1.5">
                        <XStack key={signature} testID="recipe-tile-metadata-width" alignItems="center" gap={PHOTO_GAP}
                            onLayout={event => setAvailable({key: signature, value: event.nativeEvent.layout.width})}>
                            {requested && <RecipePhoto testID="recipe-tile-photo" uri={picture} visible={showPhoto}
                                size={TILE_PHOTO_SIZE} radius={TILE_PHOTO_SIZE / 2} backing={onAccent.key}
                                onError={() => setFailed(picture)}/>}
                            <YStack flex={1}><RecipeTileMetadata {...metadata} onActions={onLongPress}/></YStack>
                        </XStack>
                        {requested && <ScrollView key={naturalKey} horizontal
                            testID="recipe-tile-metadata-measure" pointerEvents="none"
                            accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
                            style={{height: 0, opacity: 0, position: "absolute", width: "100%"}}
                            onContentSizeChange={value => setIntrinsic({key: naturalKey, value})}>
                            <RecipeTileMetadata {...metadata} measuring/>
                        </ScrollView>}

                        <Text fontSize={15} fontWeight="700"
                              numberOfLines={2}
                              color={recipe.hasName() ? onAccent.text : onAccent.label}>
                            {recipe.displayName()}
                        </Text>
                    </YStack>
                </XStack>

                {figures !== null && (
                    <DotMatrixText testID="recipe-tile-figures" fontSize={11}
                                   weight="bold" letterSpacing={1.2}
                                   numberOfLines={1} color={onAccent.label}>
                        {figures}
                    </DotMatrixText>
                )}

                {/* The corner the text left, down to the tile's bottom and
                    right edges. Measured rather than assumed, because the text
                    above it grows with the OS text size. The profile is drawn
                    only once the room is known and only as tall as the room,
                    so it is never under the name or the figures. */}
                <View testID="recipe-tile-profile-room" pointerEvents="none"
                      onLayout={(event) => setProfileRoom(event.nativeEvent.layout.height)}
                      style={{flex: 1, marginRight: -TILE_PADDING, marginBottom: -TILE_PADDING}}>
                    {profileHeight > 0 && (
                        <View style={{
                            position: "absolute",
                            right:    -(PROFILE_BLEED + PROFILE_OVERHANG),
                            bottom:   -(PROFILE_BLEED + PROFILE_OVERHANG)
                        }}>
                            <PourProfile testID="recipe-tile-profile" pours={recipe.pours}
                                         width={140} height={profileHeight}
                                         dotted={dottedProfile}/>
                        </View>
                    )}
                </View>
            </YStack>
        </Pressable>
    );
}
