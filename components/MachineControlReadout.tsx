import React from "react";
import {Button, Text, XStack, YStack} from "tamagui";
import DotMatrixText from "@/components/DotMatrixText";
import Stepper from "@/components/Stepper";
import {mix} from "@/constants/colors";
import {useAppearance} from "@/hooks/useAppearance";
import type {ControlPhase, NumericPolicy, ToolId} from "@/library/machine/controlModel";
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
            <DotMatrixText fontSize={11} weight="bold" letterSpacing={1.6} color={palette.muted}>{label}</DotMatrixText>
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
    note?: string | null;
    value: number | null;
    unit?: string;
    policy: NumericPolicy | null;
    editable: boolean;
    onChange: (value: number) => void;
};

export function MachineNumericControl({
    label, note, value, unit, policy, editable, onChange
}: MachineNumericControlProps) {
    const {palette} = useAppearance();
    return (
        <YStack gap="$2">
            {editable && value !== null && usableNumericPolicy(policy) ? (
                <XStack justifyContent="space-between" alignItems="center" gap="$3" paddingVertical="$3"
                        borderBottomWidth={1} borderBottomColor={palette.line}>
                    <YStack flex={1} minWidth={0} gap="$0.5">
                        <Text fontSize={15} fontWeight="600" color={palette.text}>{label}</Text>
                        {note ? <DotMatrixText fontSize={11} weight="bold" letterSpacing={1.4} color={palette.muted}>{note}</DotMatrixText> : null}
                    </YStack>
                    <Stepper label={label} value={value} unit={unit} {...policy} snapToStep onChange={onChange}/>
                </XStack>
            ) : <MachineControlReadout label={label} value={value} unit={unit} prominent={false}/>}
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
    tool?: ToolId;
    variant?: "full" | "inline";
    onStart: () => void;
    onStop: () => void;
};

/** Only an explicitly ready tool may start. Tapping Stop transitions immediately to outlined Stopping…. */
export function MachineToolActions({
    phase, startDisabled, stopUnavailable, tool, variant = "full", onStart, onStop
}: MachineToolActionsProps) {
    const {palette, onBrand, onFill} = useAppearance();
    const upper = tool ? ` ${tool.toUpperCase()}` : "";
    const isFull = variant === "full";
    const startBg = isFull ? palette.brandFill : palette.success;
    const startInk = isFull ? onBrand.text : onFill(palette.success).text;
    const height = isFull ? 48 : 42;
    const dockStyle = isFull ? {borderTopWidth: 1, borderTopColor: palette.line} : undefined;

    if (phase === "stopping") {
        const label = `STOPPING${upper}…`;
        return (
            <YStack gap="$2" paddingTop={isFull ? "$3" : "$2"} style={dockStyle}>
                <Button
                    accessibilityRole="button"
                    accessibilityLabel={label}
                    accessibilityState={{busy: true, disabled: true}}
                    disabled
                    minHeight={height}
                    height="auto"
                    padding="$3"
                    borderRadius="$4"
                    backgroundColor={mix(palette.raised, palette.danger, 0.14)}
                    color={palette.danger}
                    style={{borderWidth: 1, borderColor: palette.danger}}>
                    <DotMatrixText fontSize={isFull ? 13 : 12} weight="extrabold" letterSpacing={1.8} color={palette.danger}>
                        {label}
                    </DotMatrixText>
                </Button>
            </YStack>
        );
    }

    const stopOnly = ["starting", "running", "unknown"].includes(phase);
    if (stopOnly) {
        const label = `STOP${upper}`;
        return (
            <YStack gap="$2" paddingTop={isFull ? "$3" : "$2"} style={dockStyle}>
                {stopUnavailable !== null && <Text color={palette.muted}>{stopUnavailable}</Text>}
                <Button
                    accessibilityRole="button"
                    accessibilityLabel={label}
                    disabled={stopUnavailable !== null}
                    onPress={onStop}
                    minHeight={height}
                    height="auto"
                    padding="$3"
                    borderRadius="$4"
                    backgroundColor={palette.danger}
                    color={onFill(palette.danger).text}>
                    <DotMatrixText fontSize={isFull ? 13 : 12} weight="extrabold" letterSpacing={1.8}
                                   color={onFill(palette.danger).text}>
                        {label}
                    </DotMatrixText>
                </Button>
            </YStack>
        );
    }

    const entering = phase === "entering" || phase === "leaving" || phase === "applying";
    const label = entering ? `${phase === "leaving" ? "CLOSING" : "ENTERING"}${upper}…` : `START${upper}`;
    const disabled = phase !== "ready" || startDisabled;
    return (
        <YStack gap="$2" paddingTop={isFull ? "$3" : "$2"} style={dockStyle}>
            <Button
                accessibilityRole="button"
                accessibilityLabel={label}
                accessibilityState={{busy: entering, disabled}}
                disabled={disabled}
                onPress={onStart}
                minHeight={height}
                height="auto"
                padding="$3"
                borderRadius="$4"
                opacity={entering || disabled ? 0.48 : 1}
                backgroundColor={startBg}
                color={startInk}>
                <DotMatrixText fontSize={isFull ? 13 : 12} weight="extrabold" letterSpacing={1.8} color={startInk}>
                    {label}
                </DotMatrixText>
            </Button>
        </YStack>
    );
}
