/**
 * The XBRW++ mint endpoint.
 *
 * Overridable so a development build can point at a preview deployment or a
 * local `vercel dev`. `EXPO_PUBLIC_` is required for the value to survive into
 * the bundle; nothing secret goes through here, only a URL.
 */
export const SHARE_API_URL =
    process.env.EXPO_PUBLIC_SHARE_API_URL ?? "https://xbrw.app/api/share";

/**
 * The public XBRW++ import page URL that wraps a minted xBloom share link
 * with the recipe's local metadata (coffee, roaster, image, tags, colour).
 */
export const SHARE_IMPORT_URL =
    process.env.EXPO_PUBLIC_SHARE_IMPORT_URL ?? "https://xbrw.app/import";

/** How long to wait before giving up on a mint, in ms. */
export const SHARE_TIMEOUT_MS = 20_000;
