/**
 * Single source of truth for every colour in the app.
 *
 * Canonical exports retain the original appearance. `resolveAppearance` returns
 * explicit presentation roles without changing stored colour identities or any
 * global active state. Colour lives in a plain module rather than in Tamagui
 * theme tokens because roughly half the call sites are plain React Native,
 * expo-router or SVG props that cannot accept
 * a `$token`, and Tamagui's theme proxy has no parent-theme fallback — a custom
 * key added to a theme would not resolve inside a sub-theme such as `dark_Button`.
 *
 * Add semantically named entries (`danger`, `surface`, `muted`), never literal
 * ones (`red`).
 */

import type {AppearanceChoice, ThemeId} from "@/library/appearance";

/** The two halves of the accent palette. */
export type AccentGroup = "coffee" | "tea";

/** Surfaces, text and semantics. */
export const palette = {
    /** No fill at all, as distinct from any fill that happens to match what is
     *  behind it. An unfilled control over `base` and one over `surface` look
     *  identical and are not: the first follows whatever it is placed on. Named
     *  here so the "no colour literals" rule has no exception to argue about. */
    none:    "transparent",
    /** Screen background. `base` rather than `void`: `void` is a reserved word
     *  and cannot be shorthand-destructured. */
    base:    "#000000",
    /** Modal scrim over screen content. */
    scrim:   "rgba(0,0,0,0.62)",
    /** Sheets and elevated panels. */
    surface: "#101010",
    /** CTA tiles, inputs, and cards that are not accent-filled. */
    raised:  "#161616",
    /** Hairlines and borders. */
    line:    "#262626",
    /**
     * The fill of a small control that has to read as tappable.
     *
     * A step above `raised`, because a stepper's buttons sit inside `raised`
     * pills on the stages deck — filled with `raised` they were the same colour
     * as the thing containing them, and a plus that cannot be seen is not a
     * button. One token rather than a per-surface choice: this is light enough
     * to read on `base`, `surface` and `raised` alike.
     */
    control: "#2E2E2E",
    /**
     * Disabled controls and decorative marks.
     *
     * 4.12:1 on `base` — under AA, so this is not a text colour. It reads as the
     * obvious choice for a tertiary annotation and was used for the superscript
     * count until the measurement said otherwise; use `dim` for small text.
     */
    muted:   "#6E6E6E",
    /** Secondary text, including the superscript count. */
    dim:     "#A3A3A3",
    /**
     * Placeholder text in a field the user has not filled in.
     *
     * Its own entry because a placeholder answers to two things at once and
     * neither existing grey satisfies both. `dim` is bright enough that an
     * example set beside white values reads as a value: a blank recipe looked
     * like it already had a pod ID. `muted` is 3.55:1 on `raised`, under the
     * 4.5:1 floor, which is why the note field was moved off it.
     *
     * 4.52:1 on `raised`, 4.75 on `surface` and 5.24 on `base`, so it clears
     * the floor wherever a field is drawn while sitting far enough below `dim`
     * to read as an example rather than an entry. This is the darkest value
     * that still clears AA on the lightest surface it appears over, so there
     * is no headroom left: a placeholder that still reads as input has to be
     * fixed in its words. Call sites help by phrasing theirs as examples
     * ("e.g. CGL12"); the colour is not asked to carry that alone.
     */
    placeholder: "#7F7F7F",
    /** Primary text. */
    text:    "#FFFFFF",

    /**
     * The mark's magenta, sampled from `assets/images/icon.png`.
     *
     * The app icon is a dot-matrix disc with the `++` picked out in this
     * colour, and until now it was the one place the colour existed — every
     * screen dropped it, so the app's own identity stopped at the home screen
     * icon. It is a brand colour rather than a semantic one, so it marks the
     * app being itself (the mark, the wordmark's `++`) and never a state: a
     * user cannot learn it means anything, because it does not. The one
     * exception is a switch that is on (`switchColours`); position carries the
     * state too, so the colour is reinforcement, not the only cue.
     *
     * 5.56:1 on `base`, so it clears AA for body text as well as for graphics.
     */
    brand:   "#FF007F",

    /**
     * The same magenta, deepened until it can carry white ink.
     *
     * `brand` cannot do this job. It is used as *ink* on the two dark
     * surfaces, where it is pinned at 4.5:1 on both `base` and `raised`, and
     * that wants it light; carrying white text wants it dark. The two pull
     * opposite ways and there is no value that does both, because darkening
     * `brand` far enough for white (around #E60074) drops it to 3.98:1 on
     * `raised` and breaks the wordmark. So the fill is a second token rather
     * than a change to the first, which also leaves `brand` exactly the value
     * sampled from the app icon.
     *
     * White lands at 5.36:1 here, within a whisker of the 5.18:1 the black ink
     * measured on `brand`. The tile keeps the ink weight it always had and
     * only inverts it, so nothing about its hierarchy needs re-tuning.
     *
     * Fill only. It is darker than `brand` and so fails as ink on `base`,
     * which is the whole reason both exist.
     */
    brandFill: "#D10069",

    /** Confirmation, and the "reader ready" state. */
    success: "#5DDC8A",
    /** Destructive actions and validation errors. */
    danger:  "#FF6B5E",
    /** Recoverable problems and cautions. */
    warn:    "#F0C24A",
    /**
     * A red that is saying something small.
     *
     * The connection dot when the machine is not there. It is not an error and
     * nothing has gone wrong, so `danger` at 7.52:1 would shout a fault the
     * user does not have; it is also not nothing, which is what the grey it
     * replaced said. Picked to land at 3.99:1 on `base`, within a hair of
     * `muted`'s 4.12:1, so it carries exactly the visual weight of the grey it
     * took over from and differs from it only in hue.
     */
    dangerFaint: "#8A625E",
    /**
     * `success` and `warn`, desaturated.
     *
     * For chrome that has stepped back — today, the connection dot as the
     * header collapses. Each is its original in OKLCH with the chroma
     * multiplied by 0.45 and the lightness and hue left alone, so the
     * transition between the two is a change in saturation and nothing else.
     * That is what reads as receding; dropping opacity instead reads as the
     * glyph being broken.
     *
     * Lightness held means contrast against `base` is held too: 11.7:1 and
     * 12.6:1, against 12.1:1 and 12.5:1 for the originals.
     *
     * `muted` needs no twin. It is already grey.
     */
    successMuted: "#9BCDA8",
    warnMuted:    "#DAC799",
    /** Informational accents. */
    info:    "#7FB4FF"
} as const;

