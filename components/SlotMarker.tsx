import React from "react";
import {View} from "react-native";
import DotMatrixText from "@/components/DotMatrixText";
import {useAppearance} from "@/hooks/useAppearance";
import type {SlotMarkerValue} from "@/library/slots/slotModel";

export default function SlotMarker({marker, color}: {marker?: SlotMarkerValue; color?: string}) {
    const {palette} = useAppearance();
    if (marker === undefined) return null;
    return (
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <DotMatrixText testID="slot-marker" color={color ?? palette.text} fontSize={11}
                           weight="extrabold" letterSpacing={1} numberOfLines={1}>
                {marker.slots.join(" ")}
            </DotMatrixText>
        </View>
    );
}
