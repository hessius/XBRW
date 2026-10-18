import React, {useState} from "react";
import {Image} from "react-native";

type Props = {
    /** An https URL, already gated on `showRecipeAvatars` by the caller. */
    uri: string;
    /** Width and height, in points. The picture is always a square. */
    size: number;
    radius: number;
    testID?: string;
};

/**
 * A recipe's picture: pod artwork, or the bag photo a roaster's link carried.
 *
 * Decorative, and hidden from screen readers on both platforms. Every place
 * that draws one already announces the recipe's name, and a photo of a coffee
 * bag adds nothing a listener needs.
 *
 * A picture that will not load is dropped rather than left as an empty
 * square, the same rule the pod photo in ABOUT follows: a recipe whose picture
 * failed looks exactly like one that never had a picture. The failure is held
 * against the URL it came from rather than as a flag, so a recipe whose picture
 * changes gets a fresh attempt without a state reset in an effect.
 *
 * React Native's own `Image`, as every other picture in the app is, so the
 * platform's HTTP cache serves repeat views. `resizeMethod="resize"` lets
 * Android decode a 600 px bag photo at roughly the size it is drawn, which
 * matters in a scrolling list.
 */
export default function RecipePhoto({uri, size, radius, testID}: Props) {
    const [failed, setFailed] = useState<string | null>(null);

    if (uri.length === 0 || failed === uri) {
        return null;
    }

    return (
        <Image testID={testID} source={{uri}}
               accessible={false}
               accessibilityElementsHidden
               importantForAccessibility="no"
               resizeMode="cover" resizeMethod="resize"
               onError={() => setFailed(uri)}
               style={{width: size, height: size, borderRadius: radius}}/>
    );
}
