import React from "react";
import {ScrollView, Text, XStack, YStack} from "tamagui";
import DotMatrixText from "@/components/DotMatrixText";
import {MachineToolActions} from "@/components/MachineControlReadout";
import {formatScaleGrams} from "@/components/ScaleTool";
import ToolHeroStage from "@/components/ToolHeroStage";
import ToolParameterDeck from "@/components/ToolParameterDeck";
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
    cupGrams?: number | null;
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
    variant?: "full" | "inline";
    onRequestChange: (request: PourRequest) => void;
    /** Owner chooses any target value; this view never invents one on a mode switch. */
    onModeChange: (mode: PourRequest["mode"]) => void;
    onStart: () => void;
    onStop: () => void;
};

/** Mount in a bounded flex body in `full` mode so parameters scroll independently of Stop. */
export default function PourTool({
    phase, request, policy, dispensedMl, cupGrams, temperatureC, pattern,
    pendingTemperatureC = null, pendingPattern = null, liveTemperature, livePattern,
    unavailable, stopUnavailable, error, variant = "full",
    onRequestChange, onModeChange, onStart, onStop
}: PourToolProps) {
    const {palette} = useAppearance();
    const isFull = variant === "full";
    const active = ["starting", "running", "stopping", "unknown"].includes(phase);

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
    const isTarget = request?.mode === "target";
    const isContinuous = request?.mode === "continuous";

    const heroKicker = isTarget
        ? (active ? "DISPENSED" : "TARGET VOLUME")
        : isContinuous
            ? "CONTINUOUS POUR"
            : "POUR";
    const heroValue = isTarget
        ? (active ? dispensedMl : request.volumeMl)
        : isContinuous
            ? "∞"
            : null;
    const heroUnit = isTarget ? "ml" : isContinuous ? "open" : undefined;

    const cupFormatted = cupGrams !== undefined ? formatScaleGrams(cupGrams) : null;
    const subLeft = active
        ? (isTarget ? `TARGET ${request.volumeMl} ML` : isContinuous ? "UNTIL STOPPED" : "POUR ACTIVE")
        : (request ? `FLOW ${request.flowMlPerSecond.toFixed(1)} ML/S` : "UNAVAILABLE");
    const subRight = !active
        ? (shownTemperature !== null ? `SETPOINT ${shownTemperature} °C` : null)
        : null;

    const content = (
        <YStack gap={isFull ? "$3" : "$2.5"} paddingBottom={isFull ? "$4" : 0}>
            <ToolHeroStage
                tool="pour"
                phase={phase}
                variant={variant}
                kicker={heroKicker}
                value={heroValue}
                unit={heroUnit}
                subLeft={subLeft}
                subRight={subRight}
                vessel={isTarget ? {targetMl: request.volumeMl, dispensedMl, active} : undefined}
            />
            {active && cupGrams !== undefined && (
                <XStack
                    accessible
                    accessibilityRole="text"
                    accessibilityLabel={`CUP WEIGHT: ${cupFormatted !== null ? `${cupFormatted} g` : "Unavailable"}`}
                    justifyContent="space-between"
                    alignItems="center"
                    paddingHorizontal="$3"
                    paddingVertical="$2"
                    backgroundColor={isFull ? palette.surface : palette.raised}
                    borderWidth={1}
                    borderColor={palette.line}
                    borderRadius="$4">
                    <DotMatrixText fontSize={11} weight="bold" letterSpacing={1.4} color={palette.muted}>
                        CUP WEIGHT
                    </DotMatrixText>
                    <DotMatrixText fontSize={14} weight="bold" color={cupFormatted !== null ? palette.text : palette.muted}>
                        {cupFormatted !== null ? `${cupFormatted} G` : "Unavailable"}
                    </DotMatrixText>
                </XStack>
            )}
            <ToolParameterDeck
                variant={variant}
                phase={phase}
                tool="pour"
                pourRequest={request}
                pourPolicy={policy}
                unavailable={unavailable}
                shownTemperature={shownTemperature}
                shownPattern={shownPattern}
                pendingTemperatureC={pendingTemperatureC}
                pendingPattern={pendingPattern}
                liveTemperature={liveTemperature}
                livePattern={livePattern}
                onPourChange={onRequestChange}
                onModeChange={onModeChange}
            />
            {explanation !== null && <Text color={palette.muted}>{explanation}</Text>}
            {error !== null && <Text color={palette.danger}>{error}</Text>}
        </YStack>
    );

    return (
        <YStack gap={isFull ? "$2" : "$2"} flex={isFull ? 1 : undefined} minHeight={isFull ? 0 : undefined}>
            {isFull ? (
                <ScrollView testID="pour-tool-fields" flex={1} minHeight={0}>
                    {content}
                </ScrollView>
            ) : (
                <YStack testID="pour-tool-fields">{content}</YStack>
            )}
            <MachineToolActions
                tool="pour"
                variant={variant}
                phase={phase}
                startDisabled={!valid || unavailable !== null}
                stopUnavailable={stopUnavailable}
                onStart={onStart}
                onStop={onStop}
            />
        </YStack>
    );
}