/**
 * Foregrounds drawn on top of an accent fill. Fixed rather than per-accent:
 * every accent is light enough to take the same dark ink.
 */
export const onAccent = {
    /** Recipe names and Doto values. */
    text:          "#0C0C0C",
    /**
     * Micro-labels above values.
     *
     * 0.65 rather than something lighter because these are 11 px: below that
     * alpha the label falls under 4.5:1 against the lighter accents, and it is
     * the only cue to what the number beneath it means. At 0.65 the darkest
     * pairing is 5.1:1.
     */
    label:         "rgba(0,0,0,0.65)",
    /**
     * Pour profile stroke.
     *
     * The profile is a watermark, so this alpha is doing the dimming that used
     * to be a group opacity on the wrapping view. A wrapper multiplied this
     * already-composited value, which put the rendered stroke at 2.72:1 on
     * Blossom while the colour suite measured the token at 8.46:1 and passed.
     * The floor for a non-text graphic is 3:1; 0.50 is the faintest value that
     * clears it on every accent, worst case 3.24:1 on Blossom.
     */
    profileStroke: "rgba(0,0,0,0.50)",
    /** Pour profile fill, when the dot screen is turned off. */
    profileFill:   "rgba(0,0,0,0.15)",
    /**
     * The dots the area under the curve is filled with.
     *
     * Carried a little heavier than the flat wash it replaced: a screen of dots
     * covers less of the area than a solid does, so matching its opacity would
     * have made the fill fainter rather than the same weight in another form.
     */
    profileDot:    "rgba(0,0,0,0.36)",
    /** Beverage marker and contactless mark. */
    marker:        "rgba(0,0,0,0.70)",
    /**
     * The well behind an action glyph on a card.
     *
     * The glyphs used to be drawn straight onto the accent at `marker`, which
     * left them short of contrast on the lighter accents and, worse, gave no
     * suggestion that they were separate pressable objects rather than more
     * card. This punches a dark key into the accent for them to sit in.
     *
     * 0.78 rather than solid black: the accent still shows through, so the key
     * belongs to the card it is cut from. That is also the point at which the
     * delete ink clears 4.5:1 on every accent — a graphic only needs 3:1, so
     * there is real headroom here.
     */
    key:           "rgba(0,0,0,0.78)"
} as const;

