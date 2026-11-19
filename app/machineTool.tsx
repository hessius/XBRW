import React, {useEffect, useRef, useState} from "react";
import {Pressable} from "react-native";
import {useLocalSearchParams} from "expo-router";
import {useSafeAreaInsets} from "react-native-safe-area-context";
import {Button, ScrollView, Text, XStack, YStack} from "tamagui";
import DotMatrixText from "@/components/DotMatrixText";
import GrindTool from "@/components/GrindTool";
import PourTool from "@/components/PourTool";
import ScaleTool from "@/components/ScaleTool";
import ScreenHeader from "@/components/ScreenHeader";
import ToolHeadShakeView from "@/components/ToolHeadShakeView";
import {notify} from "@/components/XbrwToast";
import {useAppearance} from "@/hooks/useAppearance";
import {useLiveBrew} from "@/hooks/useLiveBrew";
import {useMachineControls} from "@/hooks/useMachineControls";
import {useMachineToolNavigation} from "@/hooks/useMachineToolNavigation";
import {useMachineTool} from "@/hooks/useMachineTool";
import {useSavedMachines} from "@/hooks/useSavedMachines";
import {useSetting} from "@/hooks/useSetting";
import router from "@/hooks/steadyRouter";
import type MachineControls from "@/library/machine/MachineControls";
import type {ControlIdentity, ControlPhase, ToolId} from "@/library/machine/controlModel";

const TOOLS: readonly {id: ToolId; label: string; display: string}[] = [
    {id: "grind", label: "Grind", display: "GRIND"},
    {id: "scale", label: "Scale", display: "SCALE"},
    {id: "pour",  label: "Pour",  display: "POUR"},
];
const ACTIVE_SWITCH_PHASES: readonly ControlPhase[] = [
    "entering", "leaving", "starting", "running", "stopping", "applying", "unknown"
];

function toolSwitchBlockedReason(phase: ControlPhase, tool: ToolId): string {
    if (phase === "stopping") return `Stopping ${tool}…`;
    if (phase === "leaving" || phase === "entering") return "Wait for tool switch to finish.";
    if (phase === "applying") return "Wait for scale tare to finish.";
    if (phase === "starting" || phase === "running") return `Stop ${tool} before switching tools`;
    return "Reconcile the machine before switching tools.";
}

