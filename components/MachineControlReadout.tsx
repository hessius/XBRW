import React from "react";
import {StyleSheet} from "react-native";
import Animated, {useAnimatedStyle} from "react-native-reanimated";
import {Button, ScrollView, Text, XStack, YStack} from "tamagui";
import DotIcon from "@/components/DotIcon";
import DotMatrixText from "@/components/DotMatrixText";
import ScrollFade from "@/components/ScrollFade";
import Stepper from "@/components/Stepper";
import {mix} from "@/constants/colors";
import {useAppearance} from "@/hooks/useAppearance";
import useScrollFade from "@/hooks/useScrollFade";
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

export const INLINE_MIN_SCROLL_HEIGHT = 180;
export const INLINE_FIXED_CHROME = 190;
export const DEFAULT_INLINE_WORKBENCH_HEADER = 86;

/**
 * Available height for an inline scrollable tool body before its pinned CTA would
 * be pushed past the bottom safe area. Expands on taller screens so options fit
 * without scrolling when room exists.
 */
export function inlineFieldsMaxHeight({
    frameHeight,
    topInset,
    bottomInset,
    headerChromeHeight = DEFAULT_INLINE_WORKBENCH_HEADER
}: {
    frameHeight: number;
    topInset: number;
    bottomInset: number;
    headerChromeHeight?: number;
}): number {
    if (frameHeight <= 0) return INLINE_MIN_SCROLL_HEIGHT;
    const usable = frameHeight - topInset - bottomInset;
    const available = usable - INLINE_FIXED_CHROME - headerChromeHeight;
    return Math.max(INLINE_MIN_SCROLL_HEIGHT, Math.round(available));
}

export type ToolFieldsScrollerProps = {
    testID: string;
    variant: "full" | "inline";
    maxInlineHeight?: number;
    children: React.ReactNode;
};

/** Bounded fields scroller paired with bottom ScrollFade and an overflow pill when content clips. */
export function ToolFieldsScroller({
    testID,
    variant,
    maxInlineHeight,
    children
}: ToolFieldsScrollerProps) {
    const {palette} = useAppearance();
    const fade = useScrollFade();
    const isFull = variant === "full";
    const accent = isFull ? palette.brand : palette.success;
    const fadeColor = isFull ? palette.base : palette.surface;
    const hintStyle = useAnimatedStyle(() => ({opacity: fade.progress.value}));

    return (
        <YStack
            position="relative"
            flex={isFull ? 1 : undefined}
            flexGrow={isFull ? 1 : 0}
            flexShrink={1}
            maxHeight={isFull ? undefined : maxInlineHeight}
            minHeight={0}>
            <ScrollView
                testID={testID}
                flex={isFull ? 1 : undefined}
                flexGrow={isFull ? 1 : 0}
                flexShrink={1}
                maxHeight={isFull ? undefined : maxInlineHeight}
                minHeight={0}
                showsVerticalScrollIndicator={true}
                persistentScrollbar={true}
                scrollEventThrottle={16}
                onScroll={fade.onScroll}
                onLayout={fade.onLayout}
                onContentSizeChange={fade.onContentSizeChange}>
                {children}
            </ScrollView>
            <ScrollFade progress={fade.progress} color={fadeColor} testID={`${testID}-scroll-fade`}/>
            <Animated.View
                testID={`${testID}-scroll-hint`}
                pointerEvents="none"
                accessibilityElementsHidden={true}
                importantForAccessibility="no-hide-descendants"
                style={[scrollerStyles.hintWrap, hintStyle]}>
                <XStack
                    alignItems="center"
                    gap="$1.5"
                    paddingHorizontal="$2.5"
                    paddingVertical={3}
                    borderRadius={999}
                    backgroundColor={palette.raised}
                    style={{borderWidth: 1, borderColor: mix(palette.line, accent, 0.45)}}>
                    <DotIcon name="more" size={10} color={accent}/>
                    <DotMatrixText fontSize={9} weight="bold" letterSpacing={1.4} color={accent}>
                        SCROLL
                    </DotMatrixText>
                </XStack>
            </Animated.View>
        </YStack>
    );
}

const scrollerStyles = StyleSheet.create({
    hintWrap: {
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 6,
        alignItems: "center"
    }
});

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

