import React from "react";
import {Button, ScrollView, Text, XStack, YStack} from "tamagui";
import MachineControlReadout, {MachineNumericControl, MachineToolActions} from "@/components/MachineControlReadout";
import PourGlyph from "@/components/PourGlyph";
import {useAppearance} from "@/hooks/useAppearance";
import {
    validatePourRequest, type ControlPhase, type Pattern, type PourPolicy, type PourRequest
} from "@/library/machine/controlModel";

export type QualifiedLiveControl<T> =
    | {qualified: false; reason: string}
    | {qualified: true; onChange: (value: T) => void; error: string | null};

export type PourToolProps = {
    phase: ControlPhase;
    request: PourRequest | null;
    policy: PourPolicy | null;
    dispensedMl: number | null;
    /** Confirmed observations, not the request or an optimistic local edit. */
    temperatureC: number | null;
    pattern: Pattern | null;
    pendingTemperatureC?: number | null;
    pendingPattern?: Pattern | null;
    /** Omission explicitly disables live mutation; a start policy does not qualify it. */
    liveTemperature?: QualifiedLiveControl<number>;
    livePattern?: QualifiedLiveControl<Pattern>;
    unavailable: string | null;
    stopUnavailable: string | null;
    error: string | null;
    onRequestChange: (request: PourRequest) => void;
    /** Owner chooses any target value; this view never invents one on a mode switch. */
    onModeChange: (mode: PourRequest["mode"]) => void;
    onStart: () => void;
    onStop: () => void;
};

const PATTERN_LABELS: Record<Pattern, string> = {
    centered: "Centred", circular: "Circular", spiral: "Spiral"
};

