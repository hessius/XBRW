import React from "react";
import {Button, ScrollView, Text, YStack} from "tamagui";
import DotMatrixText from "@/components/DotMatrixText";
import ToolHeroStage from "@/components/ToolHeroStage";
import ToolParameterDeck from "@/components/ToolParameterDeck";
import {useAppearance} from "@/hooks/useAppearance";
import type {ControlPhase} from "@/library/machine/controlModel";

export type ScaleToolProps = {
    grams: number | null;
    unavailable: string | null;
    tarePending: boolean;
    disabled?: boolean;
    phase?: ControlPhase;
    scaleSamples?: readonly number[];
    variant?: "full" | "inline";
    onTare: () => void;
};

export function formatScaleGrams(grams: number | null): string | null {
    if (grams === null || !Number.isFinite(grams)) return null;
    const rounded = Math.round(grams * 10) / 10;
    return (rounded === 0 ? 0 : rounded).toFixed(1);
}

export default function ScaleTool({
    grams, unavailable, tarePending, disabled = false, phase, scaleSamples = [], variant = "full", onTare
}: ScaleToolProps) {
    const {palette, onBrand, onFill} = useAppearance();
    const isFull = variant === "full";
    const effectivePhase: ControlPhase = phase ?? (tarePending ? "applying" : "ready");
    const entering = effectivePhase === "entering";
    const formatted = formatScaleGrams(grams);
    const ctaBg = isFull ? palette.brandFill : palette.success;
    const ctaInk = isFull ? onBrand.text : onFill(palette.success).text;
    const ctaDisabled = disabled || unavailable !== null || tarePending || entering;
    const displayLabel = entering ? "ENTERING SCALE…" : tarePending ? "TARING…" : "TARE";
    const a11yLabel = entering ? "Entering scale…" : tarePending ? "Taring…" : "Tare";

    const content = (
        <YStack gap={isFull ? "$3" : "$2.5"} paddingBottom={isFull ? "$4" : 0}>
            <ToolHeroStage
                tool="scale"
                phase={effectivePhase}
                variant={variant}
                kicker="WEIGHT"
                value={formatted}
                unit="g"
                subLeft="0.1 G PRECISION"
                subRight="GRAMS"
                scaleSamples={scaleSamples}
            />
            <ToolParameterDeck
                variant={variant}
                phase={effectivePhase}
                tool="scale"
                scaleAvailable={unavailable === null}
            />
            {unavailable !== null && <Text color={palette.muted}>{unavailable}</Text>}
        </YStack>
    );

    return (
        <YStack gap={isFull ? "$2" : "$2"} flex={isFull ? 1 : undefined} minHeight={isFull ? 0 : undefined}>
            {isFull ? (
                <ScrollView flex={1} minHeight={0}>{content}</ScrollView>
            ) : content}
            <YStack paddingTop={isFull ? "$3" : "$2"}
                    style={isFull ? {borderTopWidth: 1, borderTopColor: palette.line} : undefined}>
                <Button
                    accessibilityRole="button"
                    accessibilityLabel={a11yLabel}
                    disabled={ctaDisabled}
                    accessibilityState={{busy: tarePending || entering, disabled: ctaDisabled}}
                    onPress={onTare}
                    backgroundColor={ctaBg}
                    color={ctaInk}
                    opacity={ctaDisabled ? 0.48 : 1}
                    borderRadius="$4"
                    minHeight={isFull ? 48 : 42}
                    height="auto"
                    padding="$3">
                    <DotMatrixText fontSize={isFull ? 13 : 12} weight="extrabold" letterSpacing={1.8} color={ctaInk}>
                        {displayLabel}
                    </DotMatrixText>
                </Button>
            </YStack>
        </YStack>
    );
}
