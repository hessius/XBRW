import React, {useEffect, useState} from "react";
import {Pressable, ScrollView} from "react-native";
import {Text, XStack, YStack} from "tamagui";

import SettingsActionRow from "@/components/SettingsActionRow";
import SettingsChoiceRow from "@/components/SettingsChoiceRow";
import SettingsSection from "@/components/SettingsSection";
import SettingsToggleRow from "@/components/SettingsToggleRow";
import XbrwSheet from "@/components/XbrwSheet";
import {notify} from "@/components/XbrwToast";

import {useAppearance} from "@/hooks/useAppearance";
import {useMachine} from "@/hooks/useMachine";
import type {Settings} from "@/library/Settings";
import type {MachineInfo} from "@/library/machine/protocol";

type Props = {
    /** The machine on show, or null when the sheet is closed. */
    machineId: string | null;
    onClose: () => void;
    settings?: Settings;
};

/** Human-readable labels for settings values. */
const TEMP_UNIT_LABELS: Record<0 | 1, string> = {0: "°F (Fahrenheit)", 1: "°C (Celsius)"};
const WEIGHT_UNIT_LABELS: Record<0 | 1 | 2, string> = {0: "ml", 1: "g", 2: "oz"};
const BRIGHTNESS_LABELS: Record<number, string> = {0: "Off", 1: "Dim", 8: "Mid", 15: "Bright"};
const WATER_SOURCE_LABELS: Record<0 | 1, string> = {0: "Tank", 1: "Tap (plumbed)"};

const TEMP_UNIT_OPTIONS = [
    {value: "0", label: TEMP_UNIT_LABELS[0]},
    {value: "1", label: TEMP_UNIT_LABELS[1]},
] as const;

const WEIGHT_UNIT_OPTIONS = [
    {value: "0", label: WEIGHT_UNIT_LABELS[0]},
    {value: "1", label: WEIGHT_UNIT_LABELS[1]},
    {value: "2", label: WEIGHT_UNIT_LABELS[2]},
] as const;

const BRIGHTNESS_OPTIONS = [
    {value: "0", label: BRIGHTNESS_LABELS[0]},
    {value: "1", label: BRIGHTNESS_LABELS[1]},
    {value: "8", label: BRIGHTNESS_LABELS[8]},
    {value: "15", label: BRIGHTNESS_LABELS[15]},
] as const;

const WATER_SOURCE_OPTIONS = [
    {value: "0", label: WATER_SOURCE_LABELS[0]},
    {value: "1", label: WATER_SOURCE_LABELS[1]},
] as const;

