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
