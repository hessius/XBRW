import React from "react";
import {Text} from "tamagui";

import DotMatrixText from "@/components/DotMatrixText";
import {DOTO_MAX_FONT_SCALE} from "@/library/dotoMetrics";

/**
 * The share of a Doto label's box that is ink, measured from the bundled
 * fonts with "OPEN RECIPE" at phone density: about 0.20 for Doto-Bold and
 * 0.23 for Doto-ExtraBold. A solid bold face (Arial Bold, measured the same way)
 * is about 0.47.
 */
export const DOTO_INK_COVERAGE = 0.2;

/**
 * The label on a filled control: a primary action (BREW-style magenta in the
 * original theme) or a selection fill (BUY's white pill).
 *
 * Why this is not Doto. A Doto glyph is separate dots, so only about a fifth
 * of the label is ink. Light dots on a dark ground still read, because a few
 * bright points stand out against black. Dark dots on a light fill do not:
 * averaged over the label, #0C0C0C Doto on white comes to about 1.2:1, and on
 * the original magenta about 1.2:1 too, against 5:1 and more for the same
 * colours as solid strokes. On an Android phone that is what the owner saw:
 * BUY as a white pill with faint grey dots, OPEN RECIPE as magenta with dark
 * magenta dots, while TELL ME and ADD TO SHELF (light dots on black) read.
 * The ink colours were right; the face was the problem.
 *
 * So a filled control's label uses the body face in bold capitals with the
 * fill's own ink. `filled={false}` keeps the Doto label of an outlined
 * control, so a call site can switch on one flag.
 */
export default function FillLabel({
    children, color, fontSize = 13, letterSpacing = 1.5, filled = true, testID
}: {
    /** Upper case already; this component does not change case. */
    children: string;
    color: string;
    fontSize?: number;
    /** The Doto tracking; the body face uses less, so it is scaled down. */
    letterSpacing?: number;
    filled?: boolean;
    testID?: string;
}) {
    if (!filled) {
        return (
            <DotMatrixText testID={testID} fontSize={fontSize} weight="bold"
                           letterSpacing={letterSpacing} color={color}>
                {children}
            </DotMatrixText>
        );
    }
    return (
        <Text testID={testID} fontSize={fontSize + 1} fontWeight="700"
              letterSpacing={Math.min(letterSpacing, 1.5) * 0.6}
              maxFontSizeMultiplier={DOTO_MAX_FONT_SCALE}
              color={color}>
            {children}
        </Text>
    );
}
