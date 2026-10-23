import React, {useState} from "react";
import {Pressable} from "react-native";
import router from "@/hooks/steadyRouter";
import {Text, XStack, YStack} from "tamagui";

import MachineCard from "@/components/MachineCard";
import {MODEL_NAMES} from "@/components/MachinePickerSheet";
import SettingsActionRow from "@/components/SettingsActionRow";
import SettingsChoiceRow from "@/components/SettingsChoiceRow";
import SettingsSection, {SettingsSectionTitle} from "@/components/SettingsSection";
import {notify} from "@/components/XbrwToast";
import {useAppearance} from "@/hooks/useAppearance";
import {useMachine} from "@/hooks/useMachine";
import {useSetting} from "@/hooks/useSetting";
import type {Settings} from "@/library/Settings";
import {MACHINE_MODELS, asMachineModel, isMachineModel, type MachineModel} from "@/library/machine/machineModel";
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
    const {palette} = useAppearance();
    return (
        <XStack justifyContent="space-between" gap="$3" paddingVertical="$2" paddingHorizontal="$4">
            <Text color={palette.dim} fontSize={13} flexShrink={1}>{label}</Text>
            <Text color={palette.text} fontSize={13} flexShrink={1} textAlign="right" selectable>{value}</Text>
        </XStack>
    );
}

/** A card's own surface, for the rows that are not a machine. */
function Card({children}: {children: React.ReactNode}) {
    const {palette} = useAppearance();
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
    machine: SavedMachine, index: number, count: number, active: boolean, connected: boolean,
    connecting: boolean
): string {
    const order = machineOrderWord(index, count);
    const parts = [MODEL_NAMES[machine.model], ...(order === null ? [] : [order]),
                   machineTag(machine)];
    // "Selected", not "In use": this phone has no way to tell that another
    // phone holds the machine (it simply stops answering), and "In use" was
    // read as exactly that.
    if (connected) parts.push("Connected");
    else if (active) parts.push(connecting ? "Connecting…" : "Selected");
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
 * Cards start closed unless the selected machine already has an error.
 * With none saved, model choice and Connect stay in a plain card.
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
    const appearance = useAppearance();
    const {palette} = appearance;
    // The injected store matters: the link writes `machineModel` through it
    // when it recognises a Studio, and a test that injected a store while the
    // hook wrote to the shared one would watch the correction land somewhere
    // this row cannot see.
    const {machine, status, error, remembered, connect, canOpenSettings, openSettings,
           machines, changeBlocker, choose}
        = useMachine(undefined, {settings});
    const several = machines.length >= 2;
    const [machineModel, setMachineModel] = useSetting("machineModel", settings);
    const [taps, setTaps] = useState(0);
    const info = machine.info;
    const actionBlocker = changeBlocker
        ?? (status === "connecting" ? "A connection is already being made." : null);

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

    const connectionDetail = (model: MachineModel) => model === "original"
        ? `${CONNECT_NEEDS_ORIGINAL} Only the Studio has been tested.`
        : CONNECT_NEEDS_STUDIO;

    const connectRow = (model: MachineModel) => (
        <SettingsActionRow
            label={status === "connected" ? "Connected" : "Connect to my machine"}
            disabled={actionBlocker !== null || status === "connected"}
            detail={actionBlocker ?? (status === "connected"
                ? "The link is held while XBRW++ is open."
                : connectionDetail(model))}
            onPress={() => {
                // The throw is for the brew path, which needs the reason.
                // Here the reason is already on screen, in `error`.
                if (status !== "connected") connect().catch(() => {});
            }}/>
    );

    /** Switch to a machine that is saved but not in use, the way its sheet does. */
    function switchTo(entry: SavedMachine, name: string) {
        if (actionBlocker !== null) return;
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
                {connectRow(asMachineModel(machineModel))}
            </SettingsSection>
        );
    }

    return (
        <YStack gap="$2" paddingTop="$4">
            <SettingsSectionTitle title="Machines"/>
            {machines.map((entry, index) => {
                const active = entry.id === remembered;
                const linked = entry.id === machine.linkedDeviceId;
                const name = machineLabel(entry, index);
                const liveInfo = linked ? info : null;
                const reportedModel = liveInfo === null ? ""
                    : liveInfo.model !== "" ? liveInfo.model : machine.modelNumber;
                return (
                    <MachineCard
                        key={entry.id}
                        testID={`saved-machine-${entry.id}`}
                        title={name}
                        summary={machineSummary(entry, index, machines.length, active,
                                                linked, status === "connecting")}
                        isDefault={several && index === 0}
                        ranked={several}
                        // With one machine there is nothing to tell apart, so
                        // one machine's card looks as it always has.
                        colour={several ? appearance.machineColour(machineColourOf(entry)).ink : undefined}
                        connected={linked}
                        failed={active && error !== null}
                        initiallyOpen={active && error !== null}
                        details={liveInfo !== null ? (
                            <>
                                <Vital label="Serial" value={liveInfo.serial}/>
                                {reportedModel !== "" && <Vital label="Model" value={reportedModel}/>}
                                <Vital label="Bluetooth ID" value={entry.id}/>
                                <Pressable accessibilityRole="button"
                                           accessibilityLabel={`Firmware, ${liveInfo.firmware}`}
                                           onPress={onSecretPress}>
                                    <Vital label="Firmware" value={liveInfo.firmware}/>
                                </Pressable>
                                <Vital label="Water" value={liveInfo.waterFeed === "tap"
                                    ? "Plumbed"
                                    : liveInfo.waterEnough ? "OK" : "Low"}/>
                                <Vital label="Grind size" value={String(liveInfo.grindSize)}/>
                                <Vital label="Mode" value={liveInfo.mode}/>
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
                        )}>
                        {active && statusLine}
                        {active && openSettingsRow}
                        {/* Not drawn while connected: the header already says
                            Connected in green, and the row did nothing when
                            pressed. Not connected, it is how to connect. */}
                        {!linked && (
                            <SettingsActionRow
                                label={active ? "Connect to my machine" : "Use this machine now"}
                                disabled={actionBlocker !== null}
                                detail={actionBlocker ?? (active
                                    ? connectionDetail(entry.model)
                                    : "Connects to it until the app is closed.")}
                                onPress={() => switchTo(entry, name)}/>
                        )}
                        <SettingsActionRow
                            label="Manage machine"
                            detail="Name, model, colour and connection order."
                            onPress={() => onOpenMachine?.(entry.id)}/>
                    </MachineCard>
                );
            })}

            <Card>
                <SettingsActionRow
                    label="Add another machine"
                    disabled={actionBlocker !== null}
                    detail={actionBlocker ?? "Switch the new one on and keep it nearby. Machines already saved are skipped."}
                    onPress={() => onAddMachine?.()}/>
            </Card>
        </YStack>
    );
}
