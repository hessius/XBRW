import React, {useState} from "react";
import {Image, View} from "react-native";

import {palette} from "@/constants/colors";

type Props = {
    /** An https URL, already gated on the surface's preference by the caller. */
    uri: string;
    /** Width and height, in points. The frame is always a square. */
    size: number;
    radius: number;
    /**
     * What shows around a picture that is not square. The whole picture is
     * drawn ("contain") rather than cropped to fill, because most of these are
     * product shots of a bag, and a crop cuts the label off.
     */
    backing?: string;
    testID?: string;
    onError?: () => void;
};

/**
 * A recipe's picture: pod artwork, or the bag photo a roaster's link carried.
 *
 * Drawn whole inside its frame on a neutral backing, never cropped: a
 * square shot fills the frame exactly, and anything else is letterboxed
 * rather than losing its edges.
 *
 * Decorative and hidden from screen readers on both platforms.
 * Every place that draws one already announces the recipe's name.
 *
 * A picture that will not load is dropped rather than left as an empty
 * square, the same rule the pod photo in ABOUT follows: a recipe whose picture
 * failed looks exactly like one that never had a picture, and has no button
 * that opens nothing. The failure is held against the URL it came from rather
 * than as a flag, so a recipe whose picture changes gets a fresh attempt
 * without a state reset in an effect.
 *
 * React Native's own `Image`, as every other picture in the app is, so the
 * platform's HTTP cache serves repeat views. `resizeMethod="resize"` lets
 * Android decode a 600 px bag photo at roughly the size it is drawn, which
 * matters in a scrolling list.
 */
export default function RecipePhoto({uri, size, radius, backing = palette.raised, testID, onError}: Props) {
    const [failed, setFailed] = useState<string | null>(null);

    if (uri.length === 0 || failed === uri) {
        return null;
    }

    return (
        <View style={{width: size, height: size, borderRadius: radius, overflow: "hidden",
                      backgroundColor: backing}}>
            <Image testID={testID} source={{uri}}
                   accessible={false}
                   accessibilityElementsHidden
                   importantForAccessibility="no"
                   resizeMode="contain" resizeMethod="resize"
                   onError={() => { setFailed(uri); onError?.(); }}
                   style={{width: size, height: size}}/>
        </View>
    );

}
