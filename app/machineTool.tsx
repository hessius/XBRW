import React from "react";
import {useLocalSearchParams} from "expo-router";
import {useSafeAreaInsets} from "react-native-safe-area-context";
import {Button, ScrollView, Text, YStack} from "tamagui";
import GrindTool from "@/components/GrindTool";
import PourTool from "@/components/PourTool";
import ScaleTool from "@/components/ScaleTool";
import ScreenHeader from "@/components/ScreenHeader";
import XbrwSheet from "@/components/XbrwSheet";
import {useAppearance} from "@/hooks/useAppearance";
import {useMachineControls} from "@/hooks/useMachineControls";
import {useMachineToolNavigation} from "@/hooks/useMachineToolNavigation";
import {useMachineTool} from "@/hooks/useMachineTool";
import {useSavedMachines} from "@/hooks/useSavedMachines";
import {useSetting} from "@/hooks/useSetting";
import router from "@/hooks/steadyRouter";
import type MachineControls from "@/library/machine/MachineControls";
import type {ControlIdentity, ToolId} from "@/library/machine/controlModel";

const TITLES: Record<ToolId, string> = {grind: "Grind", scale: "Scale", pour: "Pour"};

function ToolScreen({identity, tool, name, injected}: {
    identity: ControlIdentity; tool: ToolId; name: string; injected?: MachineControls;
}) {
    const {palette, primary} = useAppearance();
    const insets = useSafeAreaInsets();
    const {controls, snapshot} = useMachineControls(injected);
    const state = useMachineTool(identity, tool, controls, snapshot);
    const nav = useMachineToolNavigation(identity, controls);
    const [animationEnabled] = useSetting("animateBrewChart");
    const {support, owns, phase, bound, unavailable, error, busy, grind, pour} = state;
    const prompt = nav.prompt;
    return (
        <YStack flex={1} minHeight={0} backgroundColor={palette.base}>
            <YStack testID="machine-tool-content" flex={1} minHeight={0}
                accessibilityElementsHidden={nav.covered}
                importantForAccessibility={nav.covered ? "no-hide-descendants" : "auto"}>
                <ScreenHeader title={TITLES[tool]} subtitle={`${name} · ${identity.serial ?? "Serial not known"}`}
                    onBack={() => nav.requestDeparture(() => router.back())}/>
                <YStack flex={1} minHeight={0} paddingHorizontal="$4" paddingBottom={Math.max(insets.bottom, 16)} gap="$2">
                    {/* A sibling, never an outer scroller around the instruments:
                        large copy cannot push their fixed Stop below the screen. */}
                    <ScrollView flexGrow={0} flexShrink={1} maxHeight="35%" minHeight={0}
                        contentContainerStyle={{gap: 8, paddingBottom: 8}}>
                        {error !== null && <Text selectable color={palette.danger}>{error}</Text>}
                        {tool === "scale" && owns && snapshot.error !== null
                            && <Text selectable color={palette.danger}>{snapshot.error}</Text>}
                        {!bound && <Text color={palette.muted}>
                            {support.unavailable ?? "Opening only prepares the tool. It never starts the machine."}
                        </Text>}
                        {!bound && <Text color={palette.muted}>
                            Brew, Easy Mode and other control operations must finish first. Connect this named machine from Machines; this screen never switches or connects automatically.
                        </Text>}
                        {phase === "closed" && <Button accessibilityRole="button"
                            disabled={busy || support.unavailable !== null} onPress={state.open}>Open tool</Button>}
                        {support.recoverable && <Button accessibilityRole="button" disabled={busy}
                            onPress={state.recover}>Reconcile connected machine</Button>}
                        {bound && phase === "ready" && tool !== "scale" && <Button accessibilityRole="button"
                            disabled={busy} onPress={state.chooseProposal}>
                            Choose editable proposal
                        </Button>}
                        {tool !== "scale" && <Text color={palette.muted}>
                            Selected values are an editable proposal, not the machine’s current settings. Start is always deliberate.
                        </Text>}
                    </ScrollView>
                    {tool === "grind" && <GrindTool phase={phase} request={grind}
                        policy={support.grind} unavailable={unavailable} stopUnavailable={support.stopUnavailable}
                        error={owns ? snapshot.error : null} animationEnabled={animationEnabled}
                        onRequestChange={state.setGrind} onStart={state.start} onStop={state.stop}/>}
                    {tool === "scale" && <ScaleTool grams={bound ? snapshot.cupGrams : null}
                        unavailable={unavailable ?? (phase !== "ready" ? "Scale is not ready." : null)}
                        tarePending={phase === "applying"} onTare={state.tare}/>}
                    {tool === "pour" && <PourTool phase={phase} request={pour}
                        policy={support.pour} dispensedMl={bound ? snapshot.dispensedMl : null}
                        temperatureC={bound ? snapshot.temperatureC : null} pattern={bound ? snapshot.pattern : null}
                        pendingTemperatureC={bound ? snapshot.pendingTemperatureC : null}
                        pendingPattern={bound ? snapshot.pendingPattern : null}
                        unavailable={unavailable} stopUnavailable={support.stopUnavailable}
                        error={owns ? snapshot.error : null} onRequestChange={state.setPour}
                        onModeChange={state.changeMode} onStart={state.start} onStop={state.stop}/>}
                </YStack>
            </YStack>
            {prompt && <XbrwSheet open={prompt.open} onOpenChange={prompt.onOpenChange} title="Leave tool?">
                <YStack gap="$4">
                    <Text color={palette.text}>{prompt.requiresStop
                        ? "Stop must be confirmed before leaving." : "Close the tool before leaving."}</Text>
                    {prompt.error !== null && <Text selectable color={palette.danger}>{prompt.error}</Text>}
                    <Button accessibilityRole="button" disabled={prompt.busy}
                        accessibilityState={{busy: prompt.busy}} backgroundColor={primary.fill} color={primary.ink}
                        onPress={() => { void prompt.stopAndLeave(); }}>
                        {prompt.busy ? "Waiting for confirmation…" : prompt.requiresStop ? "Stop and leave" : "Close and leave"}
                    </Button>
                    <Button accessibilityRole="button" onPress={prompt.stay}>Stay</Button>
                </YStack>
            </XbrwSheet>}
        </YStack>
    );
}

export default function MachineToolScreen({controls}: {controls?: MachineControls}) {
    const {machineId, tool} = useLocalSearchParams<{machineId?: string | string[]; tool?: string | string[]}>();
    const {machines} = useSavedMachines();
    const {palette} = useAppearance();
    const matches = typeof machineId === "string" ? machines.filter(machine => machine.id === machineId) : [];
    const machine = matches.length === 1 ? matches[0] : null;
    if (!machine || typeof tool !== "string" || !["grind", "scale", "pour"].includes(tool)) {
        return <YStack flex={1} backgroundColor={palette.base}>
            <ScreenHeader title="Machine tool" onBack={() => router.back()}/>
            <Text selectable padding="$4" color={palette.danger}>Invalid machine tool link. Choose one saved machine and Grind, Scale or Pour.</Text>
        </YStack>;
    }
    const identity = {deviceId: machine.id, serial: machine.serial.trim() || null};
    return <ToolScreen key={JSON.stringify([identity, tool])} identity={identity} tool={tool as ToolId}
        name={machine.label || machine.advertisedName || machine.id} injected={controls}/>;
}