function ToolScreen({identity, routeTool, name, injected}: {
    identity: ControlIdentity; routeTool: ToolId; name: string; injected?: MachineControls;
}) {
    const {palette, onBrand} = useAppearance();
    const insets = useSafeAreaInsets();
    const {controls, snapshot} = useMachineControls(injected);
    const [toolOverride, setToolOverride] = useState<{fromRoute: ToolId; tool: ToolId} | null>(null);
    const [tabShakeKey, setTabShakeKey] = useState(0);
    const mountedRef = useRef(true);
    useEffect(() => {
        mountedRef.current = true;
        return () => { mountedRef.current = false; };
    }, []);
    const tool = toolOverride !== null && toolOverride.fromRoute === routeTool ? toolOverride.tool : routeTool;
    const state = useMachineTool(identity, tool, controls, snapshot);
    const nav = useMachineToolNavigation(identity, controls, "tool", {
        onBlocked: (reason) => { notify({tone: "info", message: reason}); }
    });
    const {ratingNoteOpen} = useLiveBrew();
    const covered = nav.covered || ratingNoteOpen;
    const [animationEnabled] = useSetting("animateBrewChart");
    const {support, owns, phase, uiPhase, bound, unavailable, error, busy, grind, pour, scaleSamples} = state;
    const sameMachineSnap = snapshot.identity?.deviceId === identity.deviceId
        && snapshot.identity.serial === identity.serial;
    const blockingPhase: ControlPhase = owns ? phase
        : uiPhase === "entering" ? "entering"
            : sameMachineSnap ? snapshot.phase : phase;
    const activeMoving = ACTIVE_SWITCH_PHASES.includes(blockingPhase);

    function switchToolState(nextTool: ToolId) {
        setToolOverride({fromRoute: routeTool, tool: nextTool});
        if ("setParams" in router && typeof router.setParams === "function") {
            router.setParams({tool: nextTool});
        }
    }

    function handleSelectTool(nextTool: ToolId) {
        if (nextTool === tool) return;
        if (activeMoving) {
            setTabShakeKey((count) => count + 1);
            notify({tone: "info", message: toolSwitchBlockedReason(blockingPhase, tool)});
            return;
        }
        const prevTool = tool;
        const current = controls.getSnapshot();
        const sameOwned = current.identity?.deviceId === identity.deviceId
            && current.identity.serial === identity.serial;
        const closing = sameOwned && current.phase === "ready"
            ? controls.closeInBackground().catch(() => {})
            : Promise.resolve();
        switchToolState(nextTool);
        void closing.then(() => {
            const after = controls.getSnapshot();
            if (mountedRef.current
                && after.identity?.deviceId === identity.deviceId
                && after.identity.serial === identity.serial
                && after.phase === "unknown"
                && after.tool === prevTool) {
                switchToolState(prevTool);
            }
        });
    }

    return (
        <YStack flex={1} minHeight={0} backgroundColor={palette.base}>
            <YStack testID="machine-tool-content" flex={1} minHeight={0}
                accessibilityElementsHidden={covered}
                importantForAccessibility={covered ? "no-hide-descendants" : "auto"}>
                <ToolHeadShakeView shakeKey={nav.blockedCount} testID="machine-tool-header-shake">
                    <ScreenHeader
                        title="Machine Tools"
                        subtitle={`${name} · ${identity.serial ?? "Serial not known"}`}
                        onBack={() => nav.requestDeparture(() => router.back())}
                    />
                </ToolHeadShakeView>
                <ToolHeadShakeView shakeKey={tabShakeKey} testID="machine-tool-switcher-shake">
                    <XStack
                        testID="machine-tool-switcher"
                        marginHorizontal="$4"
                        marginBottom="$2"
                        padding={4}
                        gap={4}
                        borderRadius={13}
                        backgroundColor={palette.surface}
                        style={{borderWidth: 1, borderColor: palette.line}}>
                        {TOOLS.map(({id, label, display}) => {
                            const selected = id === tool;
                            const dimmed = activeMoving && !selected;
                            return (
                                <Pressable
                                    key={id}
                                    accessibilityRole="button"
                                    accessibilityLabel={label}
                                    accessibilityState={{selected}}
                                    onPress={() => handleSelectTool(id)}
                                    style={({pressed}) => ({
                                        flex: 1,
                                        minHeight: 34,
                                        borderRadius: 9,
                                        alignItems: "center",
                                        justifyContent: "center",
                                        backgroundColor: selected ? palette.brandFill : "transparent",
                                        opacity: pressed ? 0.72 : dimmed ? 0.35 : 1
                                    })}>
                                    <DotMatrixText
                                        fontSize={11}
                                        weight="bold"
                                        letterSpacing={1.6}
                                        color={selected ? onBrand.text : palette.dim}>
                                        {display}
                                    </DotMatrixText>
                                </Pressable>
                            );
                        })}
                    </XStack>
                </ToolHeadShakeView>
                <YStack flex={1} minHeight={0} paddingHorizontal="$4" paddingBottom={Math.max(insets.bottom, 16)} gap="$2">
                    {/* A sibling, never an outer scroller around the instruments:
                        large copy cannot push their fixed Stop below the screen. */}
                    <ScrollView flexGrow={0} flexShrink={1} maxHeight="30%" minHeight={0}
                        contentContainerStyle={{gap: 8, paddingBottom: 8}}>
                        {error !== null && <Text selectable color={palette.danger}>{error}</Text>}
                        {tool === "scale" && owns && snapshot.error !== null
                            && <Text selectable color={palette.danger}>{snapshot.error}</Text>}
                        {support.unavailable !== null && <Text color={palette.muted}>{support.unavailable}</Text>}
                        {phase === "closed" && uiPhase === "closed" && support.unavailable === null && (
                            <Button accessibilityRole="button" disabled={busy} onPress={state.open}>
                                {error !== null ? "Retry opening tool" : "Open tool"}
                            </Button>
                        )}
                        {support.recoverable && <Button accessibilityRole="button" disabled={busy}
                            onPress={state.recover}>Reconcile connected machine</Button>}
                        {!owns && sameMachineSnap && snapshot.phase === "unknown"
                            && (snapshot.tool === "grind" || snapshot.tool === "scale" || snapshot.tool === "pour") && (
                            <Button accessibilityRole="button" disabled={busy}
                                onPress={() => switchToolState(snapshot.tool as ToolId)}>
                                Inspect active tool
                            </Button>
                        )}
                        {support.reconnectable ? <>
                            <Text color={palette.muted}>
                                Connection lost. Reconnect this machine to inspect and stop, or leave this screen.
                            </Text>
                            <XStack gap="$2" flexWrap="wrap">
                                <Button accessibilityRole="button" disabled={busy}
                                    onPress={state.reconnect}>Reconnect named machine</Button>
                                <Button accessibilityRole="button" disabled={busy}
                                    onPress={() => nav.leaveWhileDisconnected(() => router.back())}>Leave screen</Button>
                            </XStack>
                        </> : sameMachineSnap && snapshot.phase === "unknown" && !support.recoverable && (
                            <Button accessibilityRole="button" disabled={busy}
                                onPress={() => nav.leaveWhileDisconnected(() => router.back())}>Leave screen</Button>
                        )}
                    </ScrollView>
                    {tool === "grind" && <GrindTool phase={uiPhase} request={grind}
                        policy={support.grind} unavailable={unavailable} stopUnavailable={support.stopUnavailable}
                        error={owns ? snapshot.error : null} animationEnabled={animationEnabled}
                        onRequestChange={state.setGrind} onStart={state.start} onStop={state.stop}/>}
                    {tool === "scale" && <ScaleTool phase={uiPhase} grams={bound ? snapshot.cupGrams : null}
                        scaleSamples={scaleSamples} unavailable={unavailable} disabled={uiPhase !== "ready"}
                        tarePending={phase === "applying"} onTare={state.tare}/>}
                    {tool === "pour" && <PourTool phase={uiPhase} request={pour}
                        policy={support.pour} dispensedMl={bound ? snapshot.dispensedMl : null}
                        cupGrams={bound ? snapshot.cupGrams : null}
                        temperatureC={bound ? snapshot.temperatureC : null} pattern={bound ? snapshot.pattern : null}
                        pendingTemperatureC={bound ? snapshot.pendingTemperatureC : null}
                        pendingPattern={bound ? snapshot.pendingPattern : null}
                        liveTemperature={support.liveTemperature
                            ? {qualified: true, onChange: state.setLiveTemperature, error: state.liveTempError}
                            : undefined}
                        livePattern={support.livePattern
                            ? {qualified: true, onChange: state.setLivePattern, error: state.livePatternError}
                            : undefined}
                        unavailable={unavailable} stopUnavailable={support.stopUnavailable}
                        error={owns ? snapshot.error : null} onRequestChange={state.setPour}
                        onModeChange={state.changeMode} onStart={state.start} onStop={state.stop}/>}
                </YStack>
            </YStack>
        </YStack>
    );
}