/**
 * Foregrounds drawn on `brandFill`, which is the support tile and nothing else.
 *
 * Separate from `onAccent` because it is the other way up. Every recipe accent
 * is light and takes dark ink; `brandFill` is dark and takes white, so none of
 * the alphas in `onAccent` mean anything here and reaching for one would be a
 * silent contrast failure rather than a type error.
 */
export const onBrand = {
    /** Both lines of copy. 5.36:1 on `brandFill`. */
    text:   "#FFFFFF",
    /**
     * The chevron, which is a graphic and so has a 3:1 floor rather than 4.5.
     *
     * 0.80 rather than `onAccent.marker`'s 0.70. White loses contrast against
     * this fill faster than black does, so the alpha that leaves a dark marker
     * comfortable leaves a white one at 3.09:1, a hair over the floor. 0.80 is
     * 3.74:1 and still clearly stepped back from the 5.36:1 copy, so the glyph
     * recedes by eye without sitting on the limit.
     */
    marker: "rgba(255,255,255,0.80)"
} as const;

/**
 * The colours of an on/off switch, by state and by what the switch sits on.
 *
 * On and off have to differ in more than where the thumb is. With the track
 * the same grey both ways, a row of switches cannot be read at a glance, and
 * WCAG 1.4.11 asks the parts that show state to reach 3:1 against what is
 * next to them. So the two states differ three ways at once: the track fills,
 * the ring around it changes, and the thumb brightens.
 *
 * `dark` is every switch on `base`, `surface` or `raised`: settings rows and
 * sheets. On, the track is `brand`, the magenta of the `++`, with a white
 * thumb: 5.04:1 on `surface`, 4.79:1 on `raised`, 3.59:1 against the off
 * track, and 3.78:1 for the thumb on it. `brand` rather than `brandFill`,
 * though the thumb is white: `brandFill` is only 2.53:1 against the off
 * track, so the two states would sit too close. Off, the track stays the
 * quiet `control` grey and a `muted` ring draws its edge, 3.73:1 on `surface`
 * and 3.55:1 on `raised`, with a `dim` thumb that steps back from the white.
 *
 * `accent` is the switch on an Easy Mode slot card, which is filled with a
 * recipe accent. On is a solid `base` track; off is the same outline drawn in
 * `onAccent.text` ink with nothing inside, so the accent shows through. Filled
 * against hollow reads at any size.
 *
 * The off fill is `control` rather than `line` because `line` is for
 * hairlines: on the card's `surface` fill the lighter `control` grey is what
 * tells the switch apart from a divider.
 *
 * `ring` equals `track` when on, so the ring adds no colour there; it exists in
 * both states so the thumb's travel and size do not jump when the state flips.
 * `components/__tests__/colors.test.ts` measures every pairing.
 */
export const switchColours = {
    dark: {
        on:  {track: palette.brand, ring: palette.brand, thumb: palette.text},
        off: {track: palette.control, ring: palette.muted, thumb: palette.dim}
    },
    accent: {
        on:  {track: palette.base, ring: palette.base, thumb: palette.text},
        off: {track: palette.none, ring: onAccent.text, thumb: onAccent.text}
    }
} as const;

/** What a switch is drawn on. See `switchColours`. */
export type SwitchGround = keyof typeof switchColours;

/**
 * Recipe accents, split by beverage. Colour is a redundant signal — a Doto
 * `TEA` / `COFFEE` marker carries the same information — because colour alone is
 * not an accessible signal.
 *
 * Deliberately NOT `as const`. Literal narrowing would type a group as a tuple
 * of specific hex strings, which no consumer wants and which breaks
 * lookup-by-value: on a union of two disjoint literal tuples, the parameter of
 * `indexOf` and `includes` collapses to `never`. Sub-project 2 needs exactly
 * that lookup to map a persisted colour back to an index.
 *
 * `Readonly<Record<...>>` rather than a bare `Record<...>`: the inner
 * `readonly string[]` only freezes the elements, and without the outer
 * `Readonly` the group properties themselves stay writable.
 */
