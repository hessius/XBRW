import React from "react";
import {Pressable, View, useWindowDimensions} from "react-native";
import {useSafeAreaInsets} from "react-native-safe-area-context";
import {Text, XStack, YStack} from "tamagui";

import Collapsible from "@/components/Collapsible";
import DotIcon from "@/components/DotIcon";
import DotMatrixText, {DOTO_MAX_FONT_SCALE} from "@/components/DotMatrixText";
import PourProfile, {PROFILE_BLEED, PROFILE_STROKE_WIDTH} from "@/components/PourProfile";
import {onAccent} from "@/constants/colors";
import type Pour from "@/library/Pour";

/** How far the watermark runs past the slab before it is clipped. */
const PROFILE_OVERHANG = 2;

/** The watermark's drawing size, before its stroke. */
const PROFILE_WIDTH = 190;
const PROFILE_HEIGHT = 74;

/** The slab's side padding (`$4`) and bottom padding (`$3`), in points. */
const SLAB_PADDING_X = 18;
const SLAB_PADDING_BOTTOM = 13;

/** The pencil beside the name, and the gap before it. */
const PENCIL_WIDTH = 15 + 8;

/** How much of the slab's bottom right corner the watermark covers. */
const PROFILE_VISIBLE_WIDTH =
    PROFILE_WIDTH + PROFILE_STROKE_WIDTH - PROFILE_BLEED - PROFILE_OVERHANG;
const PROFILE_VISIBLE_HEIGHT =
    PROFILE_HEIGHT + PROFILE_STROKE_WIDTH - PROFILE_BLEED - PROFILE_OVERHANG;

/**
 * The empty band left under a name that runs the slab's full width, so the
 * watermark sits below the text rather than behind it.
 *
 * The watermark is pinned to the slab's bottom edge and the name ends the
 * slab's padding above it, so this is the watermark's height less that padding,
 * plus a few points of air.
 */
export const HERO_PROFILE_RESERVE =
    Math.ceil(PROFILE_VISIBLE_HEIGHT - SLAB_PADDING_BOTTOM + 4);

/**
 * The longest name drawn at the full title size.
 *
 * Two lines at 26 hold roughly this many characters in the slab's 72% column
 * on a narrow phone. A name that fits stays exactly as it always was.
 *
 * Counted in characters rather than measured, on purpose: measuring needs a
 * first layout to read back, and a title that redraws itself a frame after the
 * screen opens is a title that visibly jumps.
 */
export const HERO_NAME_LONG = 28;

/**
 * Past this, a name steps down again, to 18, and may take four lines.
 *
 * A roaster's import names the origin, the farm, the producer and the lot, and
 * runs to 90 characters. Three lines at 22 across a 360 point phone hold about
 * 80 characters at the default text size and about 60 at a large one, so the
 * longest names need the smaller step.
 */
export const HERO_NAME_LONGER = 56;

/** How the slab sets a name, chosen from its length alone. */
export function heroNameStyle(name: string): {
    fontSize: number;
    lineHeight: number;
    lines: number;
} {
    if (name.length > HERO_NAME_LONGER) {
        return {fontSize: 18, lineHeight: 23, lines: 4};
    }
    return name.length > HERO_NAME_LONG
        ? {fontSize: 22, lineHeight: 27, lines: 3}
        : {fontSize: 26, lineHeight: 31, lines: 2};
}

/**
 * The average advance of one character of the bold title face, as a share of
 * the font size. Read off a device screenshot at 0.48 and rounded up, so an
 * estimate errs towards one line too many rather than one too few.
 */
const GLYPH_EM = 0.5;

/**
 * How many lines `text` takes when wrapped word by word at `fontSize` into
 * `width` points. An estimate from the character count, for the reason given at
 * `HERO_NAME_LONG`. The name is set with the simple line breaker, so the device
 * wraps the same greedy way this counts.
 */
export function estimateLines(text: string, width: number, fontSize: number): number {
    const perLine = Math.max(1, Math.floor(width / (fontSize * GLYPH_EM)));
    let lines = 1;
    let used = 0;
    for (const word of text.split(" ").filter(Boolean)) {
        const wanted = used === 0 ? word.length : used + 1 + word.length;
        if (wanted <= perLine) {
            used = wanted;
            continue;
        }
        if (used > 0) {
            lines++;
        }
        let left = word.length;
        while (left > perLine) {
            lines++;
            left -= perLine;
        }
        used = left;
    }
    return lines;
}

export type HeroNameLayout = ReturnType<typeof heroNameStyle> & {
    /** The name's column: a share of the row, or points. */
    maxWidth: number | "72%";
    /** The band kept free under the name for the watermark. */
    reserve: number;
    /** Closes up the space under the chrome row, for the four-line step. */
    tight: boolean;
};

/**
 * Where the slab puts a name, and how much room it keeps for the watermark.
 *
 * A short name keeps the 72% column it always had. A longer one is never drawn
 * across the pour profile. It goes in the column beside the watermark when it
 * fits there in its step's lines (the Fold's inner screen, where that column is
 * over 600 points wide). Otherwise it takes the slab's full width and the
 * watermark sits under it, in `HERO_PROFILE_RESERVE`. That is the narrow
 * phone's case, where the column beside the watermark is about 100 points.
 *
 * `fontScale` is the OS text size, bounded as the name's own is.
 */
