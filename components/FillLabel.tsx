import React from "react";
import {Text} from "tamagui";

import DotMatrixText from "@/components/DotMatrixText";
import {useAppearance} from "@/hooks/useAppearance";
import {DOTO_MAX_FONT_SCALE} from "@/library/dotoMetrics";

/**
 * Optional solid lettering on filled controls. Off preserves the original
 * Doto metrics; outlined controls stay dotted regardless of the preference.
 */
export default function FillLabel({
    children, color, fontSize = 14, letterSpacing = 0.5, filled = true, testID
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
    const {solidControlLabels} = useAppearance();
    if (!filled || !solidControlLabels) {
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
