import {isValidColour, type Appearance} from "@/constants/colors";

export const HISTORICAL_COLOUR_WARNING = "Stored brew colour is invalid; using a display fallback.";

/** Presentation only: the stored snapshot must still be used for export and handoff. */
export function historicalAccent(accent: string, appearance: Appearance): string {
    return isValidColour(accent) ? accent : appearance.palette.dim;
}
