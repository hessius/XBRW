import React from "react";
import {Button, Text, YStack} from "tamagui";
import DotMatrixText from "@/components/DotMatrixText";
import Stepper from "@/components/Stepper";
import {useAppearance} from "@/hooks/useAppearance";
import type {ControlPhase, NumericPolicy} from "@/library/machine/controlModel";
import {editableNumericLadder} from "@/library/numericLadder";

export type MachineControlReadoutProps = {
    label: string;
    value: number | string | null;
    unit?: string;
    unavailable?: string;
    prominent?: boolean;
};

/** Unbounded text layout: the number may wrap rather than crop at large type. */
export default function MachineControlReadout({
    label, value, unit, unavailable = "Unavailable", prominent = true
}: MachineControlReadoutProps) {
    const {palette} = useAppearance();
    const available = value !== null;
    const display = available ? `${value}${unit ? ` ${unit}` : ""}` : unavailable;
    return (
        <YStack testID="machine-control-readout" accessible accessibilityRole="text"
                accessibilityLabel={`${label}: ${display}`} accessibilityLiveRegion="none" gap="$2">
            <Text color={palette.muted}>{label}</Text>
            <DotMatrixText testID="machine-control-value" fontSize={available && prominent ? 56 : 22}
                           color={available ? palette.text : palette.muted}
                           style={{flexShrink: 1}}>
                {available ? `${value}${unit ? ` ${unit.toUpperCase()}` : ""}` : unavailable}
            </DotMatrixText>
        </YStack>
    );
}

export function usableNumericPolicy(policy: NumericPolicy | null): policy is NumericPolicy {
    return policy !== null && editableNumericLadder(policy);
}

export type MachineNumericControlProps = {
    label: string;
    value: number | null;
    unit?: string;
    policy: NumericPolicy | null;
    editable: boolean;
    onChange: (value: number) => void;
};

export function MachineNumericControl({
    label, value, unit, policy, editable, onChange
}: MachineNumericControlProps) {
    const {palette} = useAppearance();
    return (
        <YStack gap="$2">
            {editable && value !== null && usableNumericPolicy(policy) ? <>
                <Text color={palette.muted}>{label}</Text>
                <Stepper label={label} value={value} unit={unit} {...policy} snapToStep onChange={onChange}/>
            </> : <MachineControlReadout label={label} value={value} unit={unit} prominent={false}/>}
            {editable && !usableNumericPolicy(policy) && <Text color={palette.muted}>
                {`${label} control is unavailable: no qualified range.`}
            </Text>}
        </YStack>
    );
}

export type MachineToolActionsProps = {
    phase: ControlPhase;
    startDisabled: boolean;
    stopUnavailable: string | null;
    onStart: () => void;
    onStop: () => void;
};

/** Only an explicitly ready tool may start. Uncertain active work keeps Stop. */
export function MachineToolActions({
    phase, startDisabled, stopUnavailable, onStart, onStop
}: MachineToolActionsProps) {
    const {palette, primary} = useAppearance();
    const stopOnly = ["starting", "running", "stopping", "unknown"].includes(phase);
    return (
        <YStack gap="$2" paddingTop="$4">
            {stopOnly ? <>
                {stopUnavailable !== null && <Text color={palette.muted}>{stopUnavailable}</Text>}
                <Button accessibilityRole="button" disabled={stopUnavailable !== null}
                        onPress={onStop} minHeight={48} height="auto" padding="$3"
                        backgroundColor={palette.danger} color={palette.base}>
                    Stop
                </Button>
            </> : <Button accessibilityRole="button" disabled={phase !== "ready" || startDisabled}
                          onPress={onStart} minHeight={48} height="auto" padding="$3"
                          backgroundColor={primary.fill} color={primary.ink}>
                Start
            </Button>}
        </YStack>
    );
}