/** Mount in a bounded flex body: parameters scroll independently of Stop. */
export default function PourTool({
    phase, request, policy, dispensedMl, temperatureC, pattern,
    pendingTemperatureC = null, pendingPattern = null, liveTemperature, livePattern,
    unavailable, stopUnavailable, error, onRequestChange, onModeChange, onStart, onStop
}: PourToolProps) {
    const {palette, selection} = useAppearance();
    const ready = phase === "ready";
    const active = ["starting", "running", "stopping", "unknown"].includes(phase);
    const editable = ready && unavailable === null && policy !== null;
    const temperatureEditable = phase === "running" && unavailable === null
        && liveTemperature?.qualified === true && pendingTemperatureC === null;
    const patternEditable = phase === "running" && unavailable === null
        && livePattern?.qualified === true && pendingPattern === null;
    let valid = false;
    try {
        if (request) {
            validatePourRequest(request, policy);
            valid = true;
        }
    } catch { /* A supplied policy is not proof that the current selection is legal. */ }
    const explanation = unavailable ?? (policy === null ? "Pour is not qualified for this machine."
        : request === null ? "Select a qualified pour request before starting."
            : !valid ? "The selected pour is outside the qualified policy." : null);
    const shownTemperature = active ? temperatureC : request?.temperatureC ?? null;
    const shownPattern = active ? pattern : request?.pattern ?? null;
    return (
        <YStack gap="$4" flex={1} minHeight={0}>
            <Text color={palette.muted}>{phase === "running" ? "POURING" : phase.toUpperCase()}</Text>
            <ScrollView testID="pour-tool-fields" flex={1} minHeight={0}>
                <YStack gap="$5" paddingBottom="$4">
                    {request?.mode === "target" && <MachineControlReadout
                        label={active ? "DISPENSED" : "TARGET VOLUME"}
                        value={active ? dispensedMl : request.volumeMl} unit="ml"/>}
                    <YStack gap="$2">
                        <Text color={palette.muted}>MODE</Text>
                        <Text color={palette.text}>{request?.mode === "target" ? "Target" : request?.mode === "continuous" ? "Continuous" : "Unavailable"}</Text>
                        {editable && <XStack flexWrap="wrap" gap="$2">
                            {policy?.modes.map((mode) => <Button key={mode} accessibilityRole="button"
                                accessibilityState={{selected: request?.mode === mode}} onPress={() => onModeChange(mode)}
                                minHeight={48} height="auto" padding="$3"
                                backgroundColor={request?.mode === mode ? selection.fill : palette.control}
                                color={request?.mode === mode ? selection.ink : palette.text}>
                                {mode === "target" ? "Target" : "Continuous"}
                            </Button>)}
                        </XStack>}
                    </YStack>
                    {request?.mode === "target" && !active && <MachineNumericControl
                        label="Target volume" value={request.volumeMl} unit="ml" policy={policy?.volumeMl ?? null}
                        editable={editable} onChange={(volumeMl) => onRequestChange({...request, volumeMl})}/>}
                    <MachineNumericControl label="Flow" value={request?.flowMlPerSecond ?? null} unit="ml/s"
                        policy={policy?.flowMlPerSecond ?? null} editable={editable}
                        onChange={(flowMlPerSecond) => { if (request) onRequestChange({...request, flowMlPerSecond}); }}/>
                    <YStack gap="$2">
                        <MachineControlReadout label="SETPOINT" value={shownTemperature} unit="°C" prominent={false}/>
                        {(editable || temperatureEditable) && <MachineNumericControl label="Setpoint"
                            value={shownTemperature} unit="°C" policy={policy?.temperatureC ?? null} editable
                            onChange={(value) => {
                                if (ready && request) onRequestChange({...request, temperatureC: value});
                                else if (liveTemperature?.qualified) liveTemperature.onChange(value);
                            }}/>}
                        {active && !liveTemperature?.qualified && <Text color={palette.muted}>
                            {liveTemperature?.reason ?? "Live temperature control is not qualified."}
                        </Text>}
                        {pendingTemperatureC !== null && <Text color={palette.muted}>Pending setpoint: {pendingTemperatureC} °C</Text>}
                        {liveTemperature?.qualified && liveTemperature.error !== null && <Text color={palette.danger}>{liveTemperature.error}</Text>}
                    </YStack>
                    <YStack gap="$2">
                        <Text color={palette.muted}>PATTERN</Text>
                        {shownPattern === null ? <Text color={palette.muted}>Unavailable</Text> : <XStack alignItems="center" gap="$2">
                            <PourGlyph kind={shownPattern} accent={palette.text}/>
                            <Text color={palette.text}>{PATTERN_LABELS[shownPattern]}</Text>
                        </XStack>}
                        {(editable || patternEditable) && <XStack flexWrap="wrap" gap="$2">
                            {policy?.patterns.map((choice) => <Button key={choice} accessibilityRole="button"
                                accessibilityLabel={PATTERN_LABELS[choice]} accessibilityState={{selected: choice === shownPattern}}
                                minHeight={48} height="auto" padding="$3"
                                backgroundColor={choice === shownPattern ? selection.fill : palette.control}
                                color={choice === shownPattern ? selection.ink : palette.text}
                                onPress={() => {
                                    if (ready && request) onRequestChange({...request, pattern: choice});
                                    else if (livePattern?.qualified) livePattern.onChange(choice);
                                }}>
                                <PourGlyph kind={choice} accent={choice === shownPattern ? selection.ink : palette.text}/>
                                {PATTERN_LABELS[choice]}
                            </Button>)}
                        </XStack>}
                        {active && !livePattern?.qualified && <Text color={palette.muted}>
                            {livePattern?.reason ?? "Live pattern control is not qualified."}
                        </Text>}
                        {pendingPattern !== null && <Text color={palette.muted}>Pending pattern: {pendingPattern}</Text>}
                        {livePattern?.qualified && livePattern.error !== null && <Text color={palette.danger}>{livePattern.error}</Text>}
                    </YStack>
                    {explanation !== null && <Text color={palette.muted}>{explanation}</Text>}
                    {error !== null && <Text color={palette.danger}>{error}</Text>}
                </YStack>
            </ScrollView>
            <MachineToolActions phase={phase} startDisabled={!valid || unavailable !== null}
                stopUnavailable={stopUnavailable} onStart={onStart} onStop={onStop}/>
        </YStack>
    );
}