export default function MachineToolScreen({controls}: {controls?: MachineControls}) {
    const {machineId, tool} = useLocalSearchParams<{machineId?: string | string[]; tool?: string | string[]}>();
    const {machines} = useSavedMachines();
    const {palette} = useAppearance();
    const {ratingNoteOpen} = useLiveBrew();
    const matches = typeof machineId === "string" ? machines.filter(machine => machine.id === machineId) : [];
    const machine = matches.length === 1 ? matches[0] : null;
    if (!machine || typeof tool !== "string" || !["grind", "scale", "pour"].includes(tool)) {
        return <YStack testID="machine-tool-invalid" flex={1} backgroundColor={palette.base}
            accessibilityElementsHidden={ratingNoteOpen}
            importantForAccessibility={ratingNoteOpen ? "no-hide-descendants" : "auto"}>
            <ScreenHeader title="Machine tool" onBack={() => router.back()}/>
            <Text selectable padding="$4" color={palette.danger}>Invalid machine tool link. Choose one saved machine and Grind, Scale or Pour.</Text>
        </YStack>;
    }
    const identity = {deviceId: machine.id, serial: machine.serial.trim() || null};
    return <ToolScreen key={JSON.stringify(identity)} identity={identity} routeTool={tool as ToolId}
        name={machine.label || machine.advertisedName || machine.id} injected={controls}/>;
}
