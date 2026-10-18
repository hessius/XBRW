import React from "react";
import {Pressable, View, useWindowDimensions} from "react-native";
import {useSafeAreaInsets} from "react-native-safe-area-context";
import {Text, XStack, YStack} from "tamagui";

import Collapsible from "@/components/Collapsible";
import DotIcon from "@/components/DotIcon";
import DotMatrixText, {DOTO_MAX_FONT_SCALE} from "@/components/DotMatrixText";
import PourProfile, {
    PROFILE_BLEED, PROFILE_STROKE_WIDTH, profileHeightAt
} from "@/components/PourProfile";
import RecipePhoto from "@/components/RecipePhoto";
import {onAccent} from "@/constants/colors";
import type Pour from "@/library/Pour";

/** How far the watermark runs past the slab before it is clipped. */
const PROFILE_OVERHANG = 2;

/**
 * The recipe's picture in the open slab: a rounded square in the top right
 * corner, under the HELP and menu wells.
 *
 * That corner is the one stretch of the slab nothing else uses. The name's row
 * stops `HERO_PHOTO_RESERVE` short of it (and `heroNameLayout` sizes a long name
 * for that narrower row) and the pour profile owns the bottom right, so the
 * picture neither covers the name nor pushes the watermark down. It is drawn
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

/** The watermark's drawing size, before its stroke. */
const PROFILE_WIDTH = 190;
const PROFILE_HEIGHT = 74;

/**
 * The watermark's height when it sits in a band under a long name. Lower than
 * its usual 74, so the band costs the slab less: it is a silhouette, and it
 * reads as the same one at two thirds of the height.
 */
export const PROFILE_BAND_HEIGHT = 50;

/** The slab's side padding (`$4`) and bottom padding (`$3`), in points. */
const SLAB_PADDING_X = 18;
const SLAB_PADDING_BOTTOM = 13;

/** The pencil beside the name, and the gap before it. */
const PENCIL_WIDTH = 15 + 8;

/**
 * Points knocked off a column before asking whether a name fits it. The second
 * device report wrapped a line the estimate put 1 to 2 points inside the
 * column, so this keeps a fit from depending on a margin that thin.
 */
const FIT_SLACK = 4;

/** Clear space kept between the name and the watermark, across. */
const PROFILE_GAP = 8;

/** Clear space kept between the name and the watermark's line, above it. */
const PROFILE_AIR = 4;

/**
 * How far below the top of the name's first line the pencil ends: its 12 pt
 * margin and 15 pt height, less the name's 6 pt margin in the band layout.
 */
const PENCIL_FOOT = 12 + 15 - 6;

/** How much of the slab's right edge the watermark covers. */
const PROFILE_VISIBLE_WIDTH =
    PROFILE_WIDTH + PROFILE_STROKE_WIDTH - PROFILE_BLEED - PROFILE_OVERHANG;

/**
 * The empty band left under a name that runs the slab's full width, so the
 * watermark sits below the text rather than behind it.
 *
 * The watermark is pinned to the slab's bottom edge and the name ends the
 * slab's padding above it, so this is the band-height watermark less that
 * padding, plus a few points of air.
 */
export const HERO_PROFILE_RESERVE = Math.ceil(
    PROFILE_BAND_HEIGHT + PROFILE_STROKE_WIDTH - PROFILE_BLEED - PROFILE_OVERHANG
    - SLAB_PADDING_BOTTOM + PROFILE_AIR
);

/**
 * The longest name drawn at the full title size.
 *
 * Two lines at 26 hold roughly this many characters in the slab's 72% column
 * on a narrow phone. A name that fits stays exactly as it always was.
 */
export const HERO_NAME_LONG = 28;

/** The most lines a name may take in the open slab. */
export const HERO_NAME_MAX_LINES = 3;

/**
 * The sizes a longer name may be set at, largest first, with their line
 * heights. All are sizes the app already uses (15 is the folded bar's). The
 * last is the floor: 15 holds a 100 character name in three lines on a 360
 * point phone at 1.15x text. A name that does not fit even at 15 (only at the
 * largest text sizes) is cut after three lines with an ellipsis.
 */
