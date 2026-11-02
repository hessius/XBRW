import React, {useState} from "react";
import {ScrollView, Text, YStack} from "tamagui";
import {useLocalSearchParams} from "expo-router";
import {useSafeAreaInsets} from "react-native-safe-area-context";
import MachineDetailSheet from "@/components/MachineDetailSheet";
import ForgetMachineSheet from "@/components/ForgetMachineSheet";
import MachineSettingsList, {machineSettingRoute} from "@/components/MachineSettingsList";
import MachineTools from "@/components/MachineTools";
import ScreenHeader from "@/components/ScreenHeader";
import SettingsActionRow from "@/components/SettingsActionRow";
import SettingsSection from "@/components/SettingsSection";
import {notify} from "@/components/XbrwToast";
import {useAppearance} from "@/hooks/useAppearance";
import {useLiveBrew} from "@/hooks/useLiveBrew";
import {useMachine} from "@/hooks/useMachine";
import {useSavedMachines} from "@/hooks/useSavedMachines";
import router from "@/hooks/steadyRouter";
import type MachineControls from "@/library/machine/MachineControls";
import {machineLabel, type SavedMachine} from "@/library/machine/savedMachines";

function MachinePage({entry, index, controls}: {
    entry: SavedMachine; index: number; controls?: MachineControls;
}) {
    const {palette} = useAppearance();
    const insets = useSafeAreaInsets();
    const {machine, remembered, status, choose, changeBlocker} = useMachine();
    const {ratingNoteOpen} = useLiveBrew();
    const [managing, setManaging] = useState(false);
    const [forgetId, setForgetId] = useState<string | null>(null);
    const name = machineLabel(entry, index);
    const identity = {deviceId: entry.id, serial: entry.serial.trim() || null};
    const linked = status === "connected" && machine.linkedDeviceId === entry.id;
    const info = linked && machine.info !== null
        && (identity.serial === null || machine.info.serial.trim() === identity.serial)
        ? machine.info : null;
    const selected = remembered === entry.id;
    const blocker = changeBlocker
        ?? (status === "connecting" ? "A connection is already being made." : null);
    // Easy Mode predates explicit tool routes and follows the selected machine.
    // Never open it on behalf of a different saved machine.
    const easyModeAllowed = selected
        && (machine.linkedDeviceId === null || (linked && info !== null));
    const covered = managing || forgetId !== null || ratingNoteOpen;

    function activate() {
        if (blocker !== null) return;
        notify({tone: "info", message: `Connecting to ${name}…`});
        choose(entry.id).then(
            () => notify({tone: "success", message: `Connected to ${name}`}),
            (error: unknown) => notify({
                tone: "error", message: `${error instanceof Error ? error.message : String(error)} `
                    + "Check it is switched on and nearby, then try again."
            })
        );
    }

    return <>
        <YStack testID="machine-home-content" flex={1} backgroundColor={palette.base}
            accessibilityElementsHidden={covered}
            importantForAccessibility={covered ? "no-hide-descendants" : "auto"}>
            <ScreenHeader title={name} subtitle={entry.serial || "Serial not known"}
                onBack={() => router.back()}/>
            <ScrollView flex={1} contentContainerStyle={{
                padding: 16, paddingBottom: Math.max(insets.bottom, 16), gap: 20
            }}>
                <SettingsSection title="Use">
                    <YStack padding="$3"><MachineTools machineId={entry.id}/></YStack>
                    <SettingsActionRow label="Easy Mode slots"
                        disabled={!easyModeAllowed}
                        detail={easyModeAllowed ? "A, B and C recipes for this machine."
                            : "Use this machine now before opening its Easy Mode slots."}
                        onPress={() => {
                            if (easyModeAllowed) router.push("/easyMode");
                        }}/>
                </SettingsSection>
                <MachineSettingsList identity={identity} controls={controls}
                    onSelect={setting => router.push(machineSettingRoute(entry.id, setting))}/>
                <SettingsSection title="This machine">
                    <YStack gap="$2" padding="$4">
                        <Text color={palette.dim}>
                            {selected ? linked ? "Selected and connected." : "Selected. Not connected."
                                : "Not selected. Opening this page does not switch machines."}
                        </Text>
                        <Text selectable color={palette.text}>
                            {`Reported model: ${info === null ? "Unavailable" : info.model || machine.modelNumber || "Unavailable"}`}
                        </Text>
                        <Text selectable color={palette.text}>
                            {`Firmware: ${info?.firmware || "Unavailable"}`}
                        </Text>
                    </YStack>
                    {!(selected && linked && info !== null) && <SettingsActionRow
                        label="Use this machine now" disabled={blocker !== null}
                        detail={blocker ?? "Selects this saved machine and connects to it."}
                        onPress={activate}/>}
                    <SettingsActionRow label="Manage machine"
                        detail="Name, model, colour and connection order."
                        onPress={() => setManaging(true)}/>
                </SettingsSection>
            </ScrollView>
        </YStack>
        <MachineDetailSheet machineId={managing ? entry.id : null}
            onClose={() => setManaging(false)} onForget={setForgetId}/>
        <ForgetMachineSheet machineId={forgetId} onClose={() => setForgetId(null)}/>
    </>;
}

export default function MachineHomeScreen({controls}: {controls?: MachineControls}) {
    const {machineId} = useLocalSearchParams<{machineId?: string | string[]}>();
    const {machines} = useSavedMachines();
    const {palette} = useAppearance();
    const {ratingNoteOpen} = useLiveBrew();
    const matches = typeof machineId === "string" && machineId.trim() !== ""
        ? machines.filter(entry => entry.id === machineId) : [];
    if (matches.length !== 1) {
        return <YStack testID="machine-home-invalid" flex={1} backgroundColor={palette.base}
            accessibilityElementsHidden={ratingNoteOpen}
            importantForAccessibility={ratingNoteOpen ? "no-hide-descendants" : "auto"}>
            <ScreenHeader title="Machine settings and tools" onBack={() => router.back()}/>
            <Text selectable padding="$4" color={palette.danger}>
                Invalid machine link. Choose one saved machine.
            </Text>
        </YStack>;
    }
    const entry = matches[0];
    return <MachinePage key={entry.id} entry={entry} index={machines.indexOf(entry)} controls={controls}/>;
}
