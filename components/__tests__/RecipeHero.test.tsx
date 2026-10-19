import React from "react";
import {runInNewContext} from "node:vm";
import {Dimensions, StyleSheet} from "react-native";
import {fireEvent, screen} from "@testing-library/react-native";

import RecipeHero, {
    estimateLines, HERO_NAME_LONG, HERO_NAME_MAX_LINES, HERO_PHOTO_RESERVE, HERO_PHOTO_SIZE,
    HERO_PHOTO_SIZES,
    HERO_PROFILE_RESERVE, heroFoldAway, heroNameLayout, PROFILE_BAND_HEIGHT, wordsFit, wrapLines
} from "@/components/RecipeHero";
import {COLLAPSE_SHRINK} from "@/hooks/useCollapsibleHeader";
import {onAccent} from "@/constants/colors";
import Pour from "@/library/Pour";
import {renderWithProviders, TEST_INSETS} from "@/test-utils/render";

function pours(...volumes: number[]): Pour[] {
    return volumes.map((volume, index) => new Pour(index + 1, volume));
}

const BASE = {
    name:     "Ethiopia Guji",
    named:    true,
    xid:      "AB12CD",
    accent:   "#F0B98E",
    beverage: "COFFEE" as const,
    pours:    pours(96, 96, 96),
    collapsed: false,
    onBack:    () => {},
    onMore:    () => {},
    onHelp:    () => {},
    onRename:  () => {}
};

/** The shape of name a roaster's import link brings, 78 characters. */
const LONG_NAME =
    "Colombia | Las Flores | Jhoan Vergara | Chiroso Natural Signature Series - 18g";

/** The name from the device report: 77 characters, cut off after "Sidra". */
const VINKA =
    "Ecuador | Vinka Farm | Carlos & Maria Fernanda | 2025 Sidra Natural Anaerobic";

/** About as long as a roaster's names run: 91 characters. */
const LONGEST =
    "Colombia | Finca El Paraiso | Diego Samuel Bermudez | Lychee Double Anaerobic Thermal Shock";

/** The name in the second device report: 98 characters, four lines at 18. */
const AWARD =
    "Ecuador | Vinka Farm | Carlos & Maria Fernanda | 2024 Sidra Washed Anaerobic **AWARD WINNER** - 18g";

/** A name that fits three lines at the largest long-name step: 44 characters. */
const MEDIUM_NAME = "Kenya | Gichathaini AA | Washed SL28 and SL34";

/** Phones the name has to fit, in points: narrow, the Fold cover, the Fold inner. */
const NARROW = 360;
const COVER = 412;
const INNER = 900;

function setWindow(width: number, fontScale = 1): void {
    const window = {width, height: 900, scale: 2.6, fontScale};
    Dimensions.set({window, screen: window});
}

type Node = ReturnType<typeof screen.getByTestId>;

/** How many nodes at or under this one respond to a touch. */
function touchables(node: Node): number {
    const self = node.props?.onStartShouldSetResponder === undefined ? 0 : 1;
    return node.children.reduce<number>(
        (count, child) => count + (typeof child === "string" ? 0 : touchables(child)),
        self
    );
}

