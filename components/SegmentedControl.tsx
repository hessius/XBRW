import React from "react";
import {Pressable} from "react-native";
import {Text, XStack} from "tamagui";

import DotIcon from "@/components/DotIcon";
import {useAppearance} from "@/hooks/useAppearance";
import type {DotIconName} from "@/constants/dotIcons";

export type SegmentOption = {
    value: string;
    label: string;
    /**
     * Draw this glyph instead of the label.
     *
     * For a pair that has to survive in a row of other controls: the library
     * rail's view pair would spend a third of the row on two words. The label is
     * still required and is still what a screen reader announces, so the control
     * loses nothing but ink.
     */
    icon?: DotIconName;
};

/** The glyph size in an icon segment, matching a rail chip's. */
const ICON_SIZE = 18;

type Props = {
    value: string;
    options: readonly SegmentOption[];
    onChange: (value: string) => void;
    /** Canonical recipe accent for recipe-local choices; absent is neutral. */
    accent?: string;
    /**
     * Names the group for a screen reader. The editor's `FieldRow` names the
     * control through its `HelpTopic`; a settings row has only a plain `Text`
     * sibling, which nothing connects to the segments, so it passes its label
     * down here instead.
     */
    accessibilityLabel?: string;
};

/**
 * A short list of options, one of which is on.
 *
 * Lifted out of `SegmentedRow`, which pairs it with a `FieldRow` and so requires
 * a `HelpTopic`. Settings has options to offer and no help topics to name them
 * by, and inventing one would put a settings row into the recipe editor's help
 * sheet. The chrome and the control are two responsibilities; this is the
 * control.
 */
export default function SegmentedControl({
    value, options, onChange, accent, accessibilityLabel
}: Props) {
    const appearance = useAppearance();
    const {selection, palette} = appearance;
    const recipe = accent === undefined ? undefined : appearance.recipe(accent);
    return (
        // No `accessible` here. On iOS that would collapse the group into a
        // single element and hide the segments inside it, leaving a control
        // that announces both labels and can activate neither.
        <XStack accessibilityRole="radiogroup" accessibilityLabel={accessibilityLabel}
                backgroundColor={palette.raised}
                borderRadius="$3" padding={2} gap={2}>
            {options.map((option) => {
                const selected = option.value === value;
                return (
                    <Pressable key={option.value} accessibilityRole="radio"
                               accessibilityLabel={option.label}
                               accessibilityState={{checked: selected}}
                               style={({pressed}) => ({
                                   opacity: 1,
                                   transform: [{scale: pressed && recipe !== undefined ? 0.98 : 1}]
                               })}
                               onPress={() => onChange(option.value)}>
                        {({pressed}) => {
                            const fill = selected
                                ? recipe?.fill ?? (pressed ? selection.pressedFill : selection.fill)
                                : pressed ? palette.surface : palette.none;
                            const ink = selected ? recipe?.onAccent.text ?? selection.ink : palette.dim;
                            return option.icon ? (
                                <XStack paddingHorizontal="$2.5" paddingVertical="$2"
                                        borderRadius="$2" backgroundColor={fill}>
                                    <DotIcon name={option.icon} size={ICON_SIZE} color={ink}/>
                                </XStack>
                            ) : (
                                <Text fontSize={11} fontWeight="600"
                                      paddingHorizontal="$2.5" paddingVertical="$1.5"
                                      borderRadius="$2" backgroundColor={fill} color={ink}>
                                    {option.label}
                                </Text>
                            );
                        }}
                    </Pressable>
                );
            })}
        </XStack>
    );
}
