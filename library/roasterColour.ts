import {accents, type AccentGroup} from "../constants/colourValues";
import {MIN_ACCENT_CHROMA, toOklab} from "./cloud/accentMatch";

/**
 * A roaster's own colour for a coffee, and the recipe accent it becomes.
 *
 * Roasters colour code their coffees, often by origin, and an import link
 * (`bean.colour`) or a roaster feed (`colour`) can say which colour a coffee
 * wears. The recipe card should keep that sense of which coffee is which.
 *
 * The colour is snapped to the app's own palette rather than kept, for the
 * reasons `library/cloud/accentMatch.ts` gives for xBloom's colours: an
 * accent is persisted as an index so the palette can be retuned, every
 * accent is a pale fill proven to carry the fixed dark ink in `onAccent`,
 * and a foreign hex sitting among them would look almost right, which is
 * worse than looking different. A derived tint was considered and refused:
 * it would need a persisted hex on the recipe, which is the thing the
 * palette exists to avoid, and its contrast could only be checked at runtime.
 *
 * What it cannot use is `matchAccent` itself. A roaster's colour is a label
 * colour, mid to dark, while the accents are light pastels, so every one of
 * them is far from every accent in lightness and `MAX_ACCENT_DISTANCE`
 * refuses them all. Lightness is the one thing a card fill must not take
 * from the roaster, so the match is on hue alone: the accent whose hue is
 * nearest, provided it is near enough to be the same colour to a reader.
 */

/**
 * How far apart two hues may be and still name the same colour, in degrees.
 *
 * Neighbouring coffee accents sit 23 to 79 degrees apart, so 30 lets every
 * accent claim the hues either side of it while leaving the widest gap, the
 * yellows between Peach (59) and Sage (138), with no answer. A yellow label
 * painted Peach would be the confident wrong answer `accentMatch.ts` warns
 * about; with no answer the recipe takes an accent as any new recipe does.
 */
export const MAX_HUE_GAP = 30;

/**
 * A roaster colour, strictly: `#RRGGBB` and nothing else.
 *
 * No shorthand `#RGB`, no alpha, no names, no missing `#`. The value comes
 * from outside the app, and a lenient reader here is a second grammar that
 * every sender would then rely on. Returned upper case so equal colours
 * compare equal. Anything else is undefined, which is no colour at all.
 */
export function readRoasterColour(value: unknown): string | undefined {
    if (typeof value !== "string") return undefined;
    const trimmed = value.trim();
    return /^#[0-9A-Fa-f]{6}$/.test(trimmed) ? trimmed.toUpperCase() : undefined;
}

function hueOf(hex: string): {hue: number; chroma: number} | null {
    const lab = toOklab(hex);
    if (!lab) return null;
    return {
        hue: (Math.atan2(lab.b, lab.a) * 180 / Math.PI + 360) % 360,
        chroma: Math.hypot(lab.a, lab.b)
    };
}

function hueGap(x: number, y: number): number {
    const d = Math.abs(x - y) % 360;
    return d > 180 ? 360 - d : d;
}

/**
 * The accent index a roaster colour becomes **within the given group**, or
 * `null` when it has no fair answer: not a strict `#RRGGBB`, too grey to have
 * a hue (`MIN_ACCENT_CHROMA`, the same floor xBloom's colours use), or more
 * than `MAX_HUE_GAP` from every accent in the group.
 *
 * `null` means the caller assigns an accent as for any other new recipe.
 */
export function roasterAccent(colour: unknown, group: AccentGroup): number | null {
    const hex = readRoasterColour(colour);
    if (hex === undefined) return null;
    const target = hueOf(hex);
    if (!target || target.chroma < MIN_ACCENT_CHROMA) return null;

    const palette = accents[group];
    let best: number | null = null;
    let bestGap = Infinity;
    for (let i = 0; i < palette.length; i++) {
        const candidate = hueOf(palette[i]);
        if (!candidate) continue;
        const gap = hueGap(target.hue, candidate.hue);
        if (gap < bestGap) {
            bestGap = gap;
            best = i;
        }
    }
    return bestGap <= MAX_HUE_GAP ? best : null;
}
