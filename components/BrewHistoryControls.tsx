import React from "react";
import {Pressable, ScrollView} from "react-native";
import {XStack, YStack} from "tamagui";

import DotIcon from "@/components/DotIcon";
import DotMatrixText from "@/components/DotMatrixText";
import SegmentedControl from "@/components/SegmentedControl";
import XbrwSheet from "@/components/XbrwSheet";
import {palette} from "@/constants/colors";
import {
    HISTORY_SORTS, isHistorySortDirection,
    type HistoryQuery, type HistorySort, type HistorySortDirection
} from "@/library/brew/historyQuery";

const LABELS: Record<HistorySort, string> = {
    date: "Date", rating: "Rating", dose: "Dose", ratio: "Ratio", grind: "Grind"
};
const DIRECTIONS: Record<HistorySort, {asc: string; desc: string}> = {
    date: {asc: "OLDEST", desc: "NEWEST"},
    rating: {asc: "LOWEST", desc: "HIGHEST"},
    dose: {asc: "LOWEST", desc: "HIGHEST"},
    ratio: {asc: "LOWEST", desc: "HIGHEST"},
    grind: {asc: "FINEST", desc: "COARSEST"}
};

type SortProps = {
    sort: HistorySort;
    direction: HistorySortDirection;
    onSortChange: (sort: HistorySort, direction: HistorySortDirection) => void;
};

export default function BrewHistoryControls({
    query, onToggleHideUnsuccessful, onToggleRatedOnly, onOpenSort
}: {
    query: HistoryQuery;
    onToggleHideUnsuccessful: () => void;
    onToggleRatedOnly: () => void;
    onOpenSort: () => void;
}) {
    const {sort, direction, hideUnsuccessful, ratedOnly} = query;
    return (
        <XStack paddingHorizontal="$4" paddingVertical="$2" gap="$2" flexWrap="wrap">
            {[
                {label: "Hide unsuccessful", checked: hideUnsuccessful, onPress: onToggleHideUnsuccessful},
                {label: "Rated only", checked: ratedOnly, onPress: onToggleRatedOnly}
            ].map(({label, checked, onPress}) => (
                <XStack key={label} accessible accessibilityRole="checkbox" accessibilityLabel={label}
                        accessibilityState={{checked}} onPress={onPress}
                        minHeight={44} paddingVertical="$2" paddingHorizontal="$3"
                        alignItems="center" flexShrink={1} borderRadius="$4" borderWidth={1}
                        borderColor={checked ? palette.text : palette.line}
                        pressStyle={{opacity: 0.7}}
                        backgroundColor={checked ? palette.text : palette.none}>
                    <DotMatrixText fontSize={11} weight="bold"
                                   color={checked ? palette.base : palette.dim}>
                        {label.toUpperCase()}
                    </DotMatrixText>
                </XStack>
            ))}
            <XStack accessible accessibilityRole="button" accessibilityLabel="Sort brew history"
                    onPress={onOpenSort} minHeight={44} paddingVertical="$2" paddingHorizontal="$3"
                    alignItems="center" flexShrink={1} borderRadius="$4" borderWidth={1}
                    borderColor={palette.line} pressStyle={{opacity: 0.7}}>
                <DotMatrixText fontSize={11} weight="bold" color={palette.dim}>
                    {`${LABELS[sort].toUpperCase()} / ${DIRECTIONS[sort][direction]}`}
                </DotMatrixText>
            </XStack>
        </XStack>
    );
}

export function BrewHistorySortSheet({
    open, onOpenChange, sort, direction, onSortChange
}: SortProps & {open: boolean; onOpenChange: (open: boolean) => void}) {
    const labels = DIRECTIONS[sort];
    return (
        <XbrwSheet open={open} onOpenChange={onOpenChange} title="Sort brew history">
            <ScrollView testID="history-sort-scroll" contentContainerStyle={{paddingBottom: 16}}>
                <YStack gap="$4">
                    <YStack accessibilityRole="radiogroup" accessibilityLabel="Sort by" gap="$2">
                        {HISTORY_SORTS.map((axis) => {
                            const selected = sort === axis;
                            return (
                                <Pressable key={axis} accessibilityRole="radio"
                                           accessibilityLabel={LABELS[axis]}
                                           accessibilityState={{checked: selected}}
                                           onPress={() => onSortChange(axis,
                                               axis === "date" || axis === "rating" ? "desc" : "asc")}>
                                    <XStack minHeight={44} padding="$3" borderRadius="$4"
                                            alignItems="center" justifyContent="space-between" gap="$3"
                                            backgroundColor={selected ? palette.raised : undefined}>
                                        <DotMatrixText fontSize={12} weight="bold" letterSpacing={1.8}
                                                       color={selected ? palette.text : palette.dim}>
                                            {LABELS[axis].toUpperCase()}
                                        </DotMatrixText>
                                        {selected && <DotIcon name="success" size={14} color={palette.text}/>}
                                    </XStack>
                                </Pressable>
                            );
                        })}
                    </YStack>
                    <YStack gap="$2">
                        <DotMatrixText fontSize={10} weight="bold" letterSpacing={2} color={palette.muted}>
                            DIRECTION
                        </DotMatrixText>
                        <SegmentedControl value={direction}
                            options={[{value: "asc", label: labels.asc}, {value: "desc", label: labels.desc}]}
                            accessibilityLabel="History sort direction"
                            onChange={(value) => {
                                if (isHistorySortDirection(value)) onSortChange(sort, value);
                            }}/>
                    </YStack>
                </YStack>
            </ScrollView>
        </XbrwSheet>
    );
}
