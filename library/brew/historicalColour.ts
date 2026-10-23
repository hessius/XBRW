import {isValidColour, palette} from "@/constants/colors";

export const HISTORICAL_COLOUR_WARNING = "Stored brew colour is invalid; using a display fallback.";

/** A canonical fallback stays stable across outer-theme changes during capture.
 * The stored snapshot must still be used for export and handoff. */
export function historicalAccent(accent: string): string {
    return isValidColour(accent) ? accent : palette.dim;
}
