import React from "react";
import {View} from "react-native";

type Props = {
    /** One of `machineColours`' inks. */
    colour: string;
    testID?: string;
};

/**
 * A saved machine's colour, as a small dot beside its name.
 *
 * Decorative: the name next to it is what says which machine, and a screen
 * reader is told the name. The dot is there so that the same colour can be
 * matched by eye against the home screen's link glyph.
 */
export default function MachineColourDot({colour, testID}: Props) {
    return (
        <View testID={testID}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              style={{width: 10, height: 10, borderRadius: 5, backgroundColor: colour}}/>
    );
}
