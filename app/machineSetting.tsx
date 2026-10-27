import React from "react";
import {useLocalSearchParams} from "expo-router";
import {useSafeAreaInsets} from "react-native-safe-area-context";
import {Button, ScrollView, Text, YStack} from "tamagui";
import MachineSettingEditor from "@/components/MachineSettingEditor";
import ScreenHeader from "@/components/ScreenHeader";
import XbrwSheet from "@/components/XbrwSheet";
import {useAppearance} from "@/hooks/useAppearance";
import {useMachineControls} from "@/hooks/useMachineControls";
import {useMachineSetting} from "@/hooks/useMachineSetting";
import {useMachineToolNavigation} from "@/hooks/useMachineToolNavigation";
import {useSavedMachines} from "@/hooks/useSavedMachines";
import router from "@/hooks/steadyRouter";
import type MachineControls from "@/library/machine/MachineControls";
import type {ControlIdentity, SettingId} from "@/library/machine/controlModel";
import {isSettingId, MACHINE_SETTING_TITLES} from "@/library/machine/settingEditor";

function SettingScreen({identity, setting, name, injected}: {
    identity: ControlIdentity; setting: SettingId; name: string; injected?: MachineControls;
}) {
    const {palette, primary} = useAppearance();
    const insets = useSafeAreaInsets();
    const {controls, snapshot} = useMachineControls(injected);
    const state = useMachineSetting(identity, setting, controls, snapshot);
    const nav = useMachineToolNavigation(identity, controls, "setting");
    const prompt = nav.prompt;
    const current = state.support.reading === "unavailable" ? null : snapshot.settings?.[setting] ?? null;
    return <YStack flex={1} backgroundColor={palette.base}>
        <YStack testID="machine-setting-content" flex={1} minHeight={0}
            accessibilityElementsHidden={nav.covered}
            importantForAccessibility={nav.covered ? "no-hide-descendants" : "auto"}>
            <ScreenHeader title={MACHINE_SETTING_TITLES[setting]}
                subtitle={`${name} · ${identity.serial ?? "Serial not known"}`}
                onBack={() => nav.requestDeparture(() => router.back())}/>
            <ScrollView flex={1} contentContainerStyle={{padding: 16, paddingBottom: Math.max(insets.bottom, 16)}}>
                <MachineSettingEditor draft={state.draft} policy={state.support.policy}
                    reading={state.support.reading} current={current}
                    editable={state.editable} canApply={state.canApply} pending={state.pending}
                    applied={state.applied} unavailable={state.support.unavailable} error={state.error}
                    recoverable={state.support.recoverable} onChange={state.change}
                    onChooseCurrent={state.chooseCurrent} onRead={state.read} onApply={state.apply} onRecover={state.recover}/>
            </ScrollView>
        </YStack>
        {prompt && <XbrwSheet open={prompt.open} onOpenChange={prompt.onOpenChange} title="Leave setting?">
            <YStack gap="$4">
                <Text color={palette.text}>{prompt.busy ? "Wait for the in-flight readback before leaving."
                    : prompt.requiresReconciliation ? "Reconcile this exact machine before releasing the settings session."
                        : "The settings operation has finished. The local proposal will be discarded."}</Text>
                {prompt.error && <Text selectable color={palette.danger}>{prompt.error}</Text>}
                <Button accessibilityRole="button" disabled={prompt.busy} accessibilityState={{busy: prompt.busy}}
                    backgroundColor={primary.fill} color={primary.ink}
                    onPress={() => { void prompt.stopAndLeave(); }}>
                    {prompt.busy ? "Waiting for confirmation…" : prompt.requiresReconciliation ? "Reconcile and leave" : "Leave"}
                </Button>
                <Button accessibilityRole="button" onPress={prompt.stay}>Stay</Button>
            </YStack>
        </XbrwSheet>}
    </YStack>;
}

export default function MachineSettingScreen({controls}: {controls?: MachineControls}) {
    const {machineId, setting} = useLocalSearchParams<{machineId?: string | string[]; setting?: string | string[]}>();
    const {machines} = useSavedMachines();
    const {palette} = useAppearance();
    const matches = typeof machineId === "string" ? machines.filter(machine => machine.id === machineId) : [];
    const machine = matches.length === 1 ? matches[0] : null;
    if (!machine || !isSettingId(setting)) {
        return <YStack flex={1} backgroundColor={palette.base}>
            <ScreenHeader title="Machine setting" onBack={() => router.back()}/>
            <Text selectable padding="$4" color={palette.danger}>
                Invalid machine setting link. Choose one saved machine and one known setting.
            </Text>
        </YStack>;
    }
    const identity = {deviceId: machine.id, serial: machine.serial.trim() || null};
    return <SettingScreen key={JSON.stringify([identity, setting])} identity={identity} setting={setting}
        name={machine.label || machine.advertisedName || machine.id} injected={controls}/>;
}