describe("RecipeHero", () => {
    beforeEach(() => {
        setWindow(COVER);
    });

    it.each([257, 258, 259, 260])("finishes long-name layout at the %i pt column boundary", width => {
        for (const photo of [false, true]) {
            // Bound the original synchronous loop so a regression cannot hang Jest.
            const layout = runInNewContext("layout(name, width, 1, {photo})", {
                layout: heroNameLayout, name: LONG_NAME, width, photo
            }, {timeout: 100});
            expect(layout.tight).toBe(true);
            expect(layout.maxWidth).toBeGreaterThan(0);
            expect(layout.reserve).toBeGreaterThanOrEqual(0);
        }
    });

    it("makes the name a rename button, with a pencil beside it", async () => {
        // Nothing hidden: a title that merely happens to be tappable is a
        // feature nobody finds. The name announces itself as a button and says
        // what tapping it does.
        const onRename = jest.fn();
        await renderWithProviders(<RecipeHero {...BASE} onRename={onRename}/>);

        const title = screen.getByTestId("hero-rename");
        expect(title.props.accessibilityRole).toBe("button");
        expect(title.props.accessibilityLabel).toBe("Ethiopia Guji");

        await fireEvent.press(title);
        expect(onRename).toHaveBeenCalledTimes(1);
    });

    it("keeps the rename button once the slab has folded away", async () => {
        // Renaming has to be reachable from every scroll position, not only
        // from the top of the screen.
        const onRename = jest.fn();
        await renderWithProviders(
            <RecipeHero {...BASE} collapsed onRename={onRename}/>
        );

        await fireEvent.press(screen.getByTestId("hero-rename-collapsed"));

        expect(onRename).toHaveBeenCalledTimes(1);
    });

    it("offers a placeholder name as a button too", async () => {
        // New recipe is the title every recipe starts with, so it is the one a
        // person most wants to tap.
        const onRename = jest.fn();
        await renderWithProviders(
            <RecipeHero {...BASE} name="New recipe" named={false} onRename={onRename}/>
        );

        await fireEvent.press(screen.getByTestId("hero-rename"));

        expect(onRename).toHaveBeenCalledTimes(1);
    });

    it("shows the name, the beverage and the id", async () => {
        await renderWithProviders(<RecipeHero {...BASE}/>);

        expect(screen.getByText("Ethiopia Guji")).toBeTruthy();
        expect(screen.getByText("COFFEE")).toBeTruthy();
        expect(screen.getByText("AB12CD")).toBeTruthy();
    });

    it("draws a name the user did not choose in a quieter colour", async () => {
        await renderWithProviders(<RecipeHero {...BASE} name="Read · 3 May" named={false}/>);

        expect(screen.getByText("Read · 3 May").props.style)
            .toEqual(expect.objectContaining({color: onAccent.label}));
    });

    it("draws a name the user did choose at full strength", async () => {
        await renderWithProviders(<RecipeHero {...BASE}/>);

        expect(screen.getByText("Ethiopia Guji").props.style)
            .toEqual(expect.objectContaining({color: onAccent.text}));
    });

    it("leaves the id out when the recipe has none", async () => {
        await renderWithProviders(<RecipeHero {...BASE} xid=""/>);

        expect(screen.queryByTestId("hero-xid")).toBeNull();
    });

    it("is the screen's navigation and its name, and nothing else is tappable", async () => {
        await renderWithProviders(<RecipeHero {...BASE}/>);

        // Counted by the handler rather than by role. A bare Pressable declares
        // no accessibility role, so a query for buttons stays empty however
        // tappable the hero has quietly become; every touchable does set a
        // responder on its host view. Four: back, help, more and the name.
        // Everything else on the slab is still a picture — every value on it is
        // edited in the deck below.
        expect(touchables(screen.getByTestId("recipe-hero"))).toBe(4);
        expect(screen.getByTestId("recipe-hero").props.accessibilityRole)
            .not.toBe("button");
    });

    it("goes back, opens help, and opens the overflow", async () => {
        const onBack = jest.fn();
        const onMore = jest.fn();
        const onHelp = jest.fn();
        await renderWithProviders(
            <RecipeHero {...BASE} onBack={onBack} onMore={onMore} onHelp={onHelp}/>
        );

        await fireEvent.press(screen.getByLabelText("Back"));
        await fireEvent.press(screen.getByLabelText("Help"));
        await fireEvent.press(screen.getByLabelText("More"));

        expect(onBack).toHaveBeenCalledTimes(1);
        expect(onHelp).toHaveBeenCalledTimes(1);
        expect(onMore).toHaveBeenCalledTimes(1);
    });

    it("keeps help in the chrome row, where it can be reached from any deck", async () => {
        // Not behind the caret with the recipe operations: help is what the
        // one-line hints point at, and it is wanted from where the reader is
        // stuck rather than from a menu of things to do to the recipe.
        await renderWithProviders(<RecipeHero {...BASE}/>);

        expect(screen.getByText("HELP")).toBeTruthy();
    });

    it("draws help as a well in the accent, like the buttons beside it", async () => {
        // Unfilled it read as a caption rather than a control, and sat quieter
        // than the two dot-matrix buttons it shares the row with. The filled
        // well is what the EXPLAIN toggle wore when it was on.
        await renderWithProviders(<RecipeHero {...BASE}/>);

        // Accent-on-key, the same inversion the back and overflow buttons use:
        // the label takes the slab's colour because the well behind it is
        // filled.
        expect(StyleSheet.flatten(screen.getByText("HELP").props.style))
            .toEqual(expect.objectContaining({color: BASE.accent}));
    });

    it("carries the name in its chrome row once collapsed", async () => {
        await renderWithProviders(<RecipeHero {...BASE} collapsed/>);

        // The folded-away slab keeps its own copy mounted so it has something
        // to animate back to, but `Collapsible` hides it from the screen
        // reader while it is closed — so only the chrome row's copy is
        // reachable, and it is the small one.
        const found = screen.getAllByText("Ethiopia Guji");
        expect(found).toHaveLength(1);
        expect(found[0].props.style).toEqual(expect.objectContaining({fontSize: 15}));
    });

    it("keeps the chrome row empty of the name while the slab is open", async () => {
        await renderWithProviders(<RecipeHero {...BASE}/>);

        // Only the slab's own headline, at its own size. A second copy of the
        // name in the chrome row while the slab is open would be the title bar
        // this header was built to get rid of.
        const found = screen.getAllByText("Ethiopia Guji");
        expect(found).toHaveLength(1);
        expect(found[0].props.style).toEqual(expect.objectContaining({fontSize: 26}));
    });

    it("keeps a short name exactly as it was: two lines at 26", async () => {
        await renderWithProviders(<RecipeHero {...BASE}/>);

        const title = screen.getByTestId("hero-name");
        expect(title.props.numberOfLines).toBe(2);
        expect(StyleSheet.flatten(title.props.style))
            .toEqual(expect.objectContaining({fontSize: 26, lineHeight: 31}));
    });

    it("caps a long name at three lines, sized down a step until it fits", async () => {
        // The device report's name on a 360 point phone at 1.15x text. Three
        // lines at 22 or 20 would cut it; 18 holds it.
        setWindow(NARROW, 1.15);
        await renderWithProviders(<RecipeHero {...BASE} name={VINKA}/>);

        const title = screen.getByTestId("hero-name");
        expect(title.props.numberOfLines).toBe(HERO_NAME_MAX_LINES);
        expect(StyleSheet.flatten(title.props.style))
            .toEqual(expect.objectContaining({fontSize: 18, lineHeight: 23}));
        // Never a shrink-to-fit: the size is a step on the scale, not
        // whatever the text engine settles on.
        expect(title.props.adjustsFontSizeToFit).toBeFalsy();
        // The whole name is still the button's label, however much is drawn.
        expect(screen.getByTestId("hero-rename").props.accessibilityLabel).toBe(VINKA);
        expect(screen.getByText(VINKA)).toBeTruthy();
    });

    it("keeps a medium name at 22, the largest long-name step", () => {
        const layout = heroNameLayout(MEDIUM_NAME, NARROW, 1);
        expect(layout.fontSize).toBe(22);
        expect(estimateLines(MEDIUM_NAME, layout.maxWidth as number, 22))
            .toBeLessThanOrEqual(HERO_NAME_MAX_LINES);
    });

    it("picks these sizes for the reported names on 360 and 412 point phones", () => {
        // Rows are text sizes 1, 1.15 and 1.4; columns are 360 and 412 points.
        const sizes = (name: string) => [1, 1.15, 1.4].map((scale) =>
            [NARROW, COVER].map((width) => heroNameLayout(name, width, scale).fontSize));
        expect(sizes(VINKA)).toEqual([[22, 22], [18, 22], [16, 18]]);
        expect(sizes(LONGEST)).toEqual([[18, 22], [16, 20], [15, 16]]);
        expect(sizes(AWARD)).toEqual([[16, 20], [15, 18], [15, 15]]);
    });

    it("fits each reported name in three lines unless the floor cannot", () => {
        for (const name of [VINKA, LONGEST, AWARD]) {
            for (const width of [NARROW, COVER]) {
                for (const scale of [1, 1.15]) {
                    const layout = heroNameLayout(name, width, scale);
                    expect(estimateLines(name, (layout.maxWidth as number) - 4, layout.fontSize * scale))
                        .toBeLessThanOrEqual(HERO_NAME_MAX_LINES);
                }
            }
        }
    });

    it("wraps the second device report's name exactly where the phone did", () => {
        // Calibration. On the Fold's cover screen (about 360 points, text 1x)
        // the 18 pt name broke after "Carlos &", "Washed" and "-", and the
        // three full lines measured 255, 298 and 266 points.
        const lines = wrapLines(AWARD, NARROW - 36 - 23 - 4, 18).map(Math.round);
        expect(lines).toHaveLength(4);
        expect(lines.slice(0, 3)).toEqual([253, 296, 265]);
    });

    it("keeps a long name off the watermark on a phone with a band under it", async () => {
        // The column beside the pour profile is about 150 points on the cover
        // screen, far too narrow, so the name takes the full width and the
        // profile, drawn lower, gets a band underneath.
        await renderWithProviders(<RecipeHero {...BASE} name={AWARD}/>);

        const reserve = screen.getByTestId("hero-profile-reserve").props.style.height;
        expect(reserve).toBeGreaterThan(0);
        expect(reserve).toBeLessThanOrEqual(HERO_PROFILE_RESERVE);
        expect(StyleSheet.flatten(screen.getByTestId("hero-name").props.style))
            .toEqual(expect.objectContaining({maxWidth: COVER - 36 - 23}));
    });

    it("keeps the band small: the lower watermark less the slab's padding", () => {
        // 74 tall, the band was 64 and the header took a third of the screen.
        expect(HERO_PROFILE_RESERVE)
            .toBeGreaterThanOrEqual(PROFILE_BAND_HEIGHT + 1.6 - 0.8 - 2 - 13);
        expect(HERO_PROFILE_RESERVE).toBeLessThanOrEqual(42);
    });

    it("lets the watermark rise beside a short last line", () => {
        // "...SL28 and SL34" style endings: a last line that ends before the
        // watermark begins does not need the band's height kept under it.
        const name = "Ethiopia | Hambela Wamena | Natural G1 | Hand Picked By Ayele Tulu Family 18g";
        const layout = heroNameLayout(name, NARROW, 1);
        const lines = wrapLines(name, layout.maxWidth as number, layout.fontSize);
        const last = lines[lines.length - 1];
        if (last <= NARROW - 18 - 189 - 8) {
            expect(layout.reserve).toBeLessThan(HERO_PROFILE_RESERVE);
        } else {
            expect(layout.reserve).toBe(HERO_PROFILE_RESERVE);
        }
    });

    it("keeps the band only as tall as the watermark stands under the name", () => {
        // The device report: a 98 character name over a profile that climbs
        // from a small bloom. Its last line stops over the profile's low end,
        // so the band need not be the watermark's full height.
        const bloom = pours(40, 120, 128);
        const plain = heroNameLayout(AWARD, NARROW, 1);
        const shaped = heroNameLayout(AWARD, NARROW, 1, {pours: bloom});
        expect(plain.reserve).toBe(HERO_PROFILE_RESERVE);
        expect(shaped.fontSize).toBe(plain.fontSize);
        expect(shaped.reserve).toBeLessThan(plain.reserve);
        // Never below what the line over the profile's high end needs: a full
        // width last line still gets the whole band.
        const flat = heroNameLayout(AWARD, NARROW, 1, {pours: pours(0, 0, 288)});
        expect(flat.reserve).toBeLessThanOrEqual(HERO_PROFILE_RESERVE);
    });

    it("keeps every line clear of the watermark it is drawn over", () => {
        for (const name of [LONG_NAME, VINKA, LONGEST, AWARD]) {
            for (const shape of [[96, 96, 96], [40, 120, 128], [150, 50, 50, 38], [288]]) {
                const profile = pours(...shape);
                const total = shape.reduce((sum, volume) => sum + volume, 0);
                const layout = heroNameLayout(name, NARROW, 1, {pours: profile});
                if (layout.reserve === 0 && !layout.tight) {
                    continue;
                }
                const lines = wrapLines(name, (layout.maxWidth as number) - 4, layout.fontSize)
                    .slice(0, HERO_NAME_MAX_LINES);
                lines.forEach((width, i) => {
                    // The watermark's drawing x under the line's end, its gap
                    // included, and its height there.
                    const along = 18 + width + 4 + 8 - (NARROW - 188.8) - 0.8;
                    let height = 0;
                    let before = 0;
                    shape.forEach((volume, k) => {
                        const after = before + volume / total;
                        const start = (k / shape.length) * 190;
                        const top = ((k + 0.62) / shape.length) * 190;
                        if (along >= top) {
                            height = after * PROFILE_BAND_HEIGHT;
                        } else if (along > start) {
                            height = Math.max(height, (before + (after - before)
                                * (along - start) / (top - start)) * PROFILE_BAND_HEIGHT);
                        }
                        before = after;
                    });
                    const stands = height > 0 ? height - 1.2 : 0;
                    const lineBottom = 13 + layout.reserve
                        + (lines.length - 1 - i) * layout.lineHeight;
                    expect(lineBottom).toBeGreaterThanOrEqual(stands + 4);
                });
            }
        }
    });

    it("sizes the band for the recipe's own pours", async () => {
        const bloom = pours(40, 120, 128);
        await renderWithProviders(<RecipeHero {...BASE} name={AWARD} pours={bloom}/>);

        expect(screen.getByTestId("hero-profile-reserve").props.style.height)
            .toBe(heroNameLayout(AWARD, COVER, 1, {pours: bloom}).reserve);
    });

    it("puts a long name beside the watermark where the screen is wide enough", async () => {
        setWindow(INNER);
        await renderWithProviders(<RecipeHero {...BASE} name={VINKA}/>);

        expect(screen.queryByTestId("hero-profile-reserve")).toBeNull();
        const maxWidth = StyleSheet.flatten(screen.getByTestId("hero-name").props.style).maxWidth;
        // Ends, pencil and all, before the watermark's 189 points of the
        // slab's right edge.
        expect(maxWidth + 23).toBeLessThanOrEqual(INNER - 18 - 189 - 8);
    });

    it("breaks lines the simple way the estimate counts them", async () => {
        await renderWithProviders(<RecipeHero {...BASE} name={VINKA}/>);

        expect(screen.getByTestId("hero-name").props.textBreakStrategy).toBe("simple");
    });

    it("closes up the gap under the chrome row when the band is used", async () => {
        await renderWithProviders(<RecipeHero {...BASE} name={AWARD}/>);
        expect(StyleSheet.flatten(screen.getByTestId("hero-name").props.style).marginTop)
            .toBeLessThan(7);
        // COFFEE stays.
        expect(screen.getByText("COFFEE")).toBeTruthy();
    });

    it("keeps a short name's slab exactly as it was, with no reserve", async () => {
        await renderWithProviders(<RecipeHero {...BASE}/>);

        expect(screen.queryByTestId("hero-profile-reserve")).toBeNull();
        expect(StyleSheet.flatten(screen.getByTestId("hero-name").props.style))
            .toEqual(expect.objectContaining({maxWidth: "72%", marginTop: 7}));
    });

    it("gives the folded bar's name a second line", async () => {
        await renderWithProviders(<RecipeHero {...BASE} name={LONG_NAME} collapsed/>);

        const title = screen.getByTestId("hero-name-collapsed");
        expect(title.props.numberOfLines).toBe(2);
        expect(StyleSheet.flatten(title.props.style))
            .toEqual(expect.objectContaining({fontSize: 15}));
    });

    it("steps down only past the long-name threshold", () => {
        expect(heroNameLayout("x".repeat(HERO_NAME_LONG), NARROW))
            .toEqual(expect.objectContaining({fontSize: 26, lineHeight: 31, lines: 2}));
        expect(heroNameLayout("x ".repeat(15).trim(), NARROW))
            .toEqual(expect.objectContaining({fontSize: 22, lineHeight: 27, lines: 3}));
    });

    it("never leaves a long name across the watermark", () => {
        // Either the column stops short of the watermark, or a band under the
        // name holds it. Checked across the widths the app runs at.
        for (const name of [MEDIUM_NAME, LONG_NAME, VINKA, LONGEST, AWARD]) {
            for (const width of [NARROW, COVER, 600, INNER]) {
                for (const fontScale of [1, 1.15, 1.4]) {
                    const layout = heroNameLayout(name, width, fontScale);
                    expect(layout.lines).toBe(HERO_NAME_MAX_LINES);
                    const beside = (layout.maxWidth as number) + 23 <= width - 18 - 189 - 8;
                    if (beside) {
                        expect(layout.reserve).toBe(0);
                    } else {
                        expect(layout.profileHeight).toBe(PROFILE_BAND_HEIGHT);
                        // Lines left out of the band all end before the
                        // watermark begins.
                        const lines = wrapLines(
                            name, (layout.maxWidth as number) - 4,
                            layout.fontSize * Math.min(fontScale, 1.4)
                        ).slice(0, HERO_NAME_MAX_LINES);
                        const freed = Math.round(
                            (HERO_PROFILE_RESERVE - layout.reserve)
                            / (layout.lineHeight * Math.min(fontScale, 1.4))
                        );
                        for (const line of lines.slice(lines.length - freed)) {
                            expect(line).toBeLessThanOrEqual(width - 18 - 189 - 8);
                        }
                    }
                }
            }
        }
    });

    it("counts a word too long for a line as several", () => {
        expect(estimateLines("x".repeat(25), 100, 20)).toBe(3);
        expect(estimateLines("ab cd", 100, 20)).toBe(1);
        expect(estimateLines("abcdefgh hijk", 100, 20)).toBe(2);
    });

    it("tells the editor how much a collapse folds away, more for a longer name", () => {
        const short = heroFoldAway("Ethiopia Guji");
        const long = heroFoldAway(AWARD);
        expect(short).toBeLessThan(long);
        // Three 27 pt lines at the largest text size, the beverage row and the
        // band under the name: well past the home screen's figure.
        expect(long).toBeGreaterThanOrEqual(3 * 27 * 1.4 + HERO_PROFILE_RESERVE + 24);
        expect(long).toBeGreaterThan(COLLAPSE_SHRINK);
    });

    it("carries no EXPLAIN toggle", async () => {
        // The hero once carried an EXPLAIN toggle that unfolded every note on
        // the screen at once. The long form is one sheet now, opened from the
        // HELP button that took the toggle's place.
        await renderWithProviders(<RecipeHero {...BASE}/>);

        expect(screen.queryByLabelText("Explain")).toBeNull();
    });

    it("runs up behind the status bar", async () => {
        // The accent slab is the top of the screen, not a card below it. When
        // the app was inset as a whole this began under the notch and left a
        // black strip above it.
        await renderWithProviders(<RecipeHero {...BASE}/>);
        const style = screen.getByTestId("recipe-hero").props.style;

        expect(style.paddingTop).toBeGreaterThanOrEqual(TEST_INSETS.top);
    });
});


