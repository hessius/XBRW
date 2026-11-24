import React from "react";
import {Button, Text, XStack, YStack} from "tamagui";

import DotMatrixText from "@/components/DotMatrixText";
import PourGlyph from "@/components/PourGlyph";
import Stepper from "@/components/Stepper";
import {usableNumericPolicy} from "@/components/MachineControlReadout";
import {useAppearance} from "@/hooks/useAppearance";
import type {
    ControlPhase,
    GrindPolicy,
    GrindRequest,
    NumericPolicy,
    Pattern,
    PourPolicy,
    PourRequest,
    ToolId
} from "@/library/machine/controlModel";
import type {QualifiedLiveControl} from "@/components/PourTool";

export type ToolParameterDeckVariant = "full" | "inline";

const PATTERN_LABELS: Record<Pattern, string> = {
    centered: "Centred",
    circular: "Circular",
    spiral:   "Spiral"
};

function formatNumericDisplay(value: number | null, unit?: string): string {
    if (value === null) return "Unavailable";
    return unit ? `${value} ${unit}` : String(value);
}

function NumericDeckRow({
    label,
    sub,
    spokenLabel,
    value,
    unit,
    policy,
    editable,
    compact,
    onChange
}: {
    label: string;
    sub?: string | null;
    spokenLabel?: string;
    value: number | null;
    unit?: string;
    policy: NumericPolicy | null;
    editable: boolean;
    compact: boolean;
    onChange: (value: number) => void;
}) {
    const {palette} = useAppearance();
    const usable = usableNumericPolicy(policy);
    const display = formatNumericDisplay(value, unit);
    const a11yLabel = spokenLabel ?? label;

    return (
        <YStack gap="$1">
            {editable && value !== null && usable ? (
                <XStack
                    justifyContent="space-between"
                    alignItems="center"
                    gap="$3"
                    paddingVertical={compact ? "$2" : "$2.5"}
                    borderBottomWidth={1}
                    borderBottomColor={palette.line}>
                    <YStack flex={1} minWidth={0} gap="$0.5">
                        <Text fontSize={compact ? 13.5 : 14.5} fontWeight="600" color={palette.text}>{label}</Text>
                        {sub ? (
                            <DotMatrixText fontSize={11} weight="bold" letterSpacing={1.1} color={palette.muted}>
                                {sub}
                            </DotMatrixText>
                        ) : null}
                    </YStack>
                    <Stepper label={label} value={value} unit={unit} {...policy} snapToStep onChange={onChange}/>
                </XStack>
            ) : (
                <XStack
                    accessible
                    accessibilityRole="text"
                    accessibilityLabel={`${a11yLabel}: ${display}`}
                    justifyContent="space-between"
                    alignItems="center"
                    gap="$3"
                    paddingVertical={compact ? "$2" : "$2.5"}
                    borderBottomWidth={1}
                    borderBottomColor={palette.line}>
                    <YStack flex={1} minWidth={0} gap="$0.5">
                        <Text fontSize={compact ? 13.5 : 14.5} fontWeight="600" color={palette.text}>{label}</Text>
                        {sub ? (
                            <DotMatrixText fontSize={11} weight="bold" letterSpacing={1.1} color={palette.muted}>
                                {sub}
                            </DotMatrixText>
                        ) : null}
                    </YStack>
                    {/* Keep identical boxed Stepper geometry locked during entering/running to avoid flash or layout shift. */}
                    <XStack
                        alignItems="center"
                        gap="$1.5"
                        backgroundColor={compact ? palette.surface : palette.raised}
                        borderWidth={1}
                        borderColor={palette.line}
                        borderRadius="$3"
                        padding="$1"
                        accessible={false}
                        importantForAccessibility="no-hide-descendants">
                        <YStack width={28} height={26} borderRadius="$2" backgroundColor={palette.control}
                                alignItems="center" justifyContent="center" opacity={0.3}>
                            <Text fontSize={15} fontWeight="700" color={palette.text}>-</Text>
                        </YStack>
                        <DotMatrixText fontSize={13} weight="bold" color={value !== null ? palette.dim : palette.muted}
                                       style={{minWidth: 56, textAlign: "center"}}>
                            {display}
                        </DotMatrixText>
                        <YStack width={28} height={26} borderRadius="$2" backgroundColor={palette.control}
                                alignItems="center" justifyContent="center" opacity={0.3}>
                            <Text fontSize={15} fontWeight="700" color={palette.text}>+</Text>
                        </YStack>
                    </XStack>
                </XStack>
            )}
            {editable && !usable && (
                <Text color={palette.muted}>{`${label} control is unavailable: no qualified range.`}</Text>
            )}
        </YStack>
    );
}

