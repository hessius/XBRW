import React from "react";
import {Button, Text, XStack, YStack} from "tamagui";
import Recipe from "@/library/Recipe";
import {resolveAccent} from "@/library/accent";
import {SLOT_NAMES, type SlotIndex, type SlotSnapshot} from "@/library/slots/slotModel";
import DotMatrixText from "@/components/DotMatrixText";
import PourProfile from "@/components/PourProfile";
import {onAccent, palette} from "@/constants/colors";

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

export default function EasyModeSlotCard({
    index, snapshot, needsWrite, status, recovery, locked, updateProblem, changeRef, onChange, onUpdate
}: Props) {
    const name = SLOT_NAMES[index];
    const recipe = snapshot === null ? null : new Recipe(undefined, snapshot.recipeJSON);
    const ink = recipe === null ? palette.text : onAccent.text;
    return (
        <YStack testID={`slot-${name}`} gap="$3" padding="$4" borderRadius="$4"
                backgroundColor={recipe === null ? palette.raised : resolveAccent(recipe)}>
            <XStack alignItems="flex-start" gap="$3">
                <DotMatrixText fontSize={32} weight="bold" color={ink}>{name}</DotMatrixText>
                <YStack flex={1} gap="$2">
                    {snapshot !== null && <Text color={ink} fontSize={20} fontWeight="600">
                        {snapshot.name}
                    </Text>}
                    {recipe !== null && <DotMatrixText fontSize={13} weight="bold" color={ink}>
                        {`${recipe.dosage}G · 1:${recipe.ratio} · GRIND ${recipe.grinder ? recipe.grindSize : "OFF"}`}
                    </DotMatrixText>}
                </YStack>
            </XStack>
            {recipe !== null && <PourProfile testID={`slot-${name}-profile`}
                pours={recipe.pours} width={220} height={48}/>}
            {snapshot !== null && !recovery && <DotMatrixText fontSize={11} weight="bold"
                letterSpacing={1.2} color={ink}>{needsWrite ? "NOT WRITTEN" : "LAST WRITTEN"}</DotMatrixText>}
            {status === "edited" && <YStack gap="$2">
                <DotMatrixText fontSize={11} weight="bold" color={ink}>RECIPE UPDATED</DotMatrixText>
                {!locked && <Button height="auto" minHeight={44} paddingVertical="$3"
                    accessibilityLabel={`Update slot ${name} from library`}
                    disabled={updateProblem !== null} onPress={onUpdate}
                    backgroundColor={palette.base} color={palette.text}>USE UPDATED RECIPE</Button>}
                {updateProblem !== null && <Text color={ink}>{updateProblem}</Text>}
            </YStack>}
            {status === "removed" && <DotMatrixText fontSize={11} weight="bold" color={ink}>
                REMOVED FROM LIBRARY
            </DotMatrixText>}
            {!locked && <Button ref={changeRef} height="auto" minHeight={44} paddingVertical="$3"
                accessibilityLabel={`Change slot ${name} recipe`} onPress={onChange}
                backgroundColor={palette.base} color={palette.text}>
                {snapshot === null ? "CHOOSE RECIPE" : "CHANGE"}
            </Button>}
        </YStack>
    );
}
