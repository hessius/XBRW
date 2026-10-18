import React, {useState} from "react";
import {Pressable} from "react-native";
import {Text, XStack, YStack} from "tamagui";

import DotMatrixText from "@/components/DotMatrixText";
import XbrwSheet from "@/components/XbrwSheet";
import {onAccent, palette} from "@/constants/colors";
import type {RoasterShelfState} from "@/hooks/useRoasterShelf";

const BUTTON_HEIGHT = 48;
const BOX = 20;
const BAR_HEIGHT = 4;

/**
 * Offers a subscription to a roaster's shelf, then shows its coffees arriving.
 *
 * Asked after an import link that names a roaster feed (`useRoasterShelf`).
 * One sheet for both halves, the question and the progress, so accepting
 * does not close one sheet and open another over the same screen.
 *
 * The opt-out is a tick rather than a third button. "Not now" and "never"
 * are both a no, and a row of three equal buttons makes the permanent one
 * as easy to hit by accident as the polite one.
 */
export default function RoasterShelfSheet({state, onAccept, onDecline, onCancel}: {
    state: RoasterShelfState;
    onAccept: (dontAskAgain: boolean) => void;
    onDecline: (dontAskAgain: boolean) => void;
    onCancel: () => void;
}) {
    const [dontAsk, setDontAsk] = useState(false);
    const open = state.phase !== "idle";
    // Kept while the sheet animates away, so it has something to draw.
    const [lastPlan, setLastPlan] = useState(state.phase === "idle" ? null : state.plan);
    const plan = state.phase === "idle" ? lastPlan : state.plan;
    if (state.phase !== "idle" && state.plan !== lastPlan) setLastPlan(state.plan);

    const roaster = plan?.roaster ?? "";
    // Kept with the plan for the same reason: the question's count.
    const [lastCount, setLastCount] = useState(state.phase === "offer" ? state.count : 0);
    if (state.phase === "offer" && state.count !== lastCount) setLastCount(state.count);
    const count = lastCount;
    const title = `Subscribe to ${roaster}?`;

    function answer(accepted: boolean) {
        const choice = dontAsk;
        setDontAsk(false);
        if (accepted) onAccept(choice);
        else onDecline(choice);
    }

    return (
        <XbrwSheet open={open} title={title} heightPercent={40}
                   onOpenChange={(next) => {
                       if (next) return;
                       // Dismissing the question is "not now". Dismissing the
                       // progress is stopping it: a sheet that closed while
                       // the work carried on out of sight would leave nothing
                       // on screen to stop it with.
                       if (state.phase === "adding") onCancel();
                       else if (state.phase === "offer") answer(false);
                   }}>
            {state.phase === "adding"
                ? <Adding done={state.done} total={state.total} onCancel={onCancel}/>
                : (
                    <YStack gap="$3" paddingHorizontal="$4" paddingBottom="$4">
                        <Text fontSize={13} color={palette.dim}>
                            {(count === 1
                                ? `Keep this ${roaster} coffee on a shelf. `
                                : `Keep all ${count} ${roaster} coffees on a shelf. `)
                                + "New coffees are added and sold-out ones are marked, "
                                + "automatically."}
                        </Text>

                        <Pressable accessibilityRole="checkbox"
                                   accessibilityState={{checked: dontAsk}}
                                   accessibilityLabel="Don't ask again for this roaster"
                                   testID="roaster-shelf-dont-ask"
                                   hitSlop={8}
                                   onPress={() => setDontAsk((was) => !was)}>
                            <XStack alignItems="center" gap="$3" minHeight={44}>
                                <XStack width={BOX} height={BOX} borderRadius={4}
                                        borderWidth={1.5}
                                        borderColor={dontAsk ? palette.text : palette.dim}
                                        alignItems="center" justifyContent="center">
                                    {dontAsk && (
                                        <YStack width={BOX - 10} height={BOX - 10}
                                                borderRadius={2}
                                                backgroundColor={palette.text}/>
                                    )}
                                </XStack>
                                <Text fontSize={13} color={palette.text} flexShrink={1}>
                                    Don&apos;t ask again for this roaster
                                </Text>
                            </XStack>
                        </Pressable>

                        <Pressable accessibilityRole="button"
                                   accessibilityLabel={`Subscribe to ${roaster}`}
                                   testID="roaster-shelf-subscribe"
                                   onPress={() => answer(true)}>
                            <XStack height={BUTTON_HEIGHT} alignItems="center"
                                    justifyContent="center" borderRadius="$4"
                                    backgroundColor={palette.text}>
                                <DotMatrixText fontSize={13} weight="bold" letterSpacing={1.5}
                                               color={onAccent.text}>
                                    SUBSCRIBE
                                </DotMatrixText>
                            </XStack>
                        </Pressable>

                        <Pressable accessibilityRole="button"
                                   accessibilityLabel="Not now"
                                   testID="roaster-shelf-not-now"
                                   onPress={() => answer(false)}>
                            <XStack height={BUTTON_HEIGHT} alignItems="center"
                                    justifyContent="center" borderRadius="$4"
                                    borderWidth={1} borderColor={palette.line}>
                                <DotMatrixText fontSize={13} weight="bold" letterSpacing={1.5}
                                               color={palette.dim}>
                                    NOT NOW
                                </DotMatrixText>
                            </XStack>
                        </Pressable>
                    </YStack>
                )}
        </XbrwSheet>
    );
}

/** The progress half: a count, a bar, and the way to stop. */
function Adding({done, total, onCancel}: {
    done: number;
    total: number;
    onCancel: () => void;
}) {
    // The one being added, not the ones finished: "Adding 1 of 12" is true
    // the moment it starts, and "Adding 0 of 12" never is.
    const current = Math.min(done + 1, total);
    const share = total > 0 ? done / total : 0;
    return (
        <YStack gap="$3" paddingHorizontal="$4" paddingBottom="$4">
            <YStack accessible accessibilityLiveRegion="polite"
                    accessibilityLabel={`Adding ${current} of ${total}`}
                    testID="roaster-shelf-progress">
                <DotMatrixText fontSize={13} weight="bold" letterSpacing={1.5}
                               color={palette.text}>
                    {`ADDING ${current} OF ${total}`}
                </DotMatrixText>
            </YStack>
            <XStack height={BAR_HEIGHT} borderRadius={BAR_HEIGHT / 2}
                    backgroundColor={palette.line} overflow="hidden"
                    accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                <YStack width={`${Math.round(share * 100)}%`} backgroundColor={palette.text}/>
            </XStack>
            <Text fontSize={13} color={palette.dim}>
                Coffees already added stay if you stop.
            </Text>
            <Pressable accessibilityRole="button"
                       accessibilityLabel="Stop adding"
                       testID="roaster-shelf-stop"
                       onPress={onCancel}>
                <XStack height={BUTTON_HEIGHT} alignItems="center"
                        justifyContent="center" borderRadius="$4"
                        borderWidth={1} borderColor={palette.line}>
                    <DotMatrixText fontSize={13} weight="bold" letterSpacing={1.5}
                                   color={palette.dim}>
                        STOP
                    </DotMatrixText>
                </XStack>
            </Pressable>
        </YStack>
    );
}
