import React, {useEffect, useState} from "react";
import {Pressable} from "react-native";
import router from "@/hooks/steadyRouter";
import {Text, XStack, YStack} from "tamagui";

import MachineCard from "@/components/MachineCard";
import {MODEL_NAMES} from "@/components/MachinePickerSheet";
import SettingsActionRow from "@/components/SettingsActionRow";
import SettingsChoiceRow from "@/components/SettingsChoiceRow";
import SettingsSection, {SettingsSectionTitle} from "@/components/SettingsSection";
import {notify} from "@/components/XbrwToast";
import {palette} from "@/constants/colors";
import {useMachine} from "@/hooks/useMachine";
import {useSavedMachines} from "@/hooks/useSavedMachines";
import {useSetting} from "@/hooks/useSetting";
import type {Settings} from "@/library/Settings";
import {MACHINE_MODELS, isMachineModel, type MachineModel} from "@/library/machine/machineModel";
import {machineLabel, machineTag, type SavedMachine} from "@/library/machine/savedMachines";

/** How many taps on the firmware row open the console. */
const CONSOLE_TAPS = 7;

/**
 * What each model is called on screen.
 *
 * A `Record` rather than a hand-written option list, so adding a third machine
 * is a compile error here rather than a button that quietly never appears.
 * `SegmentOption.value` is a bare `string`, so restating the values would have
 * had no link to `MACHINE_MODELS` at all: a typo would compile, the guard below
 * would reject it, and the segment would simply do nothing.
 */
const MACHINE_MODEL_LABELS: Record<MachineModel, string> = {
    studio:   "Studio",
    original: "Original"
};

const MACHINE_MODEL_OPTIONS = MACHINE_MODELS.map(
    (value) => ({value, label: MACHINE_MODEL_LABELS[value]})
);

/** Why the model matters, short enough to sit inside a machine's card. */
const MODEL_DESCRIPTION =
    "Choose your model for matching imports. Grind scales differ. Saved recipes stay unchanged.";

/** One label-and-value line of the machine's own vitals. */
function Vital({label, value}: {label: string; value: string}) {
    return (
        <XStack justifyContent="space-between" paddingVertical="$2" paddingHorizontal="$4">
            <Text color={palette.dim} fontSize={13}>{label}</Text>
            <Text color={palette.text} fontSize={13}>{value}</Text>
        </XStack>
    );
}

/** A card's own surface, for the rows that are not a machine. */
function Card({children}: {children: React.ReactNode}) {
    return (
        <YStack backgroundColor={palette.surface} borderRadius="$5" overflow="hidden">
            {children}
        </YStack>
    );
}

/**
 * Model, place in the order and link, as one line under a machine's name.
 *
 * The star is the default's mark; the words say it too, for a screen reader
 * and for anybody who does not read stars as "default".
 */
function machineSummary(machine: SavedMachine, index: number, active: boolean, connected: boolean): string {
    const parts = [MODEL_NAMES[machine.model], index === 0 ? "Default" : `Choice ${index + 1}`,
                   machineTag(machine)];
    if (active) parts.push(connected ? "Connected" : "In use");
    return parts.join(" · ");
}

/**
 * Settings → Machines.
 *
 * First on the screen, and always rendered, paired or not. The editor only
 * grows a BREW action once a machine has been remembered, so without this
 * section there would be nothing anywhere in the app telling a new owner that
 * pairing is possible — and a dead BREW button on every recipe, for the users
 * who will never own a J15, is the worse trade.
 *
 * One card per saved machine, closed until tapped (see `MachineCard`). With
 * none saved there is nothing to fold, so the model choice and Connect sit in
 * a plain card the way they always did.
 *
 * The console's hidden entry is seven taps: on the firmware row when a machine
 * is connected, on the status line when it is not. Both, because the console is
 * the only place a failed connection can be read about, and the firmware row is
 * not rendered when there is no connection to report the firmware of.
 */