export const accents: Readonly<Record<AccentGroup, readonly string[]>> = {
    coffee: [
        "#9FC3F0", // Sky
        "#F0B98E", // Peach
        "#F0A0AB", // Blossom
        "#B4D6A8", // Sage
        "#97D8C4", // Mint
        "#BDB2E8", // Lilac
        "#A6D6E8", // Ice
        "#E7A9C9"  // Rose
    ],
    tea:    [
        "#CFD6A3", // Sencha
        "#DCC194", // Oolong
        "#D9CF9A", // Jasmine
        "#E0AEA6"  // Hibiscus
    ]
};

/** One machine colour: its ink, its stepped-back twin, and what it is called. */
export type MachineColour = {
    /** Said by a screen reader on the colour choice. */
    name: string;
    /** The dot, and the home link glyph while that machine is connected. */
    ink: string;
    /**
     * The ink with its OKLCH chroma multiplied by 0.45 and lightness and hue
     * held, the rule `successMuted` follows, for the header as it collapses.
     */
    muted: string;
};

/**
 * Which saved xBloom is which, with several saved.
 *
 * The first is today's connected green, exactly, so a phone with one machine
 * draws what it always drew. The others sit in the same lightness band as that
 * green (OKLCH L 0.76 to 0.80) at hues kept well away from the three that
 * already mean something: amber is the machine stopped or connecting, red is
 * a fault or a machine not answering, and magenta is `brand`, which never
 * marks a state. A colour here only says "this machine", and connected or not
 * is carried by the link glyph's shape, never by the colour alone.
 *
 * Every ink clears 8.5:1 on `base`, `surface` and `raised`, and so does every
 * muted twin; the colour tests hold both. These are the canonical Original
 * Dark values; the appearance resolver fits their ink for other chrome.
 *
 * Order matters: a new machine takes the first colour no other machine has,
 * and the order puts the hues furthest from green first.
 */
export const machineColours: readonly MachineColour[] = [
    {name: "Green",  ink: palette.success, muted: palette.successMuted},
    {name: "Blue",   ink: palette.info,    muted: "#9CB4D5"},
    {name: "Violet", ink: "#C4A4FE",       muted: "#BDB0D8"},
    {name: "Cyan",   ink: "#44D4E2",       muted: "#95C9CE"}
];

/**
 * Blend two hex colours.
 *
 * Here rather than beside the animation that wanted it, for the same reason
 * every literal is here: a blended colour is still a colour, and one computed
 * in a component is one the palette cannot be retuned through.
 *
 * `amount` is the weight of `to`, clamped to 0-1. Both inputs must be
 * six-digit `#rrggbb` — every colour in this module is.
 */
export function mix(from: string, to: string, amount: number): string {
    const weight = Math.min(1, Math.max(0, amount));
    const channel = (hex: string, at: number) => parseInt(hex.slice(at, at + 2), 16);
    const blended = [1, 3, 5].map((at) => {
        const value = Math.round(
            channel(from, at) + (channel(to, at) - channel(from, at)) * weight
        );
        return value.toString(16).padStart(2, "0");
    });
    return `#${blended.join("")}`;
}

/**
 * `warn`'s hue, in degrees.
 *
 * Stated rather than derived so the guard below cannot silently follow `warn`
 * somewhere else: if the amber is ever retuned, this is the second place that
 * has to agree, and the colour tests say so.
 */
const WARN_HUE = 43;

/**
 * How near amber a derived hue may come before it is pushed out.
 *
 * Deliberately tight. The trace spends hue on meaning -- the accent is this
 * recipe, amber is the machine stopped -- and a wider band would start moving
 * colours that are already clear. At 25 degrees the guard fires for exactly one
 * of the twelve accents (Sky, whose complement lands ten degrees from amber);
 * the next nearest are Ice at 27 and Lilac at 29, and both are left alone.
 */
const AMBER_GUARD = 25;

/** Below this a derived colour is too dark to read as a line on `base`. */
const CUP_LIGHTNESS_FLOOR = 0.6;

function toHsl(hex: string): {h: number; s: number; l: number} {
    const [r, g, b] = [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16) / 255);
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    const delta = max - min;
    if (delta === 0) return {h: 0, s: 0, l};
    const s = delta / (1 - Math.abs(2 * l - 1));
    const h = max === r ? 60 * (((g - b) / delta) % 6)
            : max === g ? 60 * ((b - r) / delta + 2)
            :             60 * ((r - g) / delta + 4);
    return {h: (h + 360) % 360, s, l};
}

