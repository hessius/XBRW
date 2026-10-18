import React from "react";
import {Pressable, View} from "react-native";
import {useSafeAreaInsets} from "react-native-safe-area-context";
import {Text, XStack, YStack} from "tamagui";

import Collapsible from "@/components/Collapsible";
import DotIcon from "@/components/DotIcon";
import DotMatrixText, {DOTO_MAX_FONT_SCALE} from "@/components/DotMatrixText";
import PourProfile, {PROFILE_BLEED} from "@/components/PourProfile";
import RecipePhoto from "@/components/RecipePhoto";
import {onAccent} from "@/constants/colors";
import type Pour from "@/library/Pour";

/** How far the watermark runs past the slab before it is clipped. */
const PROFILE_OVERHANG = 2;

/**
 * The recipe's picture in the open slab: a rounded square in the top right
 * corner, under the HELP and menu wells.
 *
 * That corner is the one stretch of the slab nothing else uses. The name keeps
 * to its 72% column on the left and the pour profile owns the bottom right, so
 * the picture neither moves the name nor pushes the watermark down. It is drawn
 * out of the flow, so a picture that fails to load leaves the slab exactly as
 * tall as it was with nothing to draw.
 */
export const HERO_PHOTO_SIZE = 56;

/**
 * How much of the name's row the picture keeps for itself, picture and gap.
 *
 * Set aside whenever a picture is due, loaded or not. Reserving it only once
 * the picture arrived would rewrap the name a moment after the screen opened.
 */
export const HERO_PHOTO_RESERVE = HERO_PHOTO_SIZE + 8;

/** A control in the header's chrome row, drawn in a well cut out of the accent. */
function HeaderButton({label, icon, accent, onPress}: {
    label: string;
    icon: "back" | "overflow";
    accent: string;
    onPress: () => void;
}) {
    return (
        <Pressable accessibilityRole="button" accessibilityLabel={label}
                   onPress={onPress} hitSlop={12}>
            <YStack backgroundColor={onAccent.key} borderRadius="$3"
                    width={32} height={32} alignItems="center" justifyContent="center">
                <DotIcon name={icon} size={16} color={accent}/>
            </YStack>
        </Pressable>
    );
}

type Props = {
    /** Already resolved by the caller, via `Recipe.displayName()`. */
    name: string;
    /** False when `name` is a placeholder, which is then drawn muted. */
    named: boolean;
    xid: string;
    accent: string;
    beverage: "COFFEE" | "TEA";
    pours: Pour[];
    /** Folds the slab down to its chrome row, which then carries the name. */
    collapsed: boolean;
    onBack: () => void;
    onMore: () => void;
    /** Opens the help sheet. In the chrome row, because help is not a rare action. */
    onHelp: () => void;
    /**
     * Opens the rename sheet.
     *
     * The name is a button in both places it is drawn, with a pencil beside it,
     * because the roadmap rules out hidden functionality and a title that merely
     * happens to be tappable is hidden.
     */
    onRename: () => void;
    /** `recipe.imageURL`: pod artwork, or a photo an import link carried. */
    imageURL?: string;
    /** `showRecipeAvatars`. Off, no picture is drawn and no room is kept. */
    showPicture?: boolean;
};

/**
 * The recipe, as a picture.
 *
 * Inert apart from its chrome row. Every value shown here is edited in the BREW
 * deck, so the hero never has to be both a headline and a form — the two jobs
 * pulled the layout apart in every mockup that tried to do both.
 *
 * It is also the screen's navigation bar. The native header was a second
 * surface stacked on top of this one, in a different colour, carrying a back
 * control auto-labelled "index" and a title that only repeated the slab below
 * it; folding the two together leaves one object that is plainly the recipe.
 * That is why this sits outside the scroll view and collapses itself rather
 * than scrolling away.
 *
 * The name arrives already chosen. Working out what to call a recipe that has
 * none is `Recipe.displayName`'s job and it is a chain of four fallbacks, so a
 * second opinion here would eventually disagree with the home screen about what
 * the same recipe is called.
 */