export function heroNameLayout(name: string, windowWidth: number, fontScale = 1): HeroNameLayout {
    const style = heroNameStyle(name);
    if (style.lines === 2) {
        return {...style, maxWidth: "72%", reserve: 0, tight: false};
    }
    const scaled = style.fontSize * Math.min(Math.max(fontScale, 1), DOTO_MAX_FONT_SCALE);
    const full = windowWidth - 2 * SLAB_PADDING_X - PENCIL_WIDTH;
    const beside = full - PROFILE_VISIBLE_WIDTH - 8;
    const tight = style.lines === 4;
    if (beside > 0 && estimateLines(name, beside, scaled) <= style.lines) {
        return {...style, maxWidth: Math.floor(beside), reserve: 0, tight};
    }
    return {...style, maxWidth: Math.floor(full), reserve: HERO_PROFILE_RESERVE, tight};
}

/**
 * How much the slab folds away for this name, at the largest text size.
 *
 * The editor's header refuses to collapse a page too short to stay collapsed
 * (`nextCollapsed`), and this is the slab's half of that sum: the beverage row,
 * the name at its step's full line count, and the band kept for the watermark.
 * A deliberate overestimate, so it assumes the largest text size and the
 * reserve, whatever this name and this screen need.
 */
export function heroFoldAway(name: string): number {
    const {lineHeight, lines} = heroNameStyle(name);
    const tight = lines === 4;
    const beverageRow = (tight ? 2 : 7) + 24;
    const nameBlock = (tight ? 4 : 7) + lines * lineHeight * DOTO_MAX_FONT_SCALE;
    return Math.ceil(beverageRow + nameBlock + (lines > 2 ? HERO_PROFILE_RESERVE : 0));
}

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
    onBack, onMore, onHelp, onRename
}: Props) {
    "use no memo";

    // The accent slab runs up behind the status bar rather than starting below
    // it, so the screen has one surface at the top instead of a black strip
    // above a coloured card.
    const insets = useSafeAreaInsets();
    const {width, fontScale} = useWindowDimensions();
    const nameLayout = heroNameLayout(name, width, fontScale);

    // `pours` is the recipe's own array, mutated in place, and the watermark
    // reads each pour through a getter rather than a property — so there is
    // nothing for the React Compiler to compare and a stale watermark would
    // survive a stage edit. The compiler is off under jest, so no test here can
    // catch that. Same reason as `StageTile` and `StageProfile`.
    return (
        <YStack testID="recipe-hero" backgroundColor={accent}
                borderBottomLeftRadius="$6" borderBottomRightRadius="$6"
                paddingHorizontal={SLAB_PADDING_X} paddingTop={insets.top + 6}
                paddingBottom={SLAB_PADDING_BOTTOM}
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
                    <PourProfile pours={pours} width={PROFILE_WIDTH} height={PROFILE_HEIGHT}
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
                    the pressable would be an empty strip between BACK and HELP.
                    Two lines rather than one: two at this size are no taller
                    than the 32 pt wells beside them plus their padding, so a
                    long name costs the folded bar a few points at most. */}
                {collapsed ? (
                    <Pressable accessibilityRole="button" accessibilityLabel={name}
                               accessibilityHint="Opens a sheet to rename this recipe"
                               testID="hero-rename-collapsed"
                               style={{flex: 1, flexDirection: "row", alignItems: "center"}}
                               onPress={onRename} hitSlop={8}>
                        <Text testID="hero-name-collapsed" flex={1} numberOfLines={2}
                              fontSize={15} fontWeight="700"
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
                {/* The four-line step closes up the gap under the chrome row,
                    which is the one place the slab has room to give. */}
                <XStack alignItems="center" gap="$2"
                        marginTop={nameLayout.tight ? "$1" : "$2"}>
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
                           style={{flexDirection: "row", alignItems: "flex-start", gap: 8}}
                           onPress={onRename} hitSlop={8}>
                    {/* Never across the watermark: `heroNameLayout` puts a
                        long name beside it or above it. `simple` breaks lines
                        the greedy way `estimateLines` counts them, which the
                        balanced default on Android does not. */}
                    <Text testID="hero-name" fontSize={nameLayout.fontSize}
                          fontWeight="700" lineHeight={nameLayout.lineHeight}
                          marginTop={nameLayout.tight ? "$1.5" : "$2"}
                          maxFontSizeMultiplier={DOTO_MAX_FONT_SCALE}
                          textBreakStrategy="simple"
                          color={named ? onAccent.text : onAccent.label}
                          numberOfLines={nameLayout.lines} maxWidth={nameLayout.maxWidth}>
                        {name}
                    </Text>
                    <YStack marginTop="$3">
                        <DotIcon name="edit" size={15} color={onAccent.label}/>
                    </YStack>
                </Pressable>
                {nameLayout.reserve > 0 && (
                    <View testID="hero-profile-reserve" pointerEvents="none"
                          style={{height: nameLayout.reserve}}/>
                )}
            </Collapsible>
        </YStack>
    );
}