function toHex(h: number, s: number, l: number): string {
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l - c / 2;
    const [r, g, b] =
          h < 60  ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x]
        : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
    return `#${[r, g, b]
        .map((v) => Math.round((v + m) * 255).toString(16).padStart(2, "0"))
        .join("")}`;
}

/**
 * The colour of the cup line, for a recipe drawn in `accent`.
 *
 * Derived rather than chosen, because it cannot be chosen: the accent is one of
 * twelve the user picks between, two of which are themselves orange, so any
 * fixed contrasting colour collides with somebody's recipe. The complement of
 * the accent never collides with it, whichever one it is.
 *
 * Saturation is held and lightness is held with a floor, so the cup line is as
 * vivid as the recipe it belongs to and still legible on black. Only the hue
 * moves -- and only far enough to clear amber, which already means the machine
 * stopped and is not available to mean anything else.
 */
export function cupLineFor(accent: string): string {
    const {h, s, l} = toHsl(accent);
    let hue = (h + 180) % 360;
    // Signed, so the push is to the nearer edge of the band rather than always
    // to the same one -- a complement just below amber must not jump over it.
    const drift = ((hue - WARN_HUE + 540) % 360) - 180;
    if (Math.abs(drift) < AMBER_GUARD) {
        hue = ((drift >= 0 ? WARN_HUE + AMBER_GUARD : WARN_HUE - AMBER_GUARD) + 360) % 360;
    }
    return toHex(hue, s, Math.max(CUP_LIGHTNESS_FLOOR, l));
}

export type Palette = {readonly [K in keyof typeof palette]: string};
export type AccentForeground = {readonly [K in keyof typeof onAccent]: string};
export type ControlPair = Readonly<{
    fill: string; ink: string; pressedFill: string; pressedInk: string;
}>;
export type DisplayRecipeColour = Readonly<{
    canonical: string;
    fill: string;
    ink: string;
    cupInk: string;
    onAccent: AccentForeground;
    keyInk: Readonly<{normal: string; success: string; danger: string}>;
}>;
export type SwitchPair = Readonly<{
    on: Readonly<{track: string; ring: string; thumb: string}>;
    off: Readonly<{track: string; ring: string; thumb: string}>;
}>;
export type Appearance = Readonly<{
    choice: AppearanceChoice;
    scheme: "light" | "dark";
    palette: Palette;
    primary: ControlPair;
    selection: ControlPair;
    onBrand: {readonly text: string; readonly marker: string};
    chromeSwitch: SwitchPair;
    recipe: (canonical: string) => DisplayRecipeColour;
    onFill: (fill: string) => AccentForeground;
    switchOn: (fill: string) => SwitchPair;
    machineColour: (canonical: MachineColour) => MachineColour;
}>;

const chrome: Readonly<Record<ThemeId, Palette>> = {
    original: palette,
    light: {
        ...palette,
        base: "#F5F4F0", surface: "#FFFFFF", raised: "#ECEBE6", control: "#DCDAD5",
        line: "#C5C3BD", text: "#171717", dim: "#595959", placeholder: "#595959",
        muted: "#78736B", brand: "#AD0057", brandFill: "#D10069",
        success: "#1F6A3B", warn: "#785B00", danger: "#AF2118", info: "#254E83",
        dangerFaint: "#956C66", successMuted: "#42664C", warnMuted: "#71623F"
    },
    blue: {
        ...palette,
        base: "#0015B8", surface: "#061FA8", raised: "#0D28B8", control: "#1936C2",
        line: "#3455CC", text: "#FFFFFF", dim: "#CED7FF", placeholder: "#CED7FF",
        muted: "#7F98E4", brand: "#FFB5D8", success: "#9AF1B3", warn: "#FFE58F",
        danger: "#FFB0A5", info: "#C6DFFF", dangerFaint: "#D3A3AA",
        successMuted: "#B4DCC2", warnMuted: "#E1D7B5"
    },
    magenta: {
        ...palette,
        base: "#260B1D", surface: "#331127", raised: "#401831", control: "#50213F",
        line: "#6A3153", text: "#FFFFFF", dim: "#D7BECE", placeholder: "#D7BECE",
        muted: "#9A748A", brand: "#FF76BA", success: "#9AF1B3", warn: "#FFE58F",
        danger: "#FFB0A5", info: "#E7C0D5", dangerFaint: "#BD969F",
        successMuted: "#B4DCC2", warnMuted: "#E1D7B5"
    }
};