export default function RecipeHero({
    name, named, xid, accent, beverage, pours, collapsed,
    onBack, onMore, onHelp, onRename, imageURL, showPicture = false
}: Props) {
    "use no memo";

    // The accent slab runs up behind the status bar rather than starting below
    // it, so the screen has one surface at the top instead of a black strip
    // above a coloured card.
    const insets = useSafeAreaInsets();
    const picture = showPicture ? imageURL ?? "" : "";

    // `pours` is the recipe's own array, mutated in place, and the watermark
    // reads each pour through a getter rather than a property — so there is
    // nothing for the React Compiler to compare and a stale watermark would
    // survive a stage edit. The compiler is off under jest, so no test here can
    // catch that. Same reason as `StageTile` and `StageProfile`.
    return (
        <YStack testID="recipe-hero" backgroundColor={accent}
                borderBottomLeftRadius="$6" borderBottomRightRadius="$6"
                paddingHorizontal="$4" paddingTop={insets.top + 6} paddingBottom="$3"
                overflow="hidden">
            {/* No opacity on this wrapper. The stroke colour already carries its
                own dimming and a group opacity multiplies it — which is how the
                watermark once measured 8.46:1 as a token and rendered at 2.72:1
                on the palest accent. */}
            {!collapsed && (
                <View pointerEvents="none"
                      style={{
                          position: "absolute",
                          right:    -(PROFILE_BLEED + PROFILE_OVERHANG),
                          bottom:   -(PROFILE_BLEED + PROFILE_OVERHANG)
                      }}>
                    <PourProfile pours={pours} width={190} height={74}
                                 stroke={onAccent.profileStroke} fill={onAccent.profileFill}/>
                </View>
            )}

            {/* The navigation chrome lives on the accent rather than in a bar
                above it. Two surfaces stacked at the top of the screen read as
                two unrelated things; one reads as the recipe. */}
            <XStack alignItems="center" gap="$2" minHeight={36}>
                <HeaderButton label="Back" icon="back" accent={accent} onPress={onBack}/>

                {/* The name moves up here once the slab is folded away, so the
                    screen never loses its title. Still the rename button when
                    it does: renaming is reachable from every scroll position and
                    every deck, which it never was while Name was a row near the
                    bottom of BREW. Not a button while the slab is open, where
                    the pressable would be an empty strip between BACK and HELP. */}
                {collapsed ? (
                    <Pressable accessibilityRole="button" accessibilityLabel={name}
                               accessibilityHint="Opens a sheet to rename this recipe"
                               testID="hero-rename-collapsed"
                               style={{flex: 1, flexDirection: "row", alignItems: "center"}}
                               onPress={onRename} hitSlop={8}>
                        <Text flex={1} numberOfLines={1} fontSize={15} fontWeight="700"
                              maxFontSizeMultiplier={DOTO_MAX_FONT_SCALE}
                              color={named ? onAccent.text : onAccent.label}>
                            {name}
                        </Text>
                        <DotIcon name="edit" size={13} color={onAccent.label}/>
                    </Pressable>
                ) : <View style={{flex: 1}}/>}

                {/* In the chrome row rather than behind the caret. Help is
                    not a rare action -- it is what the deck's one-line hints
                    point at -- and a reader who wants it wants it from where
                    they are stuck, not from a menu of recipe operations. */}
                <Pressable accessibilityRole="button" accessibilityLabel="Help"
                           onPress={onHelp} hitSlop={12}>
                    <YStack backgroundColor={onAccent.key} borderRadius="$3"
                            paddingHorizontal="$2" height={32} justifyContent="center">
                        <DotMatrixText fontSize={11} weight="bold" letterSpacing={1.6}
                                       color={accent}>
                            HELP
                        </DotMatrixText>
                    </YStack>
                </Pressable>

                <HeaderButton label="More" icon="overflow" accent={accent} onPress={onMore}/>
            </XStack>

            <Collapsible open={!collapsed}>
                {/* Only in the open slab. Folded, the chrome row is a title bar
                    and a thumbnail there would be one more thing to squeeze the
                    name against. Top aligned with the beverage row, which is
                    where the content starts. */}
                {picture.length > 0 && (
                    <View pointerEvents="none"
                          style={{position: "absolute", top: 8, right: 0}}>
                        <RecipePhoto testID="hero-photo" uri={picture}
                                     size={HERO_PHOTO_SIZE} radius={10}/>
                    </View>
                )}

                <XStack alignItems="center" gap="$2" marginTop="$2">
                    <DotMatrixText fontSize={11} weight="bold" letterSpacing={2}
                                   color={onAccent.label}>
                        {beverage}
                    </DotMatrixText>
                    {xid !== "" && (
                        <XStack testID="hero-xid" backgroundColor={onAccent.key}
                                borderRadius="$2" paddingHorizontal="$1.5" paddingVertical={1}>
                            <DotMatrixText fontSize={11} weight="bold" letterSpacing={1.6}
                                           color={accent}>
                                {xid}
                            </DotMatrixText>
                        </XStack>
                    )}
                </XStack>

                {/* Bounded to the same scale Doto is, exactly as the home card
                    is, so a long name at a large text size does not swallow the
                    slab. */}
                {/* A recipe with no name of its own draws its borrowed title
                    muted, and the placeholder is a button exactly as a real name
                    is: New recipe is the one title every recipe starts with, so
                    it is the one a person most wants to tap. */}
                <Pressable accessibilityRole="button" accessibilityLabel={name}
                           accessibilityHint="Opens a sheet to rename this recipe"
                           testID="hero-rename"
                           style={{
                               flexDirection: "row", alignItems: "flex-start", gap: 8,
                               marginRight: picture.length > 0 ? HERO_PHOTO_RESERVE : 0
                           }}
                           onPress={onRename} hitSlop={8}>
                    <Text fontSize={26} fontWeight="700" lineHeight={31} marginTop="$2"
                          maxFontSizeMultiplier={DOTO_MAX_FONT_SCALE}
                          color={named ? onAccent.text : onAccent.label}
                          numberOfLines={2} maxWidth="72%">
                        {name}
                    </Text>
                    <YStack marginTop="$3">
                        <DotIcon name="edit" size={15} color={onAccent.label}/>
                    </YStack>
                </Pressable>
            </Collapsible>
        </YStack>
    );
}
