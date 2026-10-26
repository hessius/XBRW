import {useAppearance} from "@/hooks/useAppearance";
import React, {useState} from "react";
import {Pressable, ScrollView} from "react-native";
import {XStack, YStack} from "tamagui";

import DotIcon from "@/components/DotIcon";
import DotMatrixText from "@/components/DotMatrixText";
import FillLabel from "@/components/FillLabel";
import RailChip, {CHIP_HEIGHT} from "@/components/RailChip";
import SegmentedControl from "@/components/SegmentedControl";
import XbrwSheet from "@/components/XbrwSheet";

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

const CHIP_GAP = 8;

function filterAccessibilityLabel(count: number, open: boolean): string {
    const applied = count === 0 ? "No filters applied"
        : count === 1 ? "1 filter applied" : `${count} filters applied`;
    return `${applied}. Tap to ${open ? "hide" : "show"} the filter row.`;
}

export default function BrewHistoryControls({
    query, editing, onToggleEdit, onToggleHideUnsuccessful, onToggleRatedOnly, onOpenSort
}: {
    query: HistoryQuery;
    editing: boolean;
    /** Absent when there is nothing to edit. */
    onToggleEdit?: () => void;
    onToggleHideUnsuccessful: () => void;
    onToggleRatedOnly: () => void;
    onOpenSort: () => void;
}) {
    const appearance = useAppearance();
    const {palette} = appearance;
    const onAccent = appearance.onFill(palette.text);
    const {sort, direction, hideUnsuccessful, ratedOnly} = query;
    const [filtersOpen, setFiltersOpen] = useState(false);
    const count = Number(hideUnsuccessful) + Number(ratedOnly);
    const sortChanged = sort !== "date" || direction !== "desc";
    const filters = [
        {label: "HIDE UNSUCCESSFUL", spoken: "Hide unsuccessful", checked: hideUnsuccessful,
            onPress: onToggleHideUnsuccessful, testID: "history-filter-unsuccessful"},
        {label: "RATED ONLY", spoken: "Rated only", checked: ratedOnly,
            onPress: onToggleRatedOnly, testID: "history-filter-rated"}
    ];
    return (
        <YStack paddingHorizontal="$4" paddingVertical="$2" gap={CHIP_GAP} testID="history-rail">
            <XStack alignItems="center" justifyContent="space-between" gap={CHIP_GAP}>
                <XStack gap={CHIP_GAP} flexShrink={1}>
                    <RailChip testID="history-sort" icon="sort" active={sortChanged}
                              label={sortChanged ? LABELS[sort].toUpperCase() : undefined}
                              accessibilityLabel={`Sort brew history. ${LABELS[sort]}, ${DIRECTIONS[sort][direction].toLowerCase()} first.`}
                              onPress={onOpenSort}/>
                    <RailChip testID="history-filter-toggle" icon="filter" active={count > 0}
                              label={String(count)} expanded={filtersOpen} caretOpen={filtersOpen}
                              accessibilityLabel={filterAccessibilityLabel(count, filtersOpen)}
                              onPress={() => setFiltersOpen((open) => !open)}/>
                </XStack>
                {onToggleEdit !== undefined && (
                    <RailChip testID="history-edit" icon="edit" active={editing}
                              accessibilityLabel={editing ? "Done editing" : "Edit brews"}
                              onPress={onToggleEdit}/>
                )}
            </XStack>
            {filtersOpen && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false}
                            testID="history-filter-row" accessibilityLabel="Brew filters"
                            contentContainerStyle={{gap: CHIP_GAP}}>
                    {filters.map(({label, spoken, checked, onPress, testID}) => (
                        <XStack key={label} testID={testID} accessible accessibilityRole="checkbox"
                                accessibilityLabel={spoken} accessibilityState={{checked}}
                                onPress={onPress} height={CHIP_HEIGHT} paddingHorizontal={12}
                                alignItems="center" borderRadius="$4" borderWidth={1}
                                borderColor={checked ? palette.text : palette.line}
                                backgroundColor={checked ? palette.text : palette.none}
                                pressStyle={{opacity: 0.7}}>
                            <FillLabel filled={checked} fontSize={12} letterSpacing={1.5}
                                       color={checked ? onAccent.text : palette.text}>
                                {label}
                            </FillLabel>
                        </XStack>
                    ))}
                </ScrollView>
            )}
        </YStack>
    );
}

export function BrewHistorySortSheet({
    open, onOpenChange, sort, direction, onSortChange
}: SortProps & {open: boolean; onOpenChange: (open: boolean) => void}) {
    const appearance = useAppearance();
    const {palette} = appearance;
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