export const HERO_NAME_STEPS = [
    {fontSize: 22, lineHeight: 27},
    {fontSize: 20, lineHeight: 25},
    {fontSize: 18, lineHeight: 23},
    {fontSize: 16, lineHeight: 21},
    {fontSize: 15, lineHeight: 20}
] as const;

/**
 * Advance widths of the bold title face, in em, by kind of character.
 *
 * Fitted to two device screenshots of the slab (Fold cover screen, about
 * 360 points wide, OS text at 1x): a mostly lower-case line measured 16.35 em
 * against 16.38 here, and a line of capitals and asterisks 14.6 against 14.7.
 * With `FIT_SLACK` the estimate breaks the 98 character name of the second
 * screenshot at the same three places the phone did. A plain 0.5 em a
 * character ran about 4% short on capitals.
 */
export function glyphEm(char: string): number {
    if (char === " ") {
        return 0.25;
    }
    if ("MW".includes(char)) {
        return 0.86;
    }
    if (char >= "A" && char <= "Z") {
        return 0.64;
    }
    if ("mw".includes(char)) {
        return 0.78;
    }
    if ("ijlrtf".includes(char)) {
        return 0.32;
    }
    if (char >= "a" && char <= "z") {
        return 0.54;
    }
    if (char >= "0" && char <= "9") {
        return 0.56;
    }
    if ("|.,:;'!-()".includes(char)) {
        return 0.27;
    }
    if (char === "*") {
        return 0.42;
    }
    return 0.62;
}

function textEm(text: string): number {
    let em = 0;
    for (const char of text) {
        em += glyphEm(char);
    }
    return em;
}

/**
 * The widths, in points, of the lines `text` wraps to at `fontSize` in
 * `width` points, breaking greedily at spaces as the simple line breaker does.
 * A word too long for a line is split across as many as it needs.
 *
 * Estimated from the characters rather than measured, on purpose: measuring
 * needs a first layout to read back, and a title that redraws itself a frame
 * after the screen opens is a title that visibly jumps. The name is set with
 * `textBreakStrategy="simple"` so Android wraps the same greedy way.
 */
export function wrapLines(text: string, width: number, fontSize: number): number[] {
    const space = glyphEm(" ") * fontSize;
    const lines: number[] = [];
    let used = -1;
    for (const word of text.split(" ").filter(Boolean)) {
        let wordWidth = textEm(word) * fontSize;
        if (used >= 0 && used + space + wordWidth <= width) {
            used += space + wordWidth;
            continue;
        }
        if (used >= 0) {
            lines.push(used);
        }
        while (wordWidth > width) {
            lines.push(width);
            wordWidth -= width;
        }
        used = wordWidth;
    }
    lines.push(Math.max(used, 0));
    return lines;
}

/** How many lines `text` takes; see `wrapLines`. */
export function estimateLines(text: string, width: number, fontSize: number): number {
    return wrapLines(text, width, fontSize).length;
}

export type HeroNameLayout = {
    fontSize: number;
    lineHeight: number;
    /** `numberOfLines`: the most the name may take. */
    lines: number;
    /** The name's column: a share of the row, or points. */
    maxWidth: number | "72%";
    /** The band kept free under the name for the watermark. */
    reserve: number;
    /** The watermark's drawing height. */
    profileHeight: number;
    /** Closes up the space under the chrome row when the band is used. */
    tight: boolean;
};