const themedAccents: Readonly<Record<Exclude<ThemeId, "original">, Readonly<Record<AccentGroup, readonly string[]>>>> = {
    light: {
        coffee: ["#254E83", "#8B463A", "#8B3656", "#426039", "#255F58", "#654581", "#286076", "#83465E"],
        tea: ["#46613D", "#725429", "#685D25", "#84433F"]
    },
    blue: {
        coffee: ["#A9C1FF", "#7296E8", "#8CA9ED", "#BACDFB", "#86BBD9", "#B7B1F0", "#C6DFFF", "#8E9BD9"],
        tea: ["#CED7F5", "#AABCD9", "#D6E4EE", "#9EADD3"]
    },
    magenta: {
        coffee: ["#F4A0CA", "#CC7AA7", "#EAB0D0", "#BA95B6", "#D9A0C2", "#D1A5D8", "#E7C0D5", "#DC8EBA"],
        tea: ["#DFCBD8", "#BBA2B2", "#F1DAE8", "#CBADB9"]
    }
};

const primaryColours: Readonly<Record<ThemeId, readonly [string, string]>> = {
    original: ["#FF007F", "#0C0C0C"],
    light: ["#D10069", "#FFFFFF"],
    blue: ["#E0ECFF", "#091536"],
    magenta: ["#FF76BA", "#250B1B"]
};
const BLACK = "#000000";
const WHITE = "#FFFFFF";
type RGB = readonly [number, number, number];

