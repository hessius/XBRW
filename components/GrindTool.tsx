import React from "react";
import {ScrollView, Text, YStack} from "tamagui";
import {MachineToolActions} from "@/components/MachineControlReadout";
import ToolHeroStage from "@/components/ToolHeroStage";
import ToolParameterDeck from "@/components/ToolParameterDeck";
import {useAppearance} from "@/hooks/useAppearance";
import {validateGrindRequest, type ControlPhase, type GrindPolicy, type GrindRequest} from "@/library/machine/controlModel";

export type GrindToolProps = {
    phase: ControlPhase;
    request: GrindRequest | null;
    policy: GrindPolicy | null;
    unavailable: string | null;
    stopUnavailable: string | null;
    error: string | null;
    animationEnabled: boolean;
    variant?: "full" | "inline";
    onRequestChange: (request: GrindRequest) => void;
    onStart: () => void;
    onStop: () => void;
};

/** Mount in a bounded flex body in `full` mode so parameters scroll independently of Stop. */
export default function GrindTool({
    phase, request, policy, unavailable, stopUnavailable, error,
    animationEnabled, variant = "full", onRequestChange, onStart, onStop
}: GrindToolProps) {
    const {palette} = useAppearance();
    const isFull = variant === "full";
    let valid = false;
    try {
        if (request) {
            validateGrindRequest(request, policy);
            valid = true;
        }
    } catch { /* Invalid policies and selections must never enable Start. */ }

    const explanation = unavailable ?? (policy === null ? "Grind is not qualified for this machine."
        : request === null ? "Select a qualified grind size and RPM before starting."
            : !valid ? "The selected grind size or RPM is outside the qualified policy." : null);

    const content = (
        <YStack gap={isFull ? "$3" : "$2.5"} paddingBottom={isFull ? "$4" : 0}>
            <ToolHeroStage
                tool="grind"
                phase={phase}
                variant={variant}
                kicker="SELECTED SIZE"
                value={request?.grindSize ?? null}
                subLeft={request ? `RPM ${request.rpm}` : "RPM —"}
                subRight={valid ? "BURR CALIBRATED" : null}
                burr={{running: phase === "running", rpm: request?.rpm ?? null, animationEnabled}}
            />
            <ToolParameterDeck
                variant={variant}
                phase={phase}
                tool="grind"
                grindRequest={request}
                grindPolicy={policy}
                unavailable={unavailable}
                onGrindChange={onRequestChange}
            />
            {explanation !== null && <Text color={palette.muted}>{explanation}</Text>}
            {error !== null && <Text color={palette.danger}>{error}</Text>}
        </YStack>
    );

    return (
        <YStack gap={isFull ? "$2" : "$2"} flex={isFull ? 1 : undefined} minHeight={isFull ? 0 : undefined}>
            {isFull ? (
                <ScrollView testID="grind-tool-fields" flex={1} minHeight={0}>
                    {content}
                </ScrollView>
            ) : (
                <YStack testID="grind-tool-fields">{content}</YStack>
            )}
            <MachineToolActions
                tool="grind"
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