export type ToolNoticeTone = "warn" | "danger" | "muted";

export function classifyToolNotice(message: string): {tone: ToolNoticeTone; kicker: string} {
    if (/\+WATER|water tank|water supply/i.test(message)) return {tone: "warn", kicker: "ADD WATER"};
    if (/waiting for beans|fill the hopper/i.test(message)) return {tone: "warn", kicker: "ADD BEANS"};
    if (/fresh known normal machine state|return to normal/i.test(message)) return {tone: "warn", kicker: "MACHINE NOT READY"};
    return {tone: "danger", kicker: "TOOL ERROR"};
}

export function retryButtonEmphasis(message: string | null): "primary" | "warn" {
    return message !== null && classifyToolNotice(message).tone === "warn" ? "warn" : "primary";
}

export type ToolNoticeBannerProps = {
    message: string;
    variant?: "full" | "inline";
    tone?: ToolNoticeTone;
    kicker?: string;
    testID?: string;
};

export function ToolNoticeBanner({
    message, variant = "full", tone, kicker, testID
}: ToolNoticeBannerProps) {
    const {palette} = useAppearance();
    const isFull = variant === "full";
    const classified = classifyToolNotice(message);
    const resolvedTone = tone ?? classified.tone;
    const resolvedKicker = kicker ?? classified.kicker;
    const accentColor = resolvedTone === "warn" ? palette.warn : resolvedTone === "muted" ? palette.muted : palette.danger;
    const kickerColor = resolvedTone === "muted" ? palette.dim : accentColor;
    const surfaceColor = isFull ? palette.surface : palette.raised;

    return (
        <YStack
            testID={testID}
            accessible
            accessibilityRole="alert"
            gap="$1"
            paddingHorizontal="$3"
            paddingVertical="$2.5"
            borderRadius="$4"
            backgroundColor={mix(surfaceColor, accentColor, 0.09)}
            borderWidth={1}
            borderColor={mix(palette.line, accentColor, 0.45)}
            borderLeftWidth={3}
            borderLeftColor={accentColor}>
            <DotMatrixText fontSize={11} weight="bold" letterSpacing={1.6} color={kickerColor}>
                {resolvedKicker}
            </DotMatrixText>
            <Text selectable fontSize={isFull ? 13.5 : 13} lineHeight={isFull ? 19 : 18} color={palette.text}>
                {message}
            </Text>
        </YStack>
    );
}

export type ToolActionButtonProps = {
    label: string;
    displayLabel?: string;
    variant?: "full" | "inline";
    emphasis?: "primary" | "warn" | "secondary";
    disabled?: boolean;
    busy?: boolean;
    onPress: () => void;
    testID?: string;
};

export function ToolActionButton({
    label, displayLabel, variant = "full", emphasis = "primary", disabled = false, busy = false, onPress, testID
}: ToolActionButtonProps) {
    const {palette} = useAppearance();
    const isFull = variant === "full";
    const surfaceColor = isFull ? palette.surface : palette.raised;
    const accentColor = emphasis === "warn"
        ? palette.warn
        : emphasis === "secondary"
            ? palette.line
            : isFull ? palette.brand : palette.success;
    const backgroundColor = emphasis === "secondary" ? surfaceColor : mix(surfaceColor, accentColor, 0.14);
    const borderWidth = emphasis === "primary" && isFull ? 1.5 : 1;

    return (
        <Button
            testID={testID}
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityState={{disabled, busy}}
            disabled={disabled}
            onPress={onPress}
            backgroundColor={backgroundColor}
            color={palette.text}
            borderRadius="$4"
            minHeight={isFull ? 44 : 42}
            height="auto"
            paddingVertical="$2.5"
            paddingHorizontal="$3.5"
            opacity={disabled ? 0.5 : 1}
            pressStyle={{opacity: 0.72}}
            style={{borderWidth, borderColor: accentColor}}>
            <DotMatrixText
                fontSize={isFull ? 12 : 11}
                weight={emphasis === "secondary" ? "bold" : "extrabold"}
                letterSpacing={1.8}
                color={palette.text}>
                {displayLabel ?? label.toUpperCase()}
            </DotMatrixText>
        </Button>
    );
}
