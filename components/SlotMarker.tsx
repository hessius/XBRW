import React from "react";
import {View} from "react-native";
import DotMatrixText from "@/components/DotMatrixText";
import {onAccent} from "@/constants/colors";
import type {SlotMarkerValue} from "@/library/slots/slotModel";

export default function SlotMarker({marker}: {marker?: SlotMarkerValue}) {
    if (marker === undefined) return null;
    return (
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <DotMatrixText testID="slot-marker" color={onAccent.marker} fontSize={11}
                           weight="extrabold" letterSpacing={1} numberOfLines={1}>
                {marker.slots.join(" ")}
            </DotMatrixText>
        </View>
    );
}