/**
 * Where the slab puts a name, at what size, and how much room it keeps for the
 * watermark.
 *
 * A short name keeps the 26 pt, two-line, 72% column it always had. A longer
 * one takes the largest step in `HERO_NAME_STEPS` at which it fits three
 * lines, and is never drawn across the pour profile. At each step it first
 * tries the column beside the watermark (the Fold's inner screen, where that
 * column is over 600 points), then the slab's full width with the watermark
 * moved into a band under it. That is the phone's case, where the column beside
 * the watermark is 100 to 150 points.
 *
 * The band is only as tall as it must be for the watermark to clear the name,
 * line by line (`bandReserve`). The watermark only climbs, left to right, so a
 * line that stops over its low end needs less room than one that runs on to
 * its last plateau, and a short last line that ends before the watermark
 * starts needs none. `pours` is what the watermark draws. Without it the band
 * assumes the watermark's full height wherever it reaches.
 *
 * `fontScale` is the OS text size, bounded as the name's own is. A size picked
 * from the width and the character count, rather than `adjustsFontSizeToFit`,
 * because that prop is typed iOS-only in React Native 0.86 (its
 * `minimumFontScale` is honoured only on iOS), it shrinks to any size rather
 * than a step on the type scale, and the band and the header's collapse both
 * need the size before the first layout.
 *
 * `photoReserve` is the room the recipe's picture keeps on the right of the
 * name's row (`HERO_PHOTO_RESERVE` when one is due, else 0). The full-width
 * column is that much narrower, so a long name is never estimated under the
 * picture. The column beside the watermark is not: it already ends left of
 * the watermark, which starts well before the picture's corner. A short name
 * that would not fit its two lines at 26 in the narrower row is laid out as a
 * long one.
 */
export function heroNameLayout(
    name: string, windowWidth: number, fontScale = 1,
    {pours, photoReserve = 0}: {pours?: Pour[]; photoReserve?: number} = {}
): HeroNameLayout {
    const scale = Math.min(Math.max(fontScale, 1), DOTO_MAX_FONT_SCALE);
    const row = windowWidth - 2 * SLAB_PADDING_X - photoReserve;
    if (name.length <= HERO_NAME_LONG && (
        photoReserve === 0
        || estimateLines(name, 0.72 * row - FIT_SLACK, 26 * scale) <= 2
    )) {
        return {
            fontSize: 26, lineHeight: 31, lines: 2, maxWidth: "72%",
            reserve: 0, profileHeight: PROFILE_HEIGHT, tight: false
        };
    }
    const beside = Math.floor(
        windowWidth - 2 * SLAB_PADDING_X - PENCIL_WIDTH - PROFILE_VISIBLE_WIDTH - PROFILE_GAP
    );
    const full = Math.floor(row - PENCIL_WIDTH);

    const fitted = (step: typeof HERO_NAME_STEPS[number], last: boolean): HeroNameLayout | null => {
        const size = step.fontSize * scale;
        if (beside > 0 && estimateLines(name, beside - FIT_SLACK, size) <= HERO_NAME_MAX_LINES) {
            return {
                ...step, lines: HERO_NAME_MAX_LINES, maxWidth: beside, reserve: 0,
                profileHeight: PROFILE_HEIGHT, tight: false
            };
        }
        const wrapped = wrapLines(name, full - FIT_SLACK, size);
        if (wrapped.length > HERO_NAME_MAX_LINES && !last) {
            return null;
        }
        const drawn = wrapped.slice(0, HERO_NAME_MAX_LINES);
        return {
            ...step, lines: HERO_NAME_MAX_LINES, maxWidth: full,
            reserve: bandReserve(drawn, step.lineHeight * scale, full, windowWidth, pours),
            profileHeight: PROFILE_BAND_HEIGHT, tight: true
        };
    };

    for (let i = 0; i < HERO_NAME_STEPS.length; i++) {
        const layout = fitted(HERO_NAME_STEPS[i], i === HERO_NAME_STEPS.length - 1);
        if (layout !== null) {
            return layout;
        }
    }
    throw new Error("unreachable: the last step always returns a layout");
}

/**
 * The band kept under a long name so the watermark clears it.
 *
 * `drawn` is the estimated width of each line, top to bottom, all starting at
 * the name's left edge, `column` the most the name's box may take. For each
 * line, and the pencil beside the first, this asks how high the watermark
 * stands at the point where it ends (plus `PROFILE_GAP` across and
 * `PROFILE_AIR` above) and how far above the slab's bottom edge it already is
 * without a band. The band is the largest shortfall. The watermark only climbs,
 * so its height where a line ends is the highest it gets under that line.
 */
