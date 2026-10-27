import React from "react";
import {ScrollView, Text, YStack} from "tamagui";
import GrindActivityBand from "@/components/GrindActivityBand";
import MachineControlReadout, {MachineNumericControl, MachineToolActions} from "@/components/MachineControlReadout";
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
    onRequestChange: (request: GrindRequest) => void;
    onStart: () => void;
    onStop: () => void;
};

/** Mount in a bounded flex body: parameters scroll independently of Stop. */
export default function GrindTool({
    phase, request, policy, unavailable, stopUnavailable, error,
    animationEnabled, onRequestChange, onStart, onStop
}: GrindToolProps) {
    const {palette} = useAppearance();
    let valid = false;
    try {
        if (request) {
            validateGrindRequest(request, policy);
            valid = true;
        }
    } catch { /* Invalid policies and selections must never enable Start. */ }
    const editable = phase === "ready" && unavailable === null && policy !== null;
    const explanation = unavailable ?? (policy === null ? "Grind is not qualified for this machine."
        : request === null ? "Select a qualified grind size and RPM before starting."
            : !valid ? "The selected grind size or RPM is outside the qualified policy." : null);
    return (
        <YStack gap="$4" flex={1} minHeight={0}>
            <Text color={palette.muted}>{phase === "running" ? "GRINDING" : phase.toUpperCase()}</Text>
            <ScrollView testID="grind-tool-fields" flex={1} minHeight={0}>
                <YStack gap="$5" paddingBottom="$4">
                    <MachineControlReadout label="SELECTED SIZE" value={request?.grindSize ?? null}/>
                    <GrindActivityBand running={phase === "running"} rpm={request?.rpm ?? null} animationEnabled={animationEnabled}/>
                    <MachineNumericControl label="Grind size" value={request?.grindSize ?? null}
                        policy={policy?.grindSize ?? null} editable={editable}
                        onChange={(grindSize) => { if (request) onRequestChange({...request, grindSize}); }}/>
                    <MachineNumericControl label="RPM" value={request?.rpm ?? null}
                        policy={policy?.rpm ?? null} editable={editable}
                        onChange={(rpm) => { if (request) onRequestChange({...request, rpm}); }}/>
                    {explanation !== null && <Text color={palette.muted}>{explanation}</Text>}
                    {error !== null && <Text color={palette.danger}>{error}</Text>}
                </YStack>
            </ScrollView>
            <MachineToolActions phase={phase} startDisabled={!valid || unavailable !== null}
                stopUnavailable={stopUnavailable} onStart={onStart} onStop={onStop}/>
        </YStack>
    );
}
