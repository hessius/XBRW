import {useAppearance} from "@/hooks/useAppearance";
import React, {useState, type ReactNode} from "react";
import {ScrollView, View, type NativeScrollEvent, type NativeSyntheticEvent} from "react-native";
import Svg, {Defs, LinearGradient, Rect, Stop} from "react-native-svg";



/** How wide the fade over a clipped edge is. About half a chip's padding plus a letter. */
export const RAIL_FADE_WIDTH = 28;

/** Within this of an end counts as at it, so a sub-pixel scroll leaves no fade. */
const EDGE_SLACK = 2;

type Props = {
    testID?: string;
    /** Space before the first item and after the last, inside the scroll. */
    inset: number;
    gap: number;
    children: ReactNode;
};

function Fade({side}: {side: "start" | "end"}) {
    const appearance = useAppearance();
    const {palette} = appearance;
    const id = `rail-fade-${side}`;
    return (
        <View testID={id} pointerEvents="none"
              style={{position: "absolute", top: 0, bottom: 0, width: RAIL_FADE_WIDTH,
                      [side === "start" ? "left" : "right"]: 0}}>
            <Svg width="100%" height="100%">
                <Defs>
                    <LinearGradient id={`${id}-fill`} x1={side === "start" ? "0" : "1"} y1="0"
                                    x2={side === "start" ? "1" : "0"} y2="0">
                        <Stop offset="0" stopColor={palette.base} stopOpacity={1}/>
                        <Stop offset="1" stopColor={palette.base} stopOpacity={0}/>
                    </LinearGradient>
                </Defs>
                <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id}-fill)`}/>
            </Svg>
        </View>
    );
}

/**
 * A horizontal row of chips that says when there is more of it.
 *
 * The scroll runs to the screen edge and the inset lives inside it, so at rest
 * the first chip sits clear of the edge rather than cut by a padded parent.
 * Once the row is scrolled, or holds more than fits, a fade into the screen's
 * background covers the clipped end: a chip cut off with no hint read as a
 * layout mistake rather than as more to swipe to.
 */
export default function FadingRail({testID, inset, gap, children}: Props) {
    const [x, setX] = useState(0);
    const [width, setWidth] = useState(0);
    const [content, setContent] = useState(0);

    const startClipped = x > EDGE_SLACK;
    const endClipped = width > 0 && x + width < content - EDGE_SLACK;

    function onScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
        setX(event.nativeEvent.contentOffset.x);
    }

    return (
        <View style={{flexShrink: 1, flexGrow: 1}}>
            <ScrollView testID={testID} horizontal showsHorizontalScrollIndicator={false}
                        keyboardShouldPersistTaps="handled"
                        onScroll={onScroll} scrollEventThrottle={32}
                        onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
                        onContentSizeChange={(contentWidth) => setContent(contentWidth)}
                        contentContainerStyle={{gap, alignItems: "center", paddingHorizontal: inset}}>
                {children}
            </ScrollView>
            {startClipped && <Fade side="start"/>}
            {endClipped && <Fade side="end"/>}
        </View>
    );
}
