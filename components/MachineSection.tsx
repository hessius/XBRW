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
import {MACHINE_MODELS, isMachineModel, modelFromSerial, type MachineModel} from "@/library/machine/machineModel";
import {
    machineColourOf,
    machineLabel,
    machineOrderWord,
    machineTag,
    type SavedMachine
} from "@/library/machine/savedMachines";

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

/**
 * What the Connect row asks of the machine. The other phone is named because
 * the machine takes one phone at a time and this one cannot tell that apart
 * from a machine that is off.
 */
const CONNECT_NEEDS_STUDIO =
    "Your xBloom Studio has to be on and nearby. If another phone is connected to it, close XBRW++ or the xBloom app there.";
const CONNECT_NEEDS_ORIGINAL =
    "Your xBloom has to be on and nearby. If another phone is connected to it, close XBRW++ or the xBloom app there.";

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
 * The star marks the machine tried first; the words say it too ("Tried
 * 1st"), for a screen reader and for anybody who does not read a star that
 * way. Neither is drawn with one machine saved: there is no order. "Default"
 * used to stand here, and beside "Connected" on another card it read as a
 * second machine in use.
 */
function machineSummary(
    machine: SavedMachine, index: number, count: number, active: boolean, connected: boolean
): string {
    const order = machineOrderWord(index, count);
    const parts = [MODEL_NAMES[machine.model], ...(order === null ? [] : [order]),
                   machineTag(machine)];
    // "Selected", not "In use": this phone has no way to tell that another
    // phone holds the machine (it simply stops answering), and "In use" was
    // read as exactly that.
    if (active) parts.push(connected ? "Connected" : "Selected");
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
 * One card per saved machine (see `MachineCard`). The machine in use starts
 * open, so its status and any error need no tap; the others start closed. With
 * none saved there is nothing to fold, so the model choice and Connect sit in
 * a plain card the way they always did.
 *
 * The console's hidden entry is seven taps: on the firmware row when a machine
 * is connected, on the status line when it is not. Both, because the console is
 * the only place a failed connection can be read about, and the firmware row is
 * not rendered when there is no connection to report the firmware of.
 */
export default function MachineSection({settings, onOpenMachine, onAddMachine, onForgetMachine}: {
    settings?: Settings;
    /**
     * Open one saved machine's sheet, for its name and its place in the
     * order. The screen owns the sheet, because a sheet inside this section's
     * scroll view would have no height.
     */
    onOpenMachine?: (id: string) => void;
    /** Open the add-a-machine sheet, which the screen owns for the same reason. */
    onAddMachine?: () => void;
    /** Ask whether to forget a machine. The screen owns that sheet too. */
    onForgetMachine?: (id: string) => void;
}) {
    // The injected store matters: the link writes `machineModel` through it
    // when it recognises a Studio, and a test that injected a store while the
    // hook wrote to the shared one would watch the correction land somewhere
    // this row cannot see.
    const {machine, status, error, remembered, connect, canOpenSettings, openSettings,
           machines, changeBlocker, choose}
        = useMachine(undefined, {settings});
    const {setModel} = useSavedMachines(settings);
    const several = machines.length >= 2;
    const [machineModel, setMachineModel] = useSetting("machineModel", settings);
    const [taps, setTaps] = useState(0);
    const info = machine.info;

    /**
     * What the section says when there is no live link.
     *
     * A failed connect is "Not found" with every reason it could have,
     * because the radio cannot tell them apart: the machine takes one phone
     * at a time and, held by another, it stops answering exactly as it does
     * switched off or out of range (`ble-protocol.md`, "Single-Client
     * Limit"). The Bluetooth identifier used to follow here; it is in the
     * machine's Details now, where it is not noise.
     */
    const idleStatus = status === "connecting" ? "Connecting…"
        : remembered === "" ? "No machine paired"
            : status === "idle" ? "Not connected"
                : "Not found. It may be off, out of range or connected to another phone.";

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
                    ? `${CONNECT_NEEDS_ORIGINAL} Only the Studio has been tested.`
                    : CONNECT_NEEDS_STUDIO}
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
                // The serial set the model on connect (`recordSerial`), so a
                // choice could only point imports at the wrong grind scale.
                // Offered again whenever the serial says nothing, or says
                // something the saved model does not agree with yet.
                const modelKnown = modelFromSerial(entry.serial) === entry.model;
                return (
                    <MachineCard
                        key={entry.id}
                        testID={`saved-machine-${entry.id}`}
                        title={name}
                        summary={machineSummary(entry, index, machines.length, active,
                                                status === "connected")}
                        isDefault={several && index === 0}
                        ranked={several}
                        // With one machine there is nothing to tell apart, so
                        // one machine's card looks as it always has.
                        colour={several ? machineColourOf(entry).ink : undefined}
                        connected={linked}
                        failed={active && error !== null}
                        // Closed by default: Settings is visited for many things, and an open
                        // card pushed everything else down every time. A machine
                        // in use that has a problem still opens, so the fix is in view.
                        initiallyOpen={active && error !== null}
                        details={active && info !== null ? (
                            <>
                                <Vital label="Serial" value={info.serial}/>
                                <Vital label="Model" value={info.model}/>
                                <Vital label="Bluetooth ID" value={entry.id}/>
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
                                <Vital label="Bluetooth ID" value={entry.id}/>
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
                                // Asks first, in the screen's sheet: it used
                                // to forget on the tap, and a machine forgotten
                                // by accident has to be found by a scan again.
                                onPress={() => {
                                    if (changeBlocker === null) onForgetMachine?.(entry.id);
                                }}/>
                        )}>
                        {active && statusLine}
                        {active && openSettingsRow}
                        {/* Not drawn while connected: the header already says
                            Connected in green, and the row did nothing when
                            pressed. Not connected, it is how to connect. */}
                        {active ? !linked && connectRow(entry.model) : (
                            <SettingsActionRow
                                label="Use this machine now"
                                detail={changeBlocker ?? "Connects to it until the app is closed."}
                                onPress={() => switchTo(entry, name)}/>
                        )}
                        {!modelKnown && <SettingsChoiceRow
                            label="Model"
                            description={MODEL_DESCRIPTION}
                            stacked
                            value={entry.model}
                            options={MACHINE_MODEL_OPTIONS}
                            onChange={(value) => {
                                if (isMachineModel(value)) setModel(entry.id, value);
                            }}/>}
                        <SettingsActionRow
                            label={several ? "Name, colour and order" : "Name"}
                            detail={several
                                ? "Rename it, pick its colour, try it first or change its place in the list."
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