/** Presentation fills share mix/cupLineFor's opaque six-digit hex contract. */
function rgb(colour: string): RGB {
    if (!/^#[0-9a-f]{6}$/i.test(colour)) throw new Error(`Invalid colour: ${colour}`);
    return [
        parseInt(colour.slice(1, 3), 16),
        parseInt(colour.slice(3, 5), 16),
        parseInt(colour.slice(5, 7), 16)
    ];
}

function luminance(channels: RGB): number {
    const linear = channels.map(value => {
        const c = value / 255;
        return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}

function ratio(foreground: RGB, background: RGB): number {
    const a = luminance(foreground);
    const b = luminance(background);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

function contrastRatio(foreground: string, background: string): number {
    return ratio(rgb(foreground), rgb(background));
}

function neutralFor(background: string): string {
    return contrastRatio(BLACK, background) >= contrastRatio(WHITE, background) ? BLACK : WHITE;
}

/** First passing one-percent mix, bounded even for an impossible composition. */
function fit(candidate: string, grounds: readonly string[], floor: number): string {
    const endpoint = neutralFor(grounds[0]);
    for (let step = 0; step <= 100; step++) {
        const ink = step === 0 ? candidate : mix(candidate, endpoint, step / 100);
        if (grounds.every(ground => contrastRatio(ink, ground) >= floor)) return ink;
    }
    throw new Error("No readable colour for these backgrounds");
}

function composite(ink: string, fill: string, alpha: number): RGB {
    const foreground = rgb(ink);
    const background = rgb(fill);
    const channel = (i: number) => foreground[i] * alpha + background[i] * (1 - alpha);
    return [channel(0), channel(1), channel(2)];
}

function translucent(ink: string, fill: string, start: number, floor: number): string {
    for (let percent = Math.round(start * 100); percent <= 100; percent++) {
        if (ratio(composite(ink, fill, percent / 100), rgb(fill)) >= floor) {
            return `rgba(${rgb(ink).join(",")},${(percent / 100).toFixed(2)})`;
        }
    }
    throw new Error("No readable translucent colour for this fill");
}

function hasFill(group: Readonly<Record<AccentGroup, readonly string[]>>, fill: string): boolean {
    return [...group.coffee, ...group.tea].some(value => value.toLowerCase() === fill.toLowerCase());
}

/** Takes an actual displayed fill, never a persisted identity to remap. */
function foregroundFor(fill: string): AccentForeground {
    rgb(fill);
    if (hasFill(accents, fill)) return {...onAccent};
    const lightCard = hasFill(themedAccents.light, fill);
    const pastelCard = hasFill(themedAccents.blue, fill) || hasFill(themedAccents.magenta, fill);
    const whiteInk = lightCard || (!pastelCard && neutralFor(fill) === WHITE);
    const ink = whiteInk ? WHITE : BLACK;
    return {
        text: lightCard ? WHITE : pastelCard ? onAccent.text : ink,
        label: translucent(ink, fill, whiteInk ? 0.90 : pastelCard ? 0.80 : 0.65, 4.5),
        marker: translucent(ink, fill, whiteInk ? 0.90 : pastelCard ? 0.80 : 0.70, 4.5),
        profileStroke: translucent(ink, fill, whiteInk ? 0.80 : pastelCard ? 0.70 : 0.50, 3),
        profileFill: `rgba(${rgb(ink).join(",")},0.15)`,
        profileDot: `rgba(${rgb(ink).join(",")},0.36)`,
        key: translucent(ink, fill, 0.78, 3)
    };
}

function controlPair(fill: string, ink: string): ControlPair {
    return {fill, ink, pressedFill: mix(fill, ink, 0.06), pressedInk: ink};
}

/**
 * Pure presentation snapshot. Recipes must enter as canonical identities;
 * badges and controls instead use onFill/switchOn with their actual fills.
 * No setting, stored recipe or canonical export is changed by resolving.
 */
export function resolveAppearance(supplied: AppearanceChoice): Appearance {
    const choice = {...supplied};
    const p = {...chrome[choice.theme]};
    const grounds = [p.base, p.surface, p.raised];
    const [primaryFill, primaryInk] = primaryColours[choice.theme];
    const primary = controlPair(primaryFill, primaryInk);
    const selection = choice.theme === "light"
        ? controlPair("#202020", WHITE) : controlPair(WHITE, onAccent.text);

    function recipe(canonical: string): DisplayRecipeColour {
        rgb(canonical);
        let fill = canonical;
        if (choice.recipeColours === "themed" && choice.theme !== "original") {
            for (const group of ["coffee", "tea"] as const) {
                const index = accents[group].findIndex(value => value.toLowerCase() === canonical.toLowerCase());
                if (index !== -1) {
                    fill = themedAccents[choice.theme][group][index];
                    break;
                }
            }
        }
        const foreground = foregroundFor(fill);
        const stock = hasFill(accents, fill);
        const keyParts = foreground.key.match(/^rgba\((\d+),(\d+),(\d+),([\d.]+)\)$/)!;
        const key = composite(
            `#${keyParts.slice(1, 4).map(c => Number(c).toString(16).padStart(2, "0")).join("")}`,
            fill, Number(keyParts[4])
        );
        // The glyph is on the rounded, composited well, not on chrome or fill.
        const keyGround = `#${key.map(c => Math.round(c).toString(16).padStart(2, "0")).join("")}`;
        const tones = stock ? palette : p;
        return {
            canonical, fill,
            ink: fit(fill, [p.base], 4.5),
            cupInk: fit(cupLineFor(fill), [p.base], 3),
            onAccent: foreground,
            keyInk: {
                normal: fit(tones.text, [keyGround], 3),
                success: fit(tones.success, [keyGround], 3),
                danger: fit(tones.danger, [keyGround], 3)
            }
        };
    }

    function switchOn(fill: string): SwitchPair {
        const foreground = foregroundFor(fill);
        if (hasFill(accents, fill)) {
            return {on: {...switchColours.accent.on}, off: {...switchColours.accent.off}};
        }
        const track = foreground.text;
        return {
            on: {track, ring: track, thumb: neutralFor(track)},
            off: {track: palette.none, ring: track, thumb: track}
        };
    }

    const chromeSwitch: SwitchPair = choice.theme === "original"
        ? {on: {...switchColours.dark.on}, off: {...switchColours.dark.off}}
        : {
            on: {track: primary.fill, ring: primary.fill, thumb: primary.ink},
            off: {
                track: p.control,
                ring: fit(p.dim, grounds, 3),
                thumb: fit(p.dim, [p.control], 3)
            }
        };
    return {
        choice, scheme: choice.theme === "light" ? "light" : "dark",
        palette: p, primary, selection, onBrand: {...onBrand}, chromeSwitch,
        recipe, onFill: foregroundFor, switchOn,
        machineColour: canonical => ({
            ...canonical,
            ink: fit(canonical.ink, grounds, 4.5),
            muted: fit(canonical.muted, grounds, 4.5)
        })
    };
}
