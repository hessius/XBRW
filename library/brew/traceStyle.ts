import {mix, palette, type Appearance} from "@/constants/colors";

/** The waking breath's trough; shared by the animation and contrast regressions. */
export const PLAN_MIN_OPACITY = 0.45;

/**
 * Fit the plan after its outer SVG opacity, not just its opaque stroke.
 * Runs on the JS side; the SVG still owns the unchanged breathing multiplier.
 */
export function planInk(
    appearance: Appearance, colour: string, grounds: readonly string[], opacity: number
): string {
    const floor = 3.05;
    const candidate = appearance.chartInk(colour, grounds, floor);
    if (opacity <= 0 || opacity >= 1) return candidate;
    const channels = (hex: string) => [1, 3, 5].map(at => parseInt(hex.slice(at, at + 2), 16));
    const luminance = (rgb: number[]) => {
        const linear = rgb.map(value => {
            const c = value / 255;
            return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
        });
        return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
    };
    const backgrounds = grounds.map(ground => {
        const rgb = channels(ground);
        return {rgb, luminance: luminance(rgb)};
    });
    const ground = backgrounds[0].luminance;
    const endpoint = (ground + 0.05) / 0.05 >= 1.05 / (ground + 0.05)
        ? palette.base : palette.text;
    for (let step = 0; step <= 100; step++) {
        const ink = step === 0 ? candidate : mix(candidate, endpoint, step / 100);
        const rgb = channels(ink);
        if (backgrounds.every(background => {
            const displayed = luminance(rgb.map((channel, i) =>
                channel * opacity + background.rgb[i] * (1 - opacity)));
            return (Math.max(displayed, background.luminance) + 0.05)
                / (Math.min(displayed, background.luminance) + 0.05) >= floor;
        })) return ink;
    }
    throw new Error(`No readable plan colour at opacity ${opacity} on ${grounds.join(", ")}`);
}

/**
 * What the lines on a brew chart look like.
 *
 * Companion to `brewShape.ts`, which says where they go. The split matters
 * because four components draw these channels now: `BrewTrace` for one brew,
 * `CompareTrace` for two, `FlowSparkline` for the live row and
 * `BrewRateChart` for stored rates. A dash pattern
 * that lives at its use site can be retuned in one of them and not the other,
 * and the screens then disagree about what dotted means.
 *
 * Same rule as `constants/colors.ts` and `constants/motion.ts`: a value that is
 * not in the module cannot take part when the thing is retuned.
 *
 * KEEP IN STEP WITH: `components/BrewTrace.tsx`,
 * `components/CompareTrace.tsx`, `components/FlowSparkline.tsx`,
 * `components/BrewRateChart.tsx`, `components/__tests__/traceGrammar.test.tsx`.
 */

export type Channel = "water" | "cup" | "plan";

/** Which of the two brews a line belongs to. Only `CompareTrace` sets this. */
export type Role = "subject" | "reference";

/**
 * The greys the reference brew borrows.
 *
 * Two different greys, and not interchangeable: the comparison screen is about
 * the cup, so the cup keeps the brighter one. Both clear the 3:1 floor for a
 * non-text graphic on `base`. The water grey collides with the plan stroke on
 * purpose; width and dashes separate those lines, not a third low-contrast grey.
 */
export const referenceCupColour = (appearance: Appearance) => appearance.palette.dim;
export const referenceWaterColour = (appearance: Appearance) => appearance.palette.muted;

/**
 * The attributes a channel's line carries.
 *
 * Deliberately closed, and deliberately without `fill` or `strokeOpacity`. Both
 * charts spread this **last** onto their `<Path>` elements so that a use site
 * cannot quietly override the grammar, which means any key added here silently
 * wins over the same attribute written at the site. `fill="none"` and the
 * animated `strokeOpacity` are set locally and must stay out of this type.
 */
export type ChannelStyle = {
    stroke: string;
    strokeWidth: number;
    strokeDasharray: string | undefined;
    strokeLinecap: "round" | undefined;
    strokeLinejoin: "round" | undefined;
};

export type ChannelInput = {
    appearance: Appearance;
    accent: string;
    /** Overflow protection has stopped the water. Water only. */
    holding?: boolean;
    /** False once the recipe is in the machine and the plan's dashes fuse. */
    dashed?: boolean;
    /**
     * The plan line's colour, when a caller animates it.
     *
     * The live brew screen warms the plan from grey toward the accent as the
     * recipe lands in the machine, so unlike water and cup this channel's
     * colour is not a constant. It lives here rather than being overridden at
     * the use site because an override is exactly the drift this module
     * exists to prevent: `CompareTrace` would have no way to know the rule.
     */
    planColour?: string;
    role?: Role;
};

export function channelStyle(
    channel: Channel,
    {appearance, accent, holding = false, dashed = true, planColour, role = "subject"}: ChannelInput
): ChannelStyle {
    const reference = role === "reference";
    switch (channel) {
        case "water":
            return {
                // Reference water stays grey even if that brew was held; amber
                // was rejected because it reads as a live warning on the wrong brew.
                stroke: reference ? referenceWaterColour(appearance)
                    : holding ? appearance.palette.warn : appearance.recipe(accent).ink,
                strokeWidth:     2.5,
                strokeDasharray: undefined,
                strokeLinecap:   "round",
                strokeLinejoin:  "round"
            };
        case "cup":
            return {
                stroke:          reference ? referenceCupColour(appearance) : appearance.recipe(accent).cupInk,
                strokeWidth:     2,
                strokeDasharray: "1 3",
                strokeLinecap:   "round",
                strokeLinejoin:  undefined
            };
        case "plan":
            return {
                // `planOpacity` is animation state, not drawing grammar, so it
                // stays with each chart rather than being shared here.
                stroke:          planColour ?? appearance.palette.muted,
                strokeWidth:     1.5,
                strokeDasharray: dashed ? "4 4" : undefined,
                strokeLinecap:   undefined,
                strokeLinejoin:  undefined
            };
    }
}
