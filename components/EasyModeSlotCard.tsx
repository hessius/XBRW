import React from "react";
import {View} from "react-native";
import {Button, Text, XStack, YStack} from "tamagui";
import Recipe from "@/library/Recipe";
import {resolveAccent} from "@/library/accent";
import {SLOT_NAMES, type SlotIndex, type SlotSnapshot} from "@/library/slots/slotModel";
import DotMatrixText from "@/components/DotMatrixText";
import PourProfile from "@/components/PourProfile";
import {onAccent, palette} from "@/constants/colors";
import {isTeaProbeSnapshot} from "@/library/slots/teaSlotCandidate";

type Props = {
    index: SlotIndex;
    snapshot: SlotSnapshot | null;
    needsWrite: boolean;
    status: "unchanged" | "edited" | "removed" | null;
    recovery: boolean;
    locked: boolean;
    updateProblem: string | null;
    changeRef?: React.Ref<React.ComponentRef<typeof Button>>;
    onChange: () => void;
    onUpdate: () => void;
};

function teaProbeFigures(recipe: Recipe): string {
    const pour = recipe.pours[0];
    return `1 STEEP · ${pour.volume}ML · ${pour.temperature}C · ${pour.pauseTime}S · GRIND ${
        recipe.grinder ? recipe.grindSize : "OFF"}`;
}

export default function EasyModeSlotCard({
    index, snapshot, needsWrite, status, recovery, locked, updateProblem, changeRef, onChange, onUpdate
}: Props) {
    const name = SLOT_NAMES[index];
    const recipe = snapshot === null ? null : new Recipe(undefined, snapshot.recipeJSON);
    const probe = isTeaProbeSnapshot(snapshot);
    const ink = recipe === null ? palette.text : onAccent.text;
    const accent = recipe === null ? palette.text : resolveAccent(recipe);
    return (
        <YStack testID={`slot-${name}`} gap={6} padding={14} borderRadius={18}
                backgroundColor={recipe === null ? palette.raised : accent}>
            {recipe !== null && !probe && <View testID={`slot-${name}-profile-watermark`}
                pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
                style={{position: "absolute", right: 14, top: 42, opacity: 0.22}}>
                <PourProfile testID={`slot-${name}-profile`} pours={recipe.pours} width={100} height={30}/>
            </View>}
            <XStack testID={`slot-${name}-heading`} alignItems="center" justifyContent="space-between"
                gap="$2" flexWrap="wrap">
                <DotMatrixText fontSize={24} weight="bold" color={ink}>{name}</DotMatrixText>
                {snapshot !== null && !recovery && <DotMatrixText fontSize={11} weight="bold"
                    color={ink}>{needsWrite ? "NOT WRITTEN" : "LAST WRITTEN"}</DotMatrixText>}
            </XStack>
            {snapshot !== null && <Text color={ink} fontSize={16} lineHeight={22} fontWeight="600">
                {snapshot.name}
            </Text>}
            <XStack testID={`slot-${name}-details`} alignItems="center" justifyContent="space-between"
                gap="$2" flexWrap="wrap">
                {recipe !== null && <DotMatrixText fontSize={11} weight="bold" color={ink}
                    style={{flexShrink: 1}}>
                    {probe ? teaProbeFigures(recipe)
                        : `${recipe.dosage}G · 1:${recipe.ratio} · GRIND ${recipe.grinder ? recipe.grindSize : "OFF"}`}
                </DotMatrixText>}
                {!locked && <Button ref={changeRef} height="auto" minHeight={44} paddingVertical="$2"
                    paddingHorizontal="$3" borderRadius={8}
                    accessibilityLabel={`Change slot ${name} recipe`} onPress={onChange}
                    backgroundColor={palette.base} color={accent}>
                    <DotMatrixText fontSize={11} weight="bold" color={accent}>
                        {snapshot === null ? "CHOOSE RECIPE" : "CHANGE"}
                    </DotMatrixText>
                </Button>}
            </XStack>
            {!probe && status === "edited" && <YStack gap="$2">
                <DotMatrixText fontSize={11} weight="bold" color={ink}>RECIPE UPDATED</DotMatrixText>
                {!locked && <Button height="auto" minHeight={44} paddingVertical="$3"
                    accessibilityLabel={`Update slot ${name} from library`}
                    disabled={updateProblem !== null} onPress={onUpdate}
                    backgroundColor={palette.base} color={accent}>USE UPDATED RECIPE</Button>}
                {updateProblem !== null && <Text color={ink}>{updateProblem}</Text>}
            </YStack>}
            {!probe && status === "removed" && <DotMatrixText fontSize={11} weight="bold" color={ink}>
                REMOVED FROM LIBRARY
            </DotMatrixText>}
        </YStack>
    );
}