describe("RecipeHero's picture", () => {
    const PHOTO = "https://example.com/bag.jpg";

    beforeEach(() => {
        setWindow(COVER);
    });

    /** The room the name's row leaves on its right for the picture. */
    function nameReserve(): number {
        const style = StyleSheet.flatten(screen.getByTestId("hero-name-row").props.style);
        return (style?.marginRight as number | undefined) ?? 0;
    }

    function photo() {
        return screen.queryByTestId("hero-photo", {includeHiddenElements: true});
    }

    it("draws the picture when the setting is on and the recipe has one", async () => {
        await renderWithProviders(<RecipeHero {...BASE} imageURL={PHOTO} showPicture/>);

        expect(photo()?.props.source).toEqual({uri: PHOTO});
        const style = StyleSheet.flatten(photo()?.props.style);
        expect(style.width).toBe(HERO_PHOTO_SIZE);
        expect(style.height).toBe(HERO_PHOTO_SIZE);
        expect(nameReserve()).toBe(HERO_PHOTO_RESERVE);
    });

    it("is one button, Coffee photo, with the image itself kept quiet", async () => {
        await renderWithProviders(<RecipeHero {...BASE} imageURL={PHOTO} showPicture/>);

        expect(photo()?.props.accessible).toBe(false);
        expect(photo()?.props.importantForAccessibility).toBe("no");
        expect(screen.getByRole("imagebutton", {name: "Coffee photo"})).toBeTruthy();
    });

    it("draws the whole picture rather than cropping it", async () => {
        await renderWithProviders(<RecipeHero {...BASE} imageURL={PHOTO} showPicture/>);
        expect(photo()?.props.resizeMode).toBe("contain");
    });

    it("opens the photo full screen, not the rename sheet, and closes it", async () => {
        const onRename = jest.fn();
        await renderWithProviders(
            <RecipeHero {...BASE} imageURL={PHOTO} showPicture onRename={onRename}/>
        );
        expect(screen.queryByTestId("photo-viewer")).toBeNull();

        await fireEvent.press(screen.getByRole("imagebutton", {name: "Coffee photo"}));

        expect(onRename).not.toHaveBeenCalled();
        expect(screen.getByTestId("photo-viewer-image").props.source).toEqual({uri: PHOTO});
        expect(screen.getByTestId("photo-viewer-image").props.resizeMode).toBe("contain");

        await fireEvent.press(screen.getByTestId("photo-viewer-close"));
        expect(screen.queryByTestId("photo-viewer")).toBeNull();

        // A tap on the backdrop closes it too.
        await fireEvent.press(screen.getByRole("imagebutton", {name: "Coffee photo"}));
        await fireEvent.press(screen.getByTestId("photo-viewer-backdrop"));
        expect(screen.queryByTestId("photo-viewer")).toBeNull();
        expect(onRename).not.toHaveBeenCalled();
    });

    it("still renames from the name and the pencil when there is a photo", async () => {
        const onRename = jest.fn();
        await renderWithProviders(
            <RecipeHero {...BASE} imageURL={PHOTO} showPicture onRename={onRename}/>
        );
        await fireEvent.press(screen.getByTestId("hero-rename"));
        expect(onRename).toHaveBeenCalledTimes(1);
        expect(screen.queryByTestId("photo-viewer")).toBeNull();
    });

    it("draws no picture and keeps no room while the setting is off", async () => {
        await renderWithProviders(<RecipeHero {...BASE} imageURL={PHOTO}/>);

        expect(photo()).toBeNull();
        expect(nameReserve()).toBe(0);
    });

    it("draws no picture for a recipe without one", async () => {
        await renderWithProviders(<RecipeHero {...BASE} showPicture/>);

        expect(photo()).toBeNull();
        expect(nameReserve()).toBe(0);
    });

    it("drops a picture that will not load without moving the name", async () => {
        // A failed load looks like no picture at all, but the room it was given
        // stays: taking it back would rewrap the name after the screen opened.
        await renderWithProviders(<RecipeHero {...BASE} imageURL={PHOTO} showPicture/>);

        await fireEvent(photo()!, "error");

        expect(photo()).toBeNull();
        expect(nameReserve()).toBe(HERO_PHOTO_RESERVE);
        expect(screen.getByText("Ethiopia Guji")).toBeTruthy();
    });

    /** Where the picture ends, below the top of the name's first line. */
    function foot(size: number): number {
        return 3 + size - 19;
    }

    it("fits the device report's 98 character name in three lines beside the picture", () => {
        // The Fold's cover screen, 360 points. Narrowing every line for the
        // picture left 233 points, where this name takes four lines even at
        // 15 and was cut off after "**AWARD WIN".
        expect(estimateLines(AWARD, NARROW - 36 - 23 - HERO_PHOTO_RESERVE - 4, 15))
            .toBeGreaterThan(HERO_NAME_MAX_LINES);
        for (const [fontScale, size] of [[1, 18], [1.15, 16]]) {
            const layout = heroNameLayout(AWARD, NARROW, fontScale, {photo: true});
            expect(layout.fontSize).toBe(size);
            expect(layout.photoSize).toBe(40);
            const split = layout.split!;
            expect(`${split.head} ${split.tail}`).toBe(AWARD);
            const fontSize = layout.fontSize * fontScale;
            const tailLines = estimateLines(split.tail, (layout.maxWidth as number) - 4, fontSize);
            expect(split.headLines + tailLines).toBeLessThanOrEqual(HERO_NAME_MAX_LINES);
        }
    });

    it("never runs a long name under the picture", () => {
        for (const name of [MEDIUM_NAME, LONG_NAME, VINKA, LONGEST, AWARD]) {
            for (const width of [NARROW, COVER, 600, INNER]) {
                for (const fontScale of [1, 1.15, 1.4]) {
                    const layout = heroNameLayout(name, width, fontScale, {photo: true});
                    const lineHeight = layout.lineHeight * Math.min(fontScale, 1.4);
                    const fontSize = layout.fontSize * Math.min(fontScale, 1.4);
                    expect(HERO_PHOTO_SIZES).toContain(layout.photoSize);
                    if (layout.split === undefined) {
                        // Beside the watermark: that column ends well before
                        // the picture's corner.
                        expect(layout.tight).toBe(false);
                        expect((layout.maxWidth as number) + 23)
                            .toBeLessThanOrEqual(width - 36 - HERO_PHOTO_RESERVE);
                        continue;
                    }
                    const {head, headLines, headWidth, tail} = layout.split;
                    // The head and the pencil stop short of the picture.
                    expect(headWidth + 23 + layout.photoSize + 8).toBeLessThanOrEqual(width - 36);
                    expect(estimateLines(head, headWidth - 4, fontSize)).toBe(headLines);
                    // The full-width lines start below the picture's foot,
                    // give or take the line box's top leading.
                    expect(headLines * lineHeight).toBeGreaterThanOrEqual(foot(layout.photoSize) - 2);
                    // And the lines over the picture are all the head needs.
                    expect((headLines - 1) * lineHeight).toBeLessThan(foot(layout.photoSize));
                    const tailLines = tail === ""
                        ? 0
                        : estimateLines(tail, (layout.maxWidth as number) - 4, fontSize);
                    if (layout.fontSize > 15) {
                        expect(headLines + tailLines).toBeLessThanOrEqual(HERO_NAME_MAX_LINES);
                    }
                }
            }
        }
    });

    it("keeps the watermark under the picture as well as under the name", () => {
        for (const name of [MEDIUM_NAME, LONG_NAME, VINKA, LONGEST, AWARD]) {
            for (const width of [NARROW, COVER]) {
                for (const fontScale of [1, 1.15, 1.4]) {
                    const layout = heroNameLayout(name, width, fontScale, {photo: true});
                    if (layout.split === undefined) {
                        continue;
                    }
                    const lineHeight = layout.lineHeight * Math.min(fontScale, 1.4);
                    // How far above the slab's bottom edge the picture ends:
                    // above the watermark's highest point, plus air.
                    const block = Math.min(HERO_NAME_MAX_LINES,
                        layout.split.headLines + estimateLines(
                            layout.split.tail, (layout.maxWidth as number) - 4,
                            layout.fontSize * Math.min(fontScale, 1.4)
                        ));
                    const above = 13 + layout.reserve + block * lineHeight - foot(layout.photoSize);
                    expect(above).toBeGreaterThanOrEqual(PROFILE_BAND_HEIGHT - 1.2 + 4);
                }
            }
        }
    });

    it("draws the head beside the picture and the rest of the name under it", async () => {
        setWindow(NARROW);
        await renderWithProviders(
            <RecipeHero {...BASE} name={AWARD} imageURL={PHOTO} showPicture/>
        );
        const layout = heroNameLayout(AWARD, NARROW, 1, {pours: BASE.pours, photo: true});
        const split = layout.split!;

        const head = screen.getByTestId("hero-name");
        const rest = screen.getByTestId("hero-name-rest");
        expect(head.props.children).toBe(split.head);
        expect(rest.props.children).toBe(split.tail);
        expect(StyleSheet.flatten(head.props.style))
            .toEqual(expect.objectContaining({fontSize: 18, maxWidth: split.headWidth}));
        expect(StyleSheet.flatten(rest.props.style))
            .toEqual(expect.objectContaining({fontSize: 18, maxWidth: NARROW - 36}));
        expect(rest.props.numberOfLines).toBe(HERO_NAME_MAX_LINES - split.headLines);
        expect(nameReserve()).toBe(40 + 8);
        const style = StyleSheet.flatten(photo()?.props.style);
        expect(style.width).toBe(40);
        expect(screen.getByTestId("hero-profile-reserve").props.style.height)
            .toBe(layout.reserve);
        // One button, read as the whole name.
        expect(screen.getByLabelText(AWARD)).toBeTruthy();
    });

    it("keeps the full-size picture beside a name that fits at the largest step", () => {
        const layout = heroNameLayout(MEDIUM_NAME, COVER, 1, {photo: true});
        expect(layout.fontSize).toBe(22);
        expect(layout.photoSize).toBe(HERO_PHOTO_SIZE);
    });

    it("keeps the wide screen's column beside the watermark as it was", () => {
        // That column ends left of the watermark, well before the picture's
        // corner, so the picture takes nothing from it.
        expect(heroNameLayout(VINKA, INNER, 1, {photo: true}))
            .toEqual({...heroNameLayout(VINKA, INNER, 1), photoSize: HERO_PHOTO_SIZE});
    });

    it("moves a short name that no longer fits two lines to the long layout", () => {
        const name = "Ethiopia Guji Hambela Wamena";
        expect(name.length).toBeLessThanOrEqual(HERO_NAME_LONG);
        expect(heroNameLayout(name, NARROW, 1).fontSize).toBe(26);
        const layout = heroNameLayout(name, NARROW, 1, {photo: true});
        // Beside and under the picture, in the long layout's three lines.
        expect(layout.fontSize).toBeLessThanOrEqual(26);
        expect(layout.lines).toBe(HERO_NAME_MAX_LINES);
        expect(layout.split).toBeDefined();
        // A short name keeps its 26 pt, but beside and under the picture
        // rather than in a share of the slab the picture also narrows.
        expect(heroNameLayout("Ethiopia Guji", NARROW, 1, {photo: true}))
            .toEqual(expect.objectContaining({fontSize: 26, photoSize: HERO_PHOTO_SIZE}));
        expect(heroNameLayout("Ethiopia Guji", NARROW, 1, {photo: true}).split?.head)
            .toBe("Ethiopia Guji");
        // The collapse counts any name as long while a picture is drawn.
        expect(heroFoldAway("Ethiopia Guji", true)).toBe(heroFoldAway(AWARD));
        expect(heroFoldAway("Ethiopia Guji", true)).toBeGreaterThan(heroFoldAway("Ethiopia Guji"));
    });

    it("never splits a word of a short name beside the picture (device report)", () => {
        // The Fold cover screen drew "col Java / hydrohon / ey -18g".
        const name = "col Java hydrohoney -18g";
        for (const width of [NARROW, COVER]) {
            for (const scale of [1, 1.15, 1.3]) {
                const layout = heroNameLayout(name, width, scale, {photo: true});
                const size = layout.fontSize * scale;
                if (layout.split !== undefined) {
                    expect(wordsFit(layout.split.head, layout.split.headWidth, size)).toBe(true);
                    expect(wordsFit(layout.split.tail, width - 32, size)).toBe(true);
                } else {
                    expect(typeof layout.maxWidth).toBe("number");
                    expect(wordsFit(name, layout.maxWidth as number, size)).toBe(true);
                }
            }
        }
        // And on the slab's widest screens the name still gets 26 pt.
        expect(heroNameLayout(name, COVER, 1, {photo: true}).fontSize).toBe(26);
    });

    it("never folds away less than the slab holds with a picture", () => {
        for (const name of [LONG_NAME, VINKA, LONGEST, AWARD]) {
            for (const width of [NARROW, COVER]) {
                const layout = heroNameLayout(name, width, 1.4, {photo: true});
                const block = 19 + HERO_NAME_MAX_LINES * layout.lineHeight * 1.4;
                const slab = Math.max(block, 3 + layout.photoSize) + layout.reserve;
                expect(heroFoldAway(name, true)).toBeGreaterThanOrEqual(slab);
            }
        }
    });
});
