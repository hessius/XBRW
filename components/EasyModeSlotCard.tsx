import React, {useState} from "react";
import {View} from "react-native";
import {Button, Text, XStack, YStack} from "tamagui";
import Recipe from "@/library/Recipe";
import {resolveAccent} from "@/library/accent";
import {SLOT_NAMES, type SlotIndex, type SlotSnapshot} from "@/library/slots/slotModel";
import DotMatrixText from "@/components/DotMatrixText";
import PourProfile, {PROFILE_BLEED} from "@/components/PourProfile";
import XbrwSwitch from "@/components/XbrwSwitch";
import {useAppearance} from "@/hooks/useAppearance";
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
    onSetScaleEnabled?: (enabled: boolean) => boolean | void;
};

export function teaSlotFigures(recipe: Recipe, historicalProbe = false): string {
    if (recipe.pours.length > 1) {
        return `${recipe.pours.length} STEEPS · ${recipe.getPourTotalVolume()}ML · GRIND OFF`;
    }
    const pour = recipe.pours[0];
    return `1 STEEP · ${pour.volume}ML · ${pour.temperature}C · ${pour.pauseTime}S · GRIND ${
        historicalProbe && recipe.grinder ? recipe.grindSize : "OFF"}`;
}

export default function EasyModeSlotCard({
    index, snapshot, needsWrite, status, recovery, locked, updateProblem, changeRef, onChange, onUpdate,
    onSetScaleEnabled
}: Props) {
    const appearance = useAppearance();
    const {palette} = appearance;
    const [profileWidth, setProfileWidth] = useState(0);
    const name = SLOT_NAMES[index];
    const recipe = snapshot === null ? null : new Recipe(undefined, snapshot.recipeJSON);
    const probe = isTeaProbeSnapshot(snapshot);
    const colour = recipe === null ? null : appearance.recipe(resolveAccent(recipe));
    const ink = colour?.onAccent.text ?? palette.text;
    const accent = colour?.fill ?? palette.raised;
    const actionInk = colour?.keyInk.normal ?? palette.text;
    const actionFill = colour?.onAccent.key ?? palette.base;
    const scaleEnabled = snapshot?.scaleEnabled === true;
    const scaleLocked = locked || onSetScaleEnabled === undefined;
    return (
        <YStack testID={`slot-${name}`} gap={6} padding={14} borderRadius={18}
                backgroundColor={recipe === null ? palette.raised : accent}>
            <XStack testID={`slot-${name}-heading`} alignItems="center" justifyContent="space-between"
                gap="$2" flexWrap="wrap">
                <DotMatrixText fontSize={24} weight="bold" color={ink}>{name}</DotMatrixText>
                {snapshot !== null && !recovery && needsWrite && <DotMatrixText fontSize={11} weight="bold"
                    color={ink}>NOT WRITTEN</DotMatrixText>}
            </XStack>
            {snapshot !== null && <Text color={ink} fontSize={16} lineHeight={22} fontWeight="600">
                {snapshot.name}
            </Text>}
            {recipe !== null && <XStack testID={`slot-${name}-details`} alignItems="center"
                gap="$2" flexWrap="wrap">
                <DotMatrixText fontSize={11} weight="bold" color={ink}
                    style={{flexShrink: 1}}>
                    {recipe.isTea() ? teaSlotFigures(recipe, probe)
                        : `${recipe.dosage}G · 1:${recipe.ratio} · GRIND ${recipe.grinder ? recipe.grindSize : "OFF"}`}
                </DotMatrixText>
            </XStack>}
            {recipe !== null && !probe && <View testID={`slot-${name}-profile-band`}
                pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
                onLayout={event => setProfileWidth(event.nativeEvent.layout.width)}
                style={{height: 45, marginHorizontal: -14, overflow: "hidden"}}>
                {profileWidth > 0 && <View style={{position: "absolute", left: -PROFILE_BLEED, top: -PROFILE_BLEED}}>
                    <PourProfile testID={`slot-${name}-profile`} pours={recipe.pours} width={profileWidth} height={45}
                        stroke={colour?.onAccent.profileStroke} fill={colour?.onAccent.profileFill}
                        dot={colour?.onAccent.profileDot}/>
                </View>}
            </View>}
            <XStack testID={`slot-${name}-footer`} alignItems="center" justifyContent="space-between"
                gap="$3" flexWrap="wrap">
                {snapshot !== null && !probe && <XStack testID={`slot-${name}-scale`} alignItems="center"
                    gap="$3" minHeight={44} paddingVertical={10.5} flexWrap="wrap">
                    <DotMatrixText fontSize={11} weight="bold" color={ink}>
                        {scaleEnabled ? "SCALE ON" : "SCALE OFF"}
                    </DotMatrixText>
                    <XbrwSwitch accessibilityLabel={`Scale for slot ${name}`}
                        accessibilityHint="Automatically tares when this slot is started. Write to machine to apply."
                        checked={scaleEnabled} disabled={scaleLocked} ground="accent" displayFill={accent}
                        // The 46 x 23pt switch needs only vertical slop; parent padding prevents clipping.
                        hitSlop={{top: 10.5, bottom: 10.5, left: 0, right: 0}}
                        onCheckedChange={enabled => { if (!scaleLocked) onSetScaleEnabled?.(enabled); }}/>
                </XStack>}
                {!locked && <Button ref={changeRef} height="auto" minHeight={44} paddingVertical="$2"
                    paddingHorizontal="$3" borderRadius={8}
                    accessibilityLabel={`Change slot ${name} recipe`} onPress={onChange}
                    backgroundColor={actionFill} color={actionInk}>
                    <DotMatrixText fontSize={11} weight="bold" color={actionInk}>
                        {snapshot === null ? "CHOOSE RECIPE" : "CHANGE"}
                    </DotMatrixText>
                </Button>}
            </XStack>
            {!probe && status === "edited" && <YStack gap="$2">
                <DotMatrixText fontSize={11} weight="bold" color={ink}>RECIPE UPDATED</DotMatrixText>
                {!locked && <Button height="auto" minHeight={44} paddingVertical="$3"
                    accessibilityLabel={`Update slot ${name} from library`}
                    disabled={updateProblem !== null} onPress={onUpdate}
                    backgroundColor={actionFill} color={actionInk}>USE UPDATED RECIPE</Button>}
                {updateProblem !== null && <Text color={ink}>{updateProblem}</Text>}
            </YStack>}
            {!probe && status === "removed" && <DotMatrixText fontSize={11} weight="bold" color={ink}>
                REMOVED FROM LIBRARY
            </DotMatrixText>}
        </YStack>
    );
}
