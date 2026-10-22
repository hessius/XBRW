import {isValidColour, resolveAppearance} from "@/constants/colors";
import {THEME_IDS} from "@/library/appearance";
import {historicalAccent} from "@/library/brew/historicalColour";
import {buildEnvelope} from "@/library/brew/handoff/envelope";
import {encodeHandoff} from "@/library/brew/handoff/encode";
import {brew, samples} from "@/library/brew/handoff/__tests__/fixtures";

it.each(["red", "rgb(255,0,0)", "hsl(120,100%,50%)", "#1234", "rgba(20,40,60,0.5)", "transparent"])(
    "accepts valid legacy RN colour syntax %s without normalising its identity", accent => {
        expect(isValidColour(accent)).toBe(true);
        for (const theme of THEME_IDS) {
            for (const recipeColours of ["original", "themed"] as const) {
                const appearance = resolveAppearance({theme, recipeColours});
                expect(historicalAccent(accent, appearance)).toBe(accent);
            }
        }
    }
);

it.each(["", "not-a-colour"])(
    "uses a shared display-only fallback for %j across all eight choices without changing JSON or handoff",
    accent => {
        const record = brew({accent});
        const json = JSON.stringify(record);
        const handoff = encodeHandoff(buildEnvelope(record, samples));
        for (const theme of THEME_IDS) {
            for (const recipeColours of ["original", "themed"] as const) {
                const appearance = resolveAppearance({theme, recipeColours});
                const presented = historicalAccent(record.accent, appearance);
                expect(presented).toBe(appearance.palette.dim);
                expect(() => appearance.recipe(presented)).not.toThrow();
                expect(() => appearance.recipe(record.accent)).toThrow("Invalid colour");
                expect(JSON.stringify(record)).toBe(json);
                expect(encodeHandoff(buildEnvelope(record, samples))).toEqual(handoff);
            }
        }
    }
);