export default function MachineSection({settings, onOpenMachine, onAddMachine}: {
    settings?: Settings;
    /**
     * Open one saved machine's sheet, for its name and its place in the
     * order. The screen owns the sheet, because a sheet inside this section's
     * scroll view would have no height.
     */
    onOpenMachine?: (id: string) => void;
    /** Open the add-a-machine sheet, which the screen owns for the same reason. */
    onAddMachine?: () => void;
}) {
    // The injected store matters: the link writes `machineModel` through it
    // when it recognises a Studio, and a test that injected a store while the
    // hook wrote to the shared one would watch the correction land somewhere
    // this row cannot see.
    const {machine, status, error, remembered, connect, canOpenSettings, openSettings,
           machines, changeBlocker, choose, forgetMachine}
        = useMachine(undefined, {settings});
    const {setModel} = useSavedMachines(settings);
    const several = machines.length >= 2;
    const [machineModel, setMachineModel] = useSetting("machineModel", settings);
    const [taps, setTaps] = useState(0);
    const info = machine.info;

    /** What the section says when there is no live link. */
    const idleStatus = status === "connecting" ? "Connecting…"
        : remembered === "" ? "No machine paired"
            : status === "idle" ? `Not connected · ${remembered}`
                : `Not in range · ${remembered}`;

    // The vitals are a snapshot taken at connect. Left alone, a tank refilled
    // since then still reads Low here, and only a relaunch clears it.
    useEffect(() => {
        if (status !== "connected") return;
        machine.askHowItIsDoing().catch((error: unknown) => {
            notify({tone: "error", message: error instanceof Error ? error.message : String(error)});
        });
    }, [machine, status]);

    function onSecretPress() {
        const next = taps + 1;
        setTaps(next);
        if (next >= CONSOLE_TAPS) {
            setTaps(0);
            router.push("/machine");
        }
    }

    /** The link's state in words, and the seven-tap way into the console. */
    const statusLine = status !== "connected" && (
        <Pressable accessibilityRole="text"
                   accessibilityLabel={idleStatus}
                   onPress={onSecretPress}>
            <YStack paddingVertical="$3" paddingHorizontal="$4">
                <Text color={palette.dim} fontSize={13}>
                    {idleStatus}
                </Text>
                {error !== null && (
                    <Text color={palette.danger} fontSize={13} marginTop="$1">{error}</Text>
                )}
            </YStack>
        </Pressable>
    );

    /*
     * Android only. A Bluetooth permission refused twice can no longer be
     * asked for, so Connect would do nothing at all and the message above
     * would be the end of the road. Offered as its own row rather than inside
     * the status block, which is the seven-tap console entry and must stay a
     * single target.
     */
    const openSettingsRow = canOpenSettings && (
        <SettingsActionRow
            label="Open app settings"
            detail="Bluetooth permission can only be turned back on there."
            onPress={openSettings}/>
    );

    const connectRow = (model: string) => (
        <SettingsActionRow
            label={status === "connected" ? "Connected" : "Connect to my machine"}
            detail={status === "connected"
                ? "The link is held while XBRW++ is open."
                // Naming the Studio to somebody who just said they own an
                // original reads as if the app forgot. It is also the one
                // place worth admitting that a scan will find their machine
                // and the connection after it probably will not finish: the
                // Bluetooth protocol here is the Studio's throughout, and
                // nobody has had an original in front of them to check.
                : model === "original"
                    ? "Your xBloom has to be switched on and nearby. Only the Studio has been tested."
                    : "Your xBloom Studio has to be switched on and nearby."}
            onPress={() => {
                // The throw is for the brew path, which needs the reason.
                // Here the reason is already on screen, in `error`.
                if (status !== "connected") connect().catch(() => {});
            }}/>
    );

    /** Switch to a machine that is saved but not in use, the way its sheet does. */
    function switchTo(entry: SavedMachine, name: string) {
        if (changeBlocker !== null) return;
        notify({tone: "info", message: `Connecting to ${name}…`});
        choose(entry.id).then(
            () => notify({tone: "success", message: `Connected to ${name}`}),
            (failure: unknown) => notify({
                tone: "error",
                message: `${failure instanceof Error ? failure.message : String(failure)} `
                    + "Check it is switched on and nearby, then try again."
            })
        );
    }

    if (machines.length === 0) {
        return (
            <SettingsSection title="Machines">
                <SettingsChoiceRow
                    label="Your xBloom"
                    description={MODEL_DESCRIPTION}
                    stacked
                    value={machineModel}
                    options={MACHINE_MODEL_OPTIONS}
                    onChange={(value) => {
                        // Only the options above can arrive here, so a value that is
                        // not a model is a bug in this file rather than a stale
                        // preference to coerce. Hence the guard and not a fallback.
                        if (isMachineModel(value)) setMachineModel(value);
                    }}/>
                {statusLine}
                {openSettingsRow}
                {connectRow(machineModel)}
            </SettingsSection>
        );
    }

    return (
        <YStack gap="$2" paddingTop="$4">
            <SettingsSectionTitle title="Machines"/>
            {machines.map((entry, index) => {
                const active = entry.id === remembered;
                const linked = active && status === "connected";
                const name = machineLabel(entry, index);
                return (
                    <MachineCard
                        key={entry.id}
                        testID={`saved-machine-${entry.id}`}
                        title={name}
                        summary={machineSummary(entry, index, active, status === "connected")}
                        isDefault={index === 0}
                        connected={linked}
                        details={active && info !== null ? (
                            <>
                                <Vital label="Serial" value={info.serial}/>
                                <Vital label="Model" value={info.model}/>
                                <Pressable accessibilityRole="button"
                                           accessibilityLabel={`Firmware, ${info.firmware}`}
                                           onPress={onSecretPress}>
                                    <Vital label="Firmware" value={info.firmware}/>
                                </Pressable>
                                <Vital label="Water" value={info.waterFeed === "tap"
                                    ? "Plumbed"
                                    : info.waterEnough ? "OK" : "Low"}/>
                                <Vital label="Grind size" value={String(info.grindSize)}/>
                                <Vital label="Mode" value={info.mode}/>
                            </>
                        ) : (
                            <>
                                {entry.serial !== "" && <Vital label="Serial" value={entry.serial}/>}
                                <Text color={palette.dim} fontSize={13}
                                      paddingVertical="$2" paddingHorizontal="$4">
                                    Firmware, water, grind size and mode show here while this machine is connected.
                                </Text>
                            </>
                        )}
                        footer={(
                            <SettingsActionRow
                                label="Forget this machine" tone="danger"
                                // Locked while a brew owns the link: forgetting
                                // the machine in use mid-brew would hand the next
                                // BREW to another machine while this one pours.
                                detail={changeBlocker ?? (several
                                    ? "Takes it off the list. Add it again to get it back."
                                    : "XBRW++ will scan again next time.")}
                                onPress={() => {
                                    if (changeBlocker === null) void forgetMachine(entry.id);
                                }}/>
                        )}>
                        {active && statusLine}
                        {active && openSettingsRow}
                        {active ? connectRow(entry.model) : (
                            <SettingsActionRow
                                label="Use this machine now"
                                detail={changeBlocker ?? "Connects to it until the app is closed."}
                                onPress={() => switchTo(entry, name)}/>
                        )}
                        <SettingsChoiceRow
                            label="Model"
                            description={MODEL_DESCRIPTION}
                            stacked
                            value={entry.model}
                            options={MACHINE_MODEL_OPTIONS}
                            onChange={(value) => {
                                if (isMachineModel(value)) setModel(entry.id, value);
                            }}/>
                        <SettingsActionRow
                            label={several ? "Name and order" : "Name"}
                            detail={several
                                ? "Rename it, make it the default or change its place in the list."
                                : "Give it a name, like Home or Work."}
                            onPress={() => onOpenMachine?.(entry.id)}/>
                    </MachineCard>
                );
            })}

            <Card>
                <SettingsActionRow
                    label="Add another machine"
                    detail="Switch the new one on and keep it nearby. Machines already saved are skipped."
                    onPress={() => onAddMachine?.()}/>
            </Card>
        </YStack>
    );
}
