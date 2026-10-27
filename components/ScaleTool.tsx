import React from "react";
import {Button, ScrollView, Text, YStack} from "tamagui";
import MachineControlReadout from "@/components/MachineControlReadout";
import {useAppearance} from "@/hooks/useAppearance";

export type ScaleToolProps = {
    grams: number | null;
    unavailable: string | null;
    tarePending: boolean;
    onTare: () => void;
};

export default function ScaleTool({grams, unavailable, tarePending, onTare}: ScaleToolProps) {
    const {palette, primary} = useAppearance();
    return (
        <YStack gap="$5" flex={1} minHeight={0}>
            <ScrollView flex={1} minHeight={0}>
                <YStack gap="$5" paddingBottom="$4">
                    <MachineControlReadout label="WEIGHT" value={grams} unit="g"/>
                    {unavailable !== null && <Text color={palette.muted}>{unavailable}</Text>}
                </YStack>
            </ScrollView>
            <Button accessibilityRole="button" disabled={unavailable !== null || tarePending}
                accessibilityState={{busy: tarePending}} onPress={onTare}
                backgroundColor={primary.fill} color={primary.ink}
                minHeight={48} height="auto" padding="$3" marginTop="auto">
                {tarePending ? "Taring…" : "Tare"}
            </Button>
        </YStack>
    );
}