export default function MachineSettingsSheet({machineId, onClose, settings}: Props) {
    const {palette} = useAppearance();
    const {machine, status, remembered, changeBlocker} = useMachine(undefined, {settings});
    const info = machine.info;
    const active = machineId === remembered;
    const linked = machineId === machine.linkedDeviceId;

    const [sending, setSending] = useState<string | null>(null);
    const [lastReadback, setLastReadback] = useState<Partial<MachineInfo> | null>(null);
    const [showReadback, setShowReadback] = useState(false);

    // Refresh readback when info changes
    useEffect(() => {
        if (info !== null) {
            setLastReadback({
                tempUnit: info.tempUnit,
                weightUnit: info.weightUnit,
                brightness: info.brightness,
                waterFeed: info.waterFeed,
                pourRadius: info.pourRadius,
                vibration: info.vibration,
            });
        }
    }, [info]);

    async function sendSetting<T>(
        label: string,
        send: () => Promise<T | null>,
        onSuccess?: (value: T) => void
    ): Promise<void> {
        if (!linked) {
            notify({tone: "error", message: "Machine must be connected to change settings."});
            return;
        }
        if (changeBlocker !== null) {
            notify({tone: "error", message: changeBlocker});
            return;
        }
        setSending(label);
        try {
            const result = await send();
            if (result !== null) {
                notify({tone: "success", message: `${label} set to ${result}`});
                onSuccess?.(result);
            } else {
                notify({tone: "info", message: `${label} sent but no readback received. Check machine display.`});
            }
        } catch (error) {
            notify({tone: "error", message: `Failed to set ${label}: ${(error as Error).message}`});
        } finally {
            setSending(null);
        }
    }

    async function readSetting(label: string, send: () => Promise<number | null>): Promise<void> {
        if (!linked) {
            notify({tone: "error", message: "Machine must be connected to read settings."});
            return;
        }
        setSending(`Reading ${label}…`);
        try {
            const result = await send();
            if (result !== null) {
                notify({tone: "success", message: `${label}: ${result}`});
            } else {
                notify({tone: "info", message: `No readback for ${label}. Check machine display.`});
            }
        } catch (error) {
            notify({tone: "error", message: `Failed to read ${label}: ${(error as Error).message}`});
        } finally {
            setSending(null);
        }
    }

    // Temperature Unit
    const currentTempUnit = info?.tempUnit ?? 1;
    function onTempUnitChange(value: string) {
        sendSetting(
            "Temperature unit",
            () => machine.setTemperatureUnit(Number(value) as 0 | 1),
            (result) => notify({tone: "success", message: `Temperature unit: ${TEMP_UNIT_LABELS[result]}`})
        );
    }

    // Weight Unit
    const currentWeightUnit = info?.weightUnit ?? 1;
    function onWeightUnitChange(value: string) {
        sendSetting(
            "Weight unit",
            () => machine.setWeightUnit(Number(value) as 0 | 1 | 2),
            (result) => notify({tone: "success", message: `Weight unit: ${WEIGHT_UNIT_LABELS[result]}`})
        );
    }

    // Brightness
    const currentBrightness = info?.brightness ?? 10;
    function onBrightnessChange(value: string) {
        sendSetting(
            "Brightness",
            () => machine.setBrightness(Number(value) as 0 | 1 | 8 | 15),
            (result) => notify({tone: "success", message: `Brightness: ${BRIGHTNESS_LABELS[result]}`})
        );
    }

    // Water Source
    const currentWaterSource = info?.waterFeed === "tap" ? 1 : 0;
    function onWaterSourceChange(value: string) {
        const source = Number(value) as 0 | 1;
        if (source === 1) {
            // Warn about physical water supply
            if (!confirm("Switching to Tap (plumbed) requires a physical water connection. Is the machine plumbed in?")) {
                return;
            }
        }
        sendSetting(
            "Water source",
            () => machine.setWaterSource(source),
            (result) => notify({tone: "success", message: `Water source: ${WATER_SOURCE_LABELS[result]}`})
        );
    }

    // Pour Radius (read only)
    function onReadPourRadius() {
        readSetting("Pour radius", () => machine.readPourRadius());
    }

    // Vibration (read only)
    function onReadVibration() {
        readSetting("Vibration amplitude", () => machine.readVibrationAmplitude());
    }

    // Refresh all
    function onRefreshAll() {
        if (!linked) {
            notify({tone: "error", message: "Machine must be connected to refresh."});
            return;
        }
        setSending("Refreshing…");
        machine.refreshInfo().then(() => {
            setSending(null);
            notify({tone: "success", message: "Settings refreshed from machine."});
        }).catch((error) => {
            setSending(null);
            notify({tone: "error", message: `Refresh failed: ${(error as Error).message}`});
        });
    }

    if (!machineId) return null;

    return (
        <XbrwSheet open={machineId !== null} onOpenChange={onClose} title="Machine Settings" heightPercent={85}>
            <ScrollView style={{flex: 1}} contentContainerStyle={{paddingBottom: 24}}>
                <YStack gap="$3">
                    <Text fontSize={13} color={palette.dim}>
                        {linked ? "Connected — changes apply immediately with readback." : "Connect the machine to change settings."}
                    </Text>
                    {sending && (
                        <Text fontSize={13} color={palette.warn}>{sending}…</Text>
                    )}

                    <SettingsSection title="Display & Units">
                        <SettingsChoiceRow
                            label="Temperature"
                            description="Changes the unit shown on the machine and in the app. Readback confirmed on V12.0D.500."
                            value={String(currentTempUnit)}
                            options={TEMP_UNIT_OPTIONS}
                            onChange={onTempUnitChange}
                            disabled={!linked || sending !== null}
                        />
                        <SettingsChoiceRow
                            label="Weight"
                            description="Changes the unit shown on the machine and in the app. Readback confirmed on V12.0D.500."
                            value={String(currentWeightUnit)}
                            options={WEIGHT_UNIT_OPTIONS}
                            onChange={onWeightUnitChange}
                            disabled={!linked || sending !== null}
                        />
                        <SettingsChoiceRow
                            label="Brightness"
                            description="Display brightness level. Readback confirmed on V12.0D.500."
                            value={String(currentBrightness)}
                            options={BRIGHTNESS_OPTIONS}
                            onChange={onBrightnessChange}
                            disabled={!linked || sending !== null}
                        />
                    </SettingsSection>

                    <SettingsSection title="Water Supply">
                        <SettingsChoiceRow
                            label="Water source"
                            description="Tank = internal reservoir. Tap = plumbed water line. Check physical connection before switching to Tap. Readback confirmed on V12.0D.500."
                            value={String(currentWaterSource)}
                            options={WATER_SOURCE_OPTIONS}
                            onChange={onWaterSourceChange}
                            disabled={!linked || sending !== null}
                        />
                        <Text fontSize={12} color={palette.dim}>
                            Current: {WATER_SOURCE_LABELS[currentWaterSource]}
                            {info?.waterFeed === "tank" && info?.waterEnough === false && " · ⚠ Tank low"}
                        </Text>
                    </SettingsSection>

                    <SettingsSection title="Mechanical Calibration (Read Only)">
                        <SettingsActionRow
                            label="Read pour radius"
                            detail={info?.pourRadius !== undefined ? `${info.pourRadius}` : "Not read yet"}
                            onPress={onReadPourRadius}
                            disabled={!linked || sending !== null}
                        />
                        <SettingsActionRow
                            label="Read vibration amplitude"
                            detail={info?.vibration !== undefined ? `${info.vibration}` : "Not read yet"}
                            onPress={onReadVibration}
                            disabled={!linked || sending !== null}
                        />
                        <Text fontSize={12} color={palette.dim}>
                            Write commands (11507, 11509) are unconfirmed and not offered.
                            <Text>&nbsp;</Text>
                            {"Range: radius 400–1000 (step 80), vibration 1000–1500 (step 100)."}
                        </Text>
                    </SettingsSection>

                    <SettingsSection title="Machine Identity">
                        <Text fontSize={12} color={palette.dim}>
                            Serial: {info?.serial ?? machineId}
                        </Text>
                        <Text fontSize={12} color={palette.dim}>
                            Firmware: {info?.firmware ?? "—"}
                        </Text>
                        <Text fontSize={12} color={palette.dim}>
                            Mode: {info?.mode ?? "—"}
                        </Text>
                        <Text fontSize={12} color={palette.dim}>
                            Grind size: {info?.grindSize ?? "—"}
                        </Text>
                    </SettingsSection>

                    <SettingsSection>
                        <SettingsActionRow
                            label="Refresh all from machine"
                            detail="Requests a fresh 40521 info blob"
                            onPress={onRefreshAll}
                            disabled={!linked || sending !== null}
                        />
                    </SettingsSection>

                    <SettingsSection title="About this qualification">
                        <Text fontSize={12} color={palette.dim}>
                            Settings readback verified on xBloom Studio firmware V12.0D.500
                            <Text>&nbsp;</Text>
                            (qualification run 2026-11-02).
                        </Text>
                        <Text fontSize={12} color={palette.dim}>
                            Temperature unit: 0=°F, 1=°C · Weight unit: 0=ml, 1=g, 2=oz
                        </Text>
                        <Text fontSize={12} color={palette.dim}>
                            Brightness: 0/1=dim, 8=mid, 15=bright · Water: 0=tank, 1=tap
                        </Text>
                        <Text fontSize={12} color={palette.dim}>
                            Pour radius & vibration: readback only (11506, 11508 confirmed).
                        </Text>
                    </SettingsSection>
                </YStack>
            </ScrollView>
        </XbrwSheet>
    );
}