export type ToolParameterDeckProps = {
    variant: ToolParameterDeckVariant;
    phase: ControlPhase;
    tool: ToolId;
    grindRequest?: GrindRequest | null;
    grindPolicy?: GrindPolicy | null;
    pourRequest?: PourRequest | null;
    pourPolicy?: PourPolicy | null;
    unavailable?: string | null;
    shownTemperature?: number | null;
    shownPattern?: Pattern | null;
    pendingTemperatureC?: number | null;
    pendingPattern?: Pattern | null;
    liveTemperature?: QualifiedLiveControl<number>;
    livePattern?: QualifiedLiveControl<Pattern>;
    scaleAvailable?: boolean;
    onGrindChange?: (request: GrindRequest) => void;
    onPourChange?: (request: PourRequest) => void;
    onModeChange?: (mode: PourRequest["mode"]) => void;
    onStart?: () => void;
};

/** Zero-flash parameter card shared by Home Inline (`compact`) and Full Tool (`full`). */
export default function ToolParameterDeck({
    variant,
    phase,
    tool,
    grindRequest = null,
    grindPolicy = null,
    pourRequest = null,
    pourPolicy = null,
    unavailable = null,
    shownTemperature = null,
    shownPattern = null,
    pendingTemperatureC = null,
    pendingPattern = null,
    liveTemperature,
    livePattern,
    scaleAvailable = true,
    onGrindChange,
    onPourChange,
    onModeChange
}: ToolParameterDeckProps) {
    const {palette, onBrand, onFill} = useAppearance();
    const isFull = variant === "full";
    const compact = !isFull;
    const entering = phase === "entering";
    const ready = phase === "ready";
    const active = ["starting", "running", "stopping", "unknown"].includes(phase);

    const activeFill = isFull ? palette.brandFill : palette.success;
    const activeInk = isFull ? onBrand.text : onFill(palette.success).text;

    const cardBg = isFull ? palette.surface : palette.raised;
    const cardRadius = isFull ? 16 : 13;

    if (tool === "scale") {
        return (
            <YStack
                testID="tool-parameter-deck"
                backgroundColor={cardBg}
                borderWidth={1}
                borderColor={palette.line}
                borderRadius={cardRadius}
                paddingHorizontal={compact ? "$3" : "$3.5"}
                opacity={entering ? 0.55 : 1}>
                <XStack justifyContent="space-between" alignItems="center" paddingVertical="$2.5">
                    <YStack gap="$0.5">
                        <Text fontSize={compact ? 13.5 : 14.5} fontWeight="600" color={palette.text}>
                            Scale stream
                        </Text>
                        <DotMatrixText fontSize={11} weight="bold" letterSpacing={1.1} color={palette.muted}>
                            {isFull ? "ALWAYS LIVE · NON-BLOCKING EXIT" : "ALWAYS LIVE · TARE ANYTIME"}
                        </DotMatrixText>
                    </YStack>
                    <DotMatrixText fontSize={12} weight="bold" color={scaleAvailable && !entering ? palette.success : palette.muted}>
                        {entering ? "ENTERING" : scaleAvailable ? "ACTIVE" : "UNAVAILABLE"}
                    </DotMatrixText>
                </XStack>
            </YStack>
        );
    }

    if (tool === "grind") {
        const editable = ready && unavailable === null && grindPolicy !== null;
        return (
            <YStack
                testID="tool-parameter-deck"
                backgroundColor={cardBg}
                borderWidth={1}
                borderColor={palette.line}
                borderRadius={cardRadius}
                paddingHorizontal={compact ? "$3" : "$3.5"}
                opacity={entering ? 0.55 : 1}>
                <NumericDeckRow
                    label="Grind size"
                    sub={compact ? null : "BURR SETTING"}
                    value={grindRequest?.grindSize ?? null}
                    policy={grindPolicy?.grindSize ?? null}
                    editable={editable}
                    compact={compact}
                    onChange={(grindSize) => { if (grindRequest && onGrindChange) onGrindChange({...grindRequest, grindSize}); }}
                />
                <NumericDeckRow
                    label="RPM"
                    sub={compact ? null : "BURR SPEED"}
                    value={grindRequest?.rpm ?? null}
                    policy={grindPolicy?.rpm ?? null}
                    editable={editable}
                    compact={compact}
                    onChange={(rpm) => { if (grindRequest && onGrindChange) onGrindChange({...grindRequest, rpm}); }}
                />
            </YStack>
        );
    }

    const pourEditable = ready && unavailable === null && pourPolicy !== null;
    const temperatureEditable = phase === "running" && unavailable === null
        && liveTemperature?.qualified === true && pendingTemperatureC === null;
    const patternEditable = phase === "running" && unavailable === null
        && livePattern?.qualified === true && pendingPattern === null;
    const canEditTemperature = pourEditable || temperatureEditable;
    const canEditPattern = pourEditable || patternEditable;

    return (
        <YStack
            testID="tool-parameter-deck"
            backgroundColor={cardBg}
            borderWidth={1}
            borderColor={palette.line}
            borderRadius={cardRadius}
            paddingHorizontal={compact ? "$3" : "$3.5"}
            opacity={entering ? 0.55 : 1}>
            {/* Mode row */}
            <XStack justifyContent="space-between" alignItems="center" gap="$2" flexWrap="wrap"
                    paddingVertical={compact ? "$2" : "$2.5"} borderBottomWidth={1} borderBottomColor={palette.line}>
                <Text fontSize={compact ? 13.5 : 14.5} fontWeight="600" color={palette.text}>Mode</Text>
                <XStack gap="$1.5" flexWrap="wrap">
                    {(pourPolicy?.modes ?? ["target", "continuous"]).map((mode) => {
                        const selected = pourRequest?.mode === mode;
                        const label = mode === "target" ? "Target" : "Until stopped";
                        return (
                            <Button
                                key={mode}
                                accessibilityRole="button"
                                accessibilityLabel={label}
                                accessibilityState={{selected, disabled: !pourEditable}}
                                disabled={!pourEditable}
                                onPress={() => onModeChange?.(mode)}
                                minHeight={compact ? 34 : 38}
                                height="auto"
                                paddingHorizontal="$2.5"
                                paddingVertical="$1.5"
                                borderRadius="$3"
                                opacity={!pourEditable && !selected ? 0.36 : 1}
                                backgroundColor={selected ? activeFill : palette.control}
                                color={selected ? activeInk : palette.text}>
                                {label}
                            </Button>
                        );
                    })}
                </XStack>
            </XStack>

            {pourRequest?.mode === "target" && (
                <NumericDeckRow
                    label="Target volume"
                    value={pourRequest.volumeMl}
                    unit="ml"
                    policy={pourPolicy?.volumeMl ?? null}
                    editable={pourEditable}
                    compact={compact}
                    onChange={(volumeMl) => onPourChange?.({...pourRequest, volumeMl})}
                />
            )}

            <NumericDeckRow
                label="Flow"
                value={pourRequest?.flowMlPerSecond ?? null}
                unit="ml/s"
                policy={pourPolicy?.flowMlPerSecond ?? null}
                editable={pourEditable}
                compact={compact}
                onChange={(flowMlPerSecond) => {
                    if (pourRequest) onPourChange?.({...pourRequest, flowMlPerSecond});
                }}
            />

            <YStack gap="$1">
                <NumericDeckRow
                    label="Setpoint"
                    spokenLabel={canEditTemperature ? "Setpoint" : "SETPOINT"}
                    sub={phase === "running" && liveTemperature?.qualified ? "LIVE ADJUSTABLE" : "REQUESTED TEMP"}
                    value={shownTemperature}
                    unit="°C"
                    policy={pourPolicy?.temperatureC ?? null}
                    editable={canEditTemperature}
                    compact={compact}
                    onChange={(value) => {
                        if (ready && pourRequest) onPourChange?.({...pourRequest, temperatureC: value});
                        else if (liveTemperature?.qualified) liveTemperature.onChange(value);
                    }}
                />
                {active && !liveTemperature?.qualified && (
                    <Text fontSize={12} color={palette.muted}>
                        {liveTemperature?.reason ?? "Live temperature control is not qualified."}
                    </Text>
                )}
                {pendingTemperatureC !== null && (
                    <Text fontSize={12} color={palette.muted}>{`Pending setpoint: ${pendingTemperatureC} °C`}</Text>
                )}
                {liveTemperature?.qualified && liveTemperature.error !== null && (
                    <Text fontSize={12} color={palette.danger}>{liveTemperature.error}</Text>
                )}
            </YStack>

            <YStack gap="$2" paddingVertical={compact ? "$2" : "$2.5"}>
                <DotMatrixText fontSize={11} weight="bold" letterSpacing={1.2} color={palette.muted}>
                    {phase === "running" && livePattern?.qualified ? "PATTERN · LIVE ADJUSTABLE" : "PATTERN"}
                </DotMatrixText>
                {active && !livePattern?.qualified ? (
                    <XStack
                        accessible
                        accessibilityRole="text"
                        accessibilityLabel={`PATTERN: ${shownPattern ? PATTERN_LABELS[shownPattern] : "Unavailable"}`}
                        alignItems="center"
                        gap="$2">
                        {shownPattern !== null && <PourGlyph kind={shownPattern} accent={palette.text} size={compact ? 14 : 16}/>}
                        <DotMatrixText fontSize={compact ? 13 : 14} weight="bold"
                                       color={shownPattern !== null ? palette.text : palette.muted}>
                            {shownPattern !== null ? PATTERN_LABELS[shownPattern].toUpperCase() : "UNAVAILABLE"}
                        </DotMatrixText>
                    </XStack>
                ) : (
                    <XStack flexWrap="wrap" gap="$1.5">
                        {(pourPolicy?.patterns ?? ["centered", "circular", "spiral"]).map((choice) => {
                            const selected = choice === shownPattern;
                            const ink = selected ? activeInk : palette.text;
                            return (
                                <Button
                                    key={choice}
                                    accessibilityRole="button"
                                    accessibilityLabel={PATTERN_LABELS[choice]}
                                    accessibilityState={{selected, disabled: !canEditPattern}}
                                    disabled={!canEditPattern}
                                    minHeight={compact ? 36 : 40}
                                    height="auto"
                                    paddingHorizontal="$2.5"
                                    paddingVertical="$1.5"
                                    borderRadius="$3"
                                    opacity={!canEditPattern && !selected ? 0.36 : 1}
                                    backgroundColor={selected ? activeFill : palette.control}
                                    color={ink}
                                    onPress={() => {
                                        if (ready && pourRequest) onPourChange?.({...pourRequest, pattern: choice});
                                        else if (livePattern?.qualified) livePattern.onChange(choice);
                                    }}>
                                    <PourGlyph kind={choice} accent={ink} size={compact ? 14 : 16}/>
                                    {PATTERN_LABELS[choice]}
                                </Button>
                            );
                        })}
                    </XStack>
                )}
                {active && !livePattern?.qualified && (
                    <Text fontSize={12} color={palette.muted}>
                        {livePattern?.reason ?? "Live pattern control is not qualified."}
                    </Text>
                )}
                {pendingPattern !== null && (
                    <Text fontSize={12} color={palette.muted}>{`Pending pattern: ${pendingPattern}`}</Text>
                )}
                {livePattern?.qualified && livePattern.error !== null && (
                    <Text fontSize={12} color={palette.danger}>{livePattern.error}</Text>
                )}
            </YStack>
        </YStack>
    );
}
