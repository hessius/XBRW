import React from "react";
import {Text, XStack, YStack} from "tamagui";

import DeckSection from "@/components/DeckSection";
import DotMatrixText from "@/components/DotMatrixText";
import {useAppearance} from "@/hooks/useAppearance";
import {
    remainingLine,
    type BagReading,
    type BagTracker,
    type CoffeeBag
} from "@/library/coffeeBag";
import {freshnessLine, type FreshnessReading} from "@/library/restPeak";

export type BagSectionProps = {
    tracker: BagTracker;
    /** The open bag, or null when there is none. */
    bag: CoffeeBag | null;
    /** What is left, in `xbrw` mode only. Null in `beanconqueror` mode. */
    reading: BagReading | null;
    /**
     * How fresh the bag is today, in both tracker modes, or null without a
     * roast day and rest figures. Optional so older callers draw nothing.
     */
    freshness?: FreshnessReading | null;
    /** Where to buy it again, or undefined to draw no REORDER. */
    reorderUrl?: string;
    /** Opens the bag sheet: add when there is no bag, edit when there is. */
    onOpenSheet: () => void;
    onFinish: () => void;
    onReorder: (url: string) => void;
};

/** One quiet Doto button, the shape `PodSection`'s USE THIS NAME draws. */
function BagButton({label, spoken, hint, testID, onPress}: {
    label: string;
    spoken: string;
    hint?: string;
    testID: string;
    onPress: () => void;
}) {
    const {palette} = useAppearance();
    return (
        <XStack accessible accessibilityRole="button" accessibilityLabel={spoken}
                accessibilityHint={hint} testID={testID} onPress={onPress}
                paddingHorizontal="$3" paddingVertical="$2" borderRadius="$4"
                backgroundColor={palette.raised} borderWidth={1} borderColor={palette.line}
                pressStyle={{opacity: 0.7, scale: 0.99}}>
            <DotMatrixText fontSize={11} weight="bold" letterSpacing={1.4} color={palette.text}>
                {label}
            </DotMatrixText>
        </XStack>
    );
}

/**
 * `Roasted 2026-10-12.`, or nothing without a roast day. The day as stored,
 * in the same form the brew history writes its dates.
 */
function roastLine(bag: CoffeeBag): string | null {
    return bag.roastedOn === undefined ? null : `Roasted ${bag.roastedOn}.`;
}

/**
 * The bag of coffee this recipe is drawing on.
 *
 * In `xbrw` mode it is a reading: grams left and about how many brews, a
 * "Running low" line with REORDER once fewer than two doses remain, and an
 * offer to finish the bag once there is not enough for another brew. Finishing
 * keeps the bag and the brews; it only stops the count.
 *
 * In `beanconqueror` mode the bag lives in Beanconqueror, which subtracts each
 * brew it is handed, so this section says so and draws no estimate of its own.
 * REORDER stays whenever there is somewhere to reorder from, since nothing
 * here knows the bag is low.
 */
export default function BagSection({
    tracker, bag, reading, freshness, reorderUrl, onOpenSheet, onFinish, onReorder
}: BagSectionProps) {
    const {palette} = useAppearance();
    if (bag === null) {
        return (
            <DeckSection title="BAG" testID="about-bag">
                <Text testID="bag-none" fontSize={13} color={palette.dim}>
                    {tracker === "xbrw"
                        ? "Add the bag you bought to count down what is left as you brew."
                        : "Add the bag you bought and it goes to Beanconqueror, which counts it down as you send brews."}
                </Text>
                <XStack>
                    <BagButton label="I BOUGHT A BAG" spoken="I bought a bag" testID="bag-add"
                               onPress={onOpenSheet}/>
                </XStack>
            </DeckSection>
        );
    }

    const roast = roastLine(bag);
    const showReorder = reorderUrl !== undefined
        && (tracker === "beanconqueror" || reading?.low === true);

    return (
        <DeckSection title="BAG" testID="about-bag">
            <YStack gap="$1">
                {tracker === "xbrw" && reading !== null ? (
                    <Text testID="bag-remaining" fontSize={13} color={palette.text}>
                        {`${remainingLine(reading)}.`}
                    </Text>
                ) : (
                    <Text testID="bag-elsewhere" fontSize={13} color={palette.text}>
                        Bag tracked in Beanconqueror.
                    </Text>
                )}
                <Text testID="bag-facts" fontSize={12} color={palette.dim}>
                    {[`${bag.sizeGrams} g bag.`, roast].filter((part) => part !== null).join(" ")}
                </Text>
                {freshness !== undefined && freshness !== null && (
                    <Text testID="bag-freshness" fontSize={13}
                          color={freshness.state === "resting" || freshness.state === "past"
                              ? palette.dim : palette.text}>
                        {freshnessLine(freshness)}
                    </Text>
                )}
                {tracker === "xbrw" && reading?.low === true && !reading.empty && (
                    <Text testID="bag-low" fontSize={13} color={palette.warn}>
                        Running low.
                    </Text>
                )}
                {tracker === "xbrw" && reading?.empty === true && (
                    <Text testID="bag-empty" fontSize={13} color={palette.warn}>
                        Not enough left for another brew. Finished with this bag?
                    </Text>
                )}
            </YStack>
            <XStack gap="$2" flexWrap="wrap">
                {showReorder && (
                    <BagButton label="REORDER" spoken="Reorder this coffee"
                               hint="Opens the roaster's page in your browser."
                               testID="bag-reorder" onPress={() => onReorder(reorderUrl)}/>
                )}
                {tracker === "xbrw" && reading?.empty === true && (
                    <BagButton label="MARK FINISHED" spoken="Mark this bag finished"
                               hint="Stops counting this bag. Your brews stay in history."
                               testID="bag-finish" onPress={onFinish}/>
                )}
                <BagButton label="EDIT BAG" spoken="Edit bag" testID="bag-edit"
                           onPress={onOpenSheet}/>
            </XStack>
        </DeckSection>
    );
}
