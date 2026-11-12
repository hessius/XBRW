import {tagKey} from "./tagKey";

/**
 * The cup type byte, and which of them brews without overflow protection.
 *
 * `OTHER` is the one. Omni is xBloom's own dripper, a vessel the machine knows
 * the shape of, so it can stop the water before it comes over the rim;
 * `docs/machine-integration/cloud-api.md` names the cloud value
 * `2 = Omni/Dripper`. A third-party brewer is one the machine has never been
 * told the shape of, so it does not try.
 *
 * Only a card carries the distinction. Cup type is not in the BLE recipe blob,
 * so a brew started over Bluetooth sends the same cup frame whichever of the
 * three coffee cups the recipe names, and a tea brew sends no cup frame at
 * all. `setCupFrame` choosing one width is not in conflict with any of this.
 *
 * This comment said the opposite until #151, which proposed swapping the two
 * bytes to match it. The bytes were always right; `Recipe.card.test.ts` holds
 * all four and carries the argument.
 */
export const CUP_TYPE = {
    XPOD:  0x00,
    OTHER: 0x01, // no overflow protection
    OMNI:  0x02,
    TEA:   0x03  // high bits may contain the default number of cups to brew
}

// This byte value for the grind size disables the grinder
export const GRINDER_OFF: number = 41;
// Grind size is stored on the NFC card with offset (grind_size_value - 40)
export const GRIND_SIZE_OFFSET = 40;
/**
 * The value that means "grinder off" rather than a coarseness.
 *
 * `GRINDER_OFF` is the byte on the card; the number a user sees is that byte
 * plus the offset. Conflating the two is a mistake that has already been made
 * once, in the original text of #52.
 */
export const GRINDER_OFF_VALUE = GRIND_SIZE_OFFSET + GRINDER_OFF;
/** The XID occupies card bytes 32-38 inclusive. */
export const XID_LENGTH = 7;

/**
 * xBloom XIDs look like `<VENDOR>[T]<NUM>`: a vendor code of at least two
 * letters, an optional `T` for tea, then at least two digits, within the seven
 * characters the card field holds. An empty XID is allowed — the machine brews
 * fine without one, it just means the app cannot look the recipe up online.
 *
 * The rule used to demand exactly three letters and at most three digits,
 * which was an inference from the codes we happened to have seen. `XB0001` —
 * xBloom's own house code, on the generic "Recipe Card" pod — breaks it in
 * both directions at once, and was being refused by the same app that had just
 * imported a recipe carrying it. The bound that is real is the field width;
 * the shape is deliberately loose now, because the server is the only thing
 * that actually knows whether a code exists.
 */
export function isValidXID(xid: string): boolean {
    const trimmed = xid.trim();
    if (trimmed.length === 0) {
        return true;
    }
    return trimmed.length <= XID_LENGTH && /^[A-Za-z]{2,}T?[0-9]{2,}$/.test(trimmed);
}

/**
 * UTF-16 code units, not glyphs — an emoji costs two and a family emoji eight.
 * A deliberately coarse bound: it exists to cap a hostile backup, not to ration
 * the user. Longer tags are dropped on import rather than truncated, because a
 * truncated tag is a plausible-looking wrong tag.
 */
export const MAX_TAG_LENGTH = 32;
/** Tags per recipe. Bounds a hostile backup, not the user. */
export const MAX_TAGS_PER_RECIPE = 20;

/**
 * The ceiling on a recipe's own `name`, in characters.
 *
 * `RenameSheet` enforces it where the name is typed, and an import link's
 * `recipe.name` is held to it where that name arrives. Both read this constant,
 * so a link cannot set a name the rename sheet would then refuse to show whole.
 * A name is a headline, not a description; the note is where a sentence goes.
 */
export const MAX_NAME = 100;

/**
 * The description's ceiling, in characters.
 *
 * Enforced in the editor with a live counter, not on `Recipe`. A limit a user
 * can see is a limit; a limit they discover by having their words vanish is a
 * bug. This constant is what the editor, the import link reader and the backup
 * validator all read, so they cannot drift.
 */
export const MAX_DESCRIPTION = 60;

/**
 * Where a recipe came from. Drives the placeholder name.
 *
 * A closed union on purpose. The verb table in `placeholderName` is typed
 * against it, so a new source cannot be added without deciding what a nameless
 * recipe from that source should be called.
 */
export type RecipeSource = "read" | "import" | "duplicate" | "manual" | "brewmind";

export function normaliseRecipeTags(tags: unknown): string[] {
    if (!Array.isArray(tags)) return [];
    const seen = new Set<string>();
    const kept: string[] = [];
    for (const entry of tags) {
        if (typeof entry !== "string") continue;
        const tag = entry.trim();
        if (tag.length === 0 || tag.length > MAX_TAG_LENGTH) continue;
        const key = tagKey(tag);
        if (seen.has(key)) continue;
        seen.add(key);
        kept.push(tag);
        if (kept.length === MAX_TAGS_PER_RECIPE) break;
    }
    return kept;
}

function stageTotal(volumes: readonly number[]): number {
    return volumes.reduce((total, volume) => total + (volume > 0 ? volume : 0), 0);
}

export function ratioForVolumes(volumes: readonly number[], dose: number): number {
    return Math.round(stageTotal(volumes) / dose);
}

/**
 * Whether the stages add up to what the dose and ratio ask for.
 *
 * The one rule, shared by `Recipe.isPourVolumeValid` and the importer. Within
 * the rounding of a millilitre because stage volumes are whole and a half-point
 * ratio can ask for 232.5 ml; for a whole-number ratio and dose both sides are
 * integers, so this is exact equality.
 */
export function stagesAddUpTo(total: number, target: number): boolean {
    return Math.abs(total - target) < 1;
}

/**
 * The ratio of a coffee recipe arriving from xBloom.
 *
 * `grandWater` is xBloom's own ratio and it need not be whole: 18 g pouring
 * 261 ml is 1:14.5. Rounding it to 15 asks for 270 ml, which the stages do not
 * pour, and the recipe is then refused at the machine. So the stated ratio is
 * kept when the stages agree with it. When they do not, it says nothing about
 * this recipe and the ratio comes from the volumes, as it always has.
 *
 * Tea does not come through here: its volumes are clamped on the way in, so its
 * ratio has to be derived from what is left.
 */
export function ratioForImport(volumes: readonly number[], dose: number, stated: unknown): number {
    return typeof stated === "number" && Number.isFinite(stated) && stated > 0
        && stagesAddUpTo(stageTotal(volumes), dose * stated)
        ? stated
        : ratioForVolumes(volumes, dose);
}
