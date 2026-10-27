import React from "react";
import {Button, Text, YStack} from "tamagui";
import {MachineNumericControl} from "@/components/MachineControlReadout";
import {useAppearance} from "@/hooks/useAppearance";
import type {MachineSettingsSupport} from "@/library/machine/MachineControls";
import type {SettingEditorState, SettingPolicy, SettingValues} from "@/library/machine/controlModel";
import {MACHINE_SETTING_TITLES, settingValueLabel} from "@/library/machine/settingEditor";

type Props = {
    draft: SettingEditorState;
    policy: SettingPolicy;
    reading: MachineSettingsSupport["reading"];
    current: SettingValues[keyof SettingValues] | null;
    editable: boolean;
    canApply: boolean;
    pending: boolean;
    applied: boolean;
    unavailable: string | null;
    error: string | null;
    recoverable: boolean;
    reconnectable: boolean;
    onChange: (draft: SettingEditorState) => void;
    onChooseCurrent: () => void;
    onRead: () => void;
    onApply: () => void;
    onRecover: () => void;
    onReconnect: () => void;
};

function ProposalControls({draft, policy, editable, onChange}: Pick<Props, "draft" | "policy" | "editable" | "onChange">) {
    const {palette, selection} = useAppearance();
    switch (draft.id) {
        case "temperatureUnit":
            return <YStack gap="$2">{policy.temperatureUnit?.map(value =>
                <Button key={value} accessibilityRole="button" disabled={!editable}
                    accessibilityState={{selected: draft.proposal === value}}
                    backgroundColor={draft.proposal === value ? selection.fill : palette.control}
                    color={draft.proposal === value ? selection.ink : palette.text}
                    onPress={() => onChange({id: draft.id, proposal: value})}>{settingValueLabel(value)}</Button>
            )}</YStack>;
        case "weightUnit":
            return <YStack gap="$2">{policy.weightUnit?.map(value =>
                <Button key={value} accessibilityRole="button" disabled={!editable}
                    accessibilityState={{selected: draft.proposal === value}}
                    backgroundColor={draft.proposal === value ? selection.fill : palette.control}
                    color={draft.proposal === value ? selection.ink : palette.text}
                    onPress={() => onChange({id: draft.id, proposal: value})}>{settingValueLabel(value)}</Button>
            )}</YStack>;
        case "waterSource":
            return <YStack gap="$2">{policy.waterSource?.map(value =>
                <Button key={value} accessibilityRole="button" disabled={!editable}
                    accessibilityState={{selected: draft.proposal === value}}
                    backgroundColor={draft.proposal === value ? selection.fill : palette.control}
                    color={draft.proposal === value ? selection.ink : palette.text}
                    onPress={() => onChange({id: draft.id, proposal: value})}>{settingValueLabel(value)}</Button>
            )}</YStack>;
        case "brightness": case "pourRadius": case "vibrationAmplitude": {
            const rule = policy[draft.id] ?? null;
            return <YStack gap="$2">
                <MachineNumericControl label={MACHINE_SETTING_TITLES[draft.id]} value={draft.proposal}
                    policy={rule} unit={rule?.unit} editable={editable}
                    onChange={proposal => onChange({id: draft.id, proposal})}/>
                {!rule?.unit && <Text color={palette.muted}>Unit unavailable. No physical unit has been qualified.</Text>}
            </YStack>;
        }
    }
}

/** Machine readings and local proposals are deliberately separate surfaces. */
export default function MachineSettingEditor({
    draft, policy, reading, current, editable, canApply, pending, applied, unavailable, error,
    recoverable, reconnectable, onChange, onChooseCurrent, onRead, onApply, onRecover, onReconnect
}: Props) {
    const {palette, primary} = useAppearance();
    const title = MACHINE_SETTING_TITLES[draft.id];
    const numeric = draft.id === "brightness" || draft.id === "pourRadius" || draft.id === "vibrationAmplitude";
    const unit = numeric ? policy[draft.id]?.unit : undefined;
    const observed = current === null ? "Unavailable"
        : `${settingValueLabel(current)}${unit ? ` ${unit}` : ""}`;
    return <YStack gap="$4">
        <YStack gap="$2">
            <Text color={palette.muted}>{reading === "current" ? "Current machine value"
                : reading === "last-known" ? "Last-known machine value" : "Current machine value unavailable"}</Text>
            <Text selectable accessibilityLabel={`${title} ${reading}: ${observed}`}
                color={palette.text} fontSize={24}>{observed}</Text>
            {reading === "unavailable" && <Text color={palette.muted}>Missing qualified readback. Read current value explicitly.</Text>}
            {unavailable && <Text selectable color={palette.muted}>{unavailable}</Text>}
            <Button accessibilityRole="button" disabled={!editable} onPress={onRead}>Read current value</Button>
            {recoverable && <Button accessibilityRole="button" disabled={pending} onPress={onRecover}>
                Reconcile connected machine
            </Button>}
            {reconnectable && <>
                <Text color={palette.muted}>
                    Reconnect only this machine to inspect the uncertain setting. Read and Apply are never replayed.
                </Text>
                <Button accessibilityRole="button" disabled={pending} onPress={onReconnect}>
                    Reconnect named machine
                </Button>
            </>}
        </YStack>
        <Text color={palette.text}>Proposal · {settingValueLabel(draft.proposal)}{draft.proposal !== null && unit ? ` ${unit}` : ""}</Text>
        <Text color={palette.muted}>Changing a proposal sends nothing. Back discards it. Apply is a separate machine operation.</Text>
        {(draft.id === "temperatureUnit" || draft.id === "weightUnit") && <Text color={palette.muted}>
            This changes only the machine’s unit. App display preferences stay unchanged.
        </Text>}
        {numeric && draft.proposal === null && <Button accessibilityRole="button"
            disabled={!editable || reading !== "current"} onPress={onChooseCurrent}>Use current value as proposal</Button>}
        <ProposalControls draft={draft} policy={policy} editable={editable} onChange={onChange}/>
        {draft.id === "waterSource" && <Text color={palette.text}>
            Tank uses the machine’s refillable water tank. Plumbed supply uses an actual connected water line.
            Check the machine’s physical water supply before Apply; this does not connect plumbing or refill the tank.
        </Text>}
        {error && <Text selectable color={palette.danger}>{error}</Text>}
        {applied && reading === "current" && <Text color={palette.text}>Applied · confirmed by fresh matching machine readback.</Text>}
        {pending && <Text color={palette.muted}>Waiting for qualified machine readback…</Text>}
        <Button accessibilityRole="button" disabled={!canApply || pending} accessibilityState={{busy: pending}}
            backgroundColor={primary.fill} color={primary.ink} onPress={onApply}>Apply</Button>
    </YStack>;
}
