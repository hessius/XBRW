import React from "react";
import {Button, Text, YStack} from "tamagui";
import {useAppearance} from "@/hooks/useAppearance";
import {useMachineControls} from "@/hooks/useMachineControls";
import {useMachineSettingSupport} from "@/hooks/useMachineSetting";
import type MachineControls from "@/library/machine/MachineControls";
import type {ControlIdentity, ControlSnapshot, SettingId} from "@/library/machine/controlModel";
import {MACHINE_SETTING_GROUPS, MACHINE_SETTING_TITLES, settingValueLabel} from "@/library/machine/settingEditor";

/** Task 9 navigation contract: one saved machine id and one typed setting. */
export function machineSettingRoute(machineId: string, setting: SettingId) {
    return {pathname: "/machineSetting" as const, params: {machineId, setting}};
}

function SettingRow({identity, id, controls, snapshot, onSelect}: {
    identity: ControlIdentity; id: SettingId; controls: MachineControls; snapshot: ControlSnapshot;
    onSelect: (id: SettingId) => void;
}) {
    const {palette} = useAppearance();
    const support = useMachineSettingSupport(controls, identity, id);
    const value = support.reading === "unavailable" ? null : snapshot.settings?.[id] ?? null;
    const rule = support.policy[id];
    const unit = rule && "min" in rule ? rule.unit : undefined;
    const summary = value === null ? "Unavailable · missing qualified readback"
        : `${support.reading === "last-known" ? "Last known · " : ""}${settingValueLabel(value)}${unit ? ` ${unit}` : ""}`;
    return <YStack gap="$1">
        <Button accessibilityRole="button" height="auto" minHeight={48} padding="$3"
            accessibilityLabel={`${MACHINE_SETTING_TITLES[id]}: ${summary}`} onPress={() => onSelect(id)}>
            <YStack flex={1} alignItems="flex-start" gap="$1">
                <Text color={palette.text}>{MACHINE_SETTING_TITLES[id]}</Text>
                <Text color={palette.muted}>{summary}</Text>
            </YStack>
        </Button>
        {support.unavailable && <Text color={palette.muted}>{support.unavailable}</Text>}
    </YStack>;
}

/** Summary only: mounting this list never reads, connects, switches or applies. */
export default function MachineSettingsList({identity, onSelect, controls: injected}: {
    identity: ControlIdentity; onSelect: (id: SettingId) => void; controls?: MachineControls;
}) {
    const {palette} = useAppearance();
    const {controls, snapshot} = useMachineControls(injected);
    return <YStack gap="$5">{MACHINE_SETTING_GROUPS.map(group =>
        <YStack key={group.title} gap="$3">
            <Text accessibilityRole="header" color={palette.text}>{group.title}</Text>
            {group.ids.map(id => <SettingRow key={id} id={id} identity={identity}
                controls={controls} snapshot={snapshot} onSelect={onSelect}/>)}
        </YStack>
    )}</YStack>;
}