function bandReserve(
    drawn: number[], lineHeight: number, column: number, windowWidth: number, pours?: Pour[]
): number {
    // How high the watermark's line stands above the slab's bottom edge, under
    // a point `x` points along from the name's left edge.
    const stand = (x: number): number => {
        const along = SLAB_PADDING_X + x + PROFILE_GAP
            - (windowWidth - PROFILE_VISIBLE_WIDTH) - PROFILE_BLEED;
        const height = pours === undefined
            ? (along > 0 ? PROFILE_BAND_HEIGHT : 0)
            : profileHeightAt(pours, PROFILE_WIDTH, PROFILE_BAND_HEIGHT, along);
        return height > 0
            ? height + PROFILE_STROKE_WIDTH - PROFILE_BLEED - PROFILE_OVERHANG
            : 0;
    };
    const count = drawn.length;
    let reserve = 0;
    drawn.forEach((width, i) => {
        const above = SLAB_PADDING_BOTTOM + (count - 1 - i) * lineHeight;
        reserve = Math.max(reserve, stand(width + FIT_SLACK) + PROFILE_AIR - above);
    });
    const box = Math.min(column, Math.max(...drawn) + FIT_SLACK);
    const pencilAbove = SLAB_PADDING_BOTTOM + count * lineHeight - PENCIL_FOOT;
    reserve = Math.max(reserve, stand(box + PENCIL_WIDTH) + PROFILE_AIR - pencilAbove);
    return Math.max(0, Math.ceil(reserve));
}

/**
 * How much the slab folds away for this name, at the largest text size.
 *
 * The editor's header refuses to collapse a page too short to stay collapsed
 * (`nextCollapsed`), and this is the slab's half of that sum: the beverage row,
 * the name and the band kept for the watermark. A deliberate overestimate, so
 * it assumes the largest text size, three lines at the largest step, the
 * untightened gaps and the whole band.
 *
 * `photo` is true when the header draws a picture. The name's row is narrower
 * then and even a short name may take the long layout, so it is counted as
 * one. The picture itself is out of the flow and never taller than the name
 * block, so it adds nothing here.
 */
export function heroFoldAway(name: string, photo = false): number {
    const beverageRow = 7 + 24;
    if (name.length <= HERO_NAME_LONG && !photo) {
        return Math.ceil(beverageRow + 7 + 2 * 31 * DOTO_MAX_FONT_SCALE);
    }
    const nameBlock = 7 + HERO_NAME_MAX_LINES * HERO_NAME_STEPS[0].lineHeight * DOTO_MAX_FONT_SCALE;
    return Math.ceil(beverageRow + nameBlock + HERO_PROFILE_RESERVE);
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
    const {width, fontScale} = useWindowDimensions();
    const picture = showPicture ? imageURL ?? "" : "";
    // The name is sized for the row the picture leaves it, so a long name is
    // never estimated into the corner the picture covers.
    const nameLayout = heroNameLayout(name, width, fontScale, {
        pours, photoReserve: picture.length > 0 ? HERO_PHOTO_RESERVE : 0
    });

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
                    <PourProfile pours={pours} width={PROFILE_WIDTH}
                                 height={nameLayout.profileHeight}
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
                {/* Only in the open slab. Folded, the chrome row is a title bar
                    and a thumbnail there would be one more thing to squeeze the
                    name against. Top aligned with the beverage row, which is
                    where the content starts, and moves up with it when a long
                    name closes up that gap. */}
                {picture.length > 0 && (
                    <View pointerEvents="none"
                          style={{position: "absolute", top: nameLayout.tight ? 3 : 8, right: 0}}>
                        <RecipePhoto testID="hero-photo" uri={picture}
                                     size={HERO_PHOTO_SIZE} radius={10}/>
                    </View>
                )}

                {/* A name with the watermark's band under it closes up the gap
                    under the chrome row, the one place the slab has room. */}
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
                           style={{
                               flexDirection: "row", alignItems: "flex-start", gap: 8,
                               marginRight: picture.length > 0 ? HERO_PHOTO_RESERVE : 0
                           }}
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
