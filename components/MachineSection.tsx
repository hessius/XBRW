import React, {useEffect, useState} from "react";
import {Pressable} from "react-native";
import router from "@/hooks/steadyRouter";
import {Text, XStack, YStack} from "tamagui";

import DotIcon from "@/components/DotIcon";
import MachineColourDot from "@/components/MachineColourDot";
import {MODEL_NAMES} from "@/components/MachinePickerSheet";
import SettingsActionRow from "@/components/SettingsActionRow";
import SettingsChoiceRow from "@/components/SettingsChoiceRow";
import SettingsSection from "@/components/SettingsSection";
import SettingsToggleRow from "@/components/SettingsToggleRow";
import {notify} from "@/components/XbrwToast";
import {palette} from "@/constants/colors";
import {useMachine} from "@/hooks/useMachine";
import {useSetting} from "@/hooks/useSetting";
import {RATING_PROMPT_WINDOW_MS} from "@/library/brew/ratingPrompt";
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

const BUDGET_OPTIONS = [
    {value: "10", label: "10 MB"},
    {value: "25", label: "25 MB"},
    {value: "50", label: "50 MB"},
    {value: "0", label: "Unlimited"}
] as const;

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

/**
 * One saved machine in the list, which opens its detail sheet.
 *
 * Name, model, place and link on one row, so the order can be read without
 * opening anything. The star marks the machine tried first; the words say it
 * too ("Tried 1st"), for a screen reader and for anybody who does not read a
 * star that way. Neither is drawn with one machine saved: there is no order.
 */
function SavedMachineRow({machine, index, count, active, connected, onPress}: {
    machine: SavedMachine;
    index: number;
    /** How many are saved. The order word and the star need two or more. */
    count: number;
    active: boolean;
    connected: boolean;
    onPress: () => void;
}) {
    const order = machineOrderWord(index, count);
    const parts = [MODEL_NAMES[machine.model], ...(order === null ? [] : [order]),
                   machineTag(machine)];
    // "Selected", not "In use": this phone has no way to tell that another
    // phone holds the machine (it simply stops answering), and "In use" was
    // read as exactly that.
    if (active) parts.push(connected ? "Connected" : "Selected");
    const detail = parts.join(" · ");
    const name = machineLabel(machine, index);
    return (
        <Pressable accessibilityRole="button" accessibilityLabel={`${name}, ${detail}`}
                   onPress={onPress}
                   style={({pressed}) => ({opacity: pressed ? 0.7 : 1})}>
            <XStack testID={`saved-machine-${machine.id}`} alignItems="center" gap="$3"
                    minHeight={44} paddingVertical="$3" paddingHorizontal="$4">
                {/* The star's column only exists to line the names up under a
                    star, so with one machine (no star, no order) it goes too and
                    the name starts at the row's edge like every other row. */}
                {count > 1 && (
                    <YStack testID={`saved-machine-star-${machine.id}`} width={14} alignItems="center">
                        {index === 0 && <DotIcon name="favourite" size={14} color={palette.dim}/>}
                    </YStack>
                )}
                <YStack flex={1} gap="$1">
                    <XStack alignItems="center" gap="$2">
                        {/* With one machine there is nothing to tell apart,
                            so one machine looks as it always has. */}
                        {count > 1 && (
                            <MachineColourDot testID={`saved-machine-colour-${machine.id}`}
                                              colour={machineColourOf(machine).ink}/>
                        )}
                        <Text fontSize={16} color={palette.text} numberOfLines={1}
                              flexShrink={1}>{name}</Text>
                    </XStack>
                    <Text fontSize={13} color={active && connected ? palette.success : palette.dim}>
                        {detail}
                    </Text>
                </YStack>
                <XStack style={{transform: [{rotate: "180deg"}]}}>
                    <DotIcon name="back" size={14} color={palette.muted}/>
                </XStack>
            </XStack>
        </Pressable>
    );
}

/**
 * Settings → Machine.
 *
 * Always rendered, paired or not. The editor only grows a BREW action once a
 * machine has been remembered, so without this section there would be nothing
 * anywhere in the app telling a new owner that pairing is possible — and a dead
 * BREW button on every recipe, for the users who will never own a J15, is the
 * worse trade.
 *
 * The console's hidden entry is seven taps: on the firmware row when a machine
 * is connected, on the status line when it is not. Both, because the console is
 * the only place a failed connection can be read about, and the firmware row is
 * not rendered when there is no connection to report the firmware of.
 */
export default function MachineSection({settings, onOpenMachine, onAddMachine}: {
    settings?: Settings;
    /**
     * Open one saved machine's detail sheet. The screen owns the sheet,
     * because a sheet inside this section's scroll view would have no height.
     */
    onOpenMachine?: (id: string) => void;
    /** Open the add-a-machine sheet, which the screen owns for the same reason. */
    onAddMachine?: () => void;
}) {
    // The injected store matters: the link writes `machineModel` through it
    // when it recognises a Studio, and a test that injected a store while the
    // hook wrote to the shared one would watch the correction land somewhere
    // this row cannot see.
    const {machine, status, error, remembered, connect, forget, canOpenSettings, openSettings,
           machines}
        = useMachine(undefined, {settings});
    // With one machine the section keeps its model row and its Forget row as
    // they always were. The list row above them is new, so that one machine
    // can be named before a second arrives.
    const several = machines.length >= 2;
    const [autoStart, setAutoStart] = useSetting("machineAutoStart", settings);
    const [animateBrewChart, setAnimateBrewChart] = useSetting("animateBrewChart", settings);
    const [askForRatings, setAskForRatings] = useSetting("askForRatings", settings);
    const [brewTraceBudgetMB, setBrewTraceBudgetMB] = useSetting("brewTraceBudgetMB", settings);
    const [machineModel, setMachineModel] = useSetting("machineModel", settings);
    const [taps, setTaps] = useState(0);
    const info = machine.info;
    const ratingPromptHours = Math.round(RATING_PROMPT_WINDOW_MS / (60 * 60 * 1000));
    const ratingPromptDescription =
        `On, the last brew XBRW++ watched can ask how it was along the bottom for up to ${ratingPromptHours} hours. `
        + "Off, ratings are only given on the brew itself.";

    /**
     * What the section says when there is no live link.
     *
     * A failed connect is "Not found" with every reason it could have,
     * because the radio cannot tell them apart: the machine takes one phone
     * at a time and, held by another, it stops answering exactly as it does
     * switched off or out of range (`ble-protocol.md`, "Single-Client
     * Limit"). The Bluetooth identifier used to follow here; it is in the
     * machine's details now, where it is not noise.
     */
    const idleStatus = status === "connecting" ? "Connecting…"
        : remembered === "" ? "No machine paired"
            : status === "idle" ? "Not connected"
                : "Not found. It may be off, out of range or connected to another phone.";
    // A machine whose serial names its model needs no model choice: the
    // serial set it (`recordSerial`), and a choice would only offer a way to
    // fetch imports for the wrong grind scale. Shown again whenever the
    // serial says nothing, or says something the entry does not yet agree with.
    const only = machines.length === 1 ? machines[0] : undefined;
    const modelKnown = only !== undefined && modelFromSerial(only.serial) === only.model;

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

    return (
        <SettingsSection title="Machine">
            {machines.map((entry, index) => (
                <SavedMachineRow key={entry.id} machine={entry} index={index}
                                 count={machines.length}
                                 active={entry.id === remembered}
                                 connected={status === "connected"}
                                 onPress={() => onOpenMachine?.(entry.id)}/>
            ))}

            {/* The model is per machine once there are several, and set in
                each machine's sheet. One row here would only ever describe
                whichever happened to be in use. */}
            {!several && !modelKnown && <SettingsChoiceRow
                label="Your xBloom"
                description="The two machines grind on different scales, so a recipe written for one is wrong on the other. Pick yours and the app asks xBloom for the right version. Recipes already saved keep the numbers they were written with."
                value={machineModel}
                options={MACHINE_MODEL_OPTIONS}
                onChange={(value) => {
                    // Only the options above can arrive here, so a value that is
                    // not a model is a bug in this file rather than a stale
                    // preference to coerce. Hence the guard and not a fallback.
                    if (isMachineModel(value)) setMachineModel(value);
                }}/>}

            {status !== "connected" && (
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
            )}

            {/*
              * Android only. A Bluetooth permission refused twice can no longer
              * be asked for, so Connect would do nothing at all and the message
              * above would be the end of the road. Offered as its own row
              * rather than inside the status block, which is the seven-tap
              * console entry and must stay a single target.
              */}
            {canOpenSettings && (
                <SettingsActionRow
                    label="Open app settings"
                    detail="Bluetooth permission can only be turned back on there."
                    onPress={openSettings}/>
            )}

            {/* Not drawn while connected: the machine's row above already says
                Connected, and this row has nothing to do then. */}
            {!(status === "connected" && machines.length > 0) && <SettingsActionRow
                label={status === "connected" ? "Connected" : "Connect to my machine"}
                detail={status === "connected"
                    ? "The link is held while XBRW++ is open."
                    // Naming the Studio to somebody who just said they own an
                    // original reads as if the app forgot. It is also the one
                    // place worth admitting that a scan will find their machine
                    // and the connection after it probably will not finish: the
                    // Bluetooth protocol here is the Studio's throughout, and
                    // nobody has had an original in front of them to check.
                    : machineModel === "original"
                        ? `${CONNECT_NEEDS_ORIGINAL} Only the Studio has been tested.`
                        : CONNECT_NEEDS_STUDIO}
                onPress={() => {
                    // The throw is for the brew path, which needs the reason.
                    // Here the reason is already on screen, in `error`.
                    if (status !== "connected") connect().catch(() => {});
                }}/>}

            {info !== null && (
                <YStack paddingVertical="$1">
                    <Vital label="Serial" value={info.serial}/>
                    <Vital label="Model" value={info.model}/>
                    {remembered !== "" && <Vital label="Bluetooth ID" value={remembered}/>}
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
                </YStack>
            )}

            <SettingsToggleRow
                label="Start brewing automatically"
                description="Off, BREW loads the recipe onto the machine and waits for you to press START. On, it starts grinding the moment the recipe lands."
                value={autoStart}
                onChange={setAutoStart}/>

            <SettingsToggleRow
                label="Animate the brew chart"
                description="When off, each phase change holds its end state immediately. The system Reduced Motion switch also disables animation independently."
                value={animateBrewChart}
                onChange={setAnimateBrewChart}/>

            <SettingsToggleRow
                label="Ask how a brew was"
                description={ratingPromptDescription}
                value={askForRatings} onChange={setAskForRatings}/>

            <SettingsChoiceRow
                label="Brew detail storage"
                description="Brew traces are the detailed charts. When they pass this limit, the oldest are dropped first. Rated and noted brews, and the newest brews of each recipe, go last. Summaries are always kept."
                value={String(brewTraceBudgetMB)}
                options={BUDGET_OPTIONS}
                onChange={(v) => setBrewTraceBudgetMB(Number(v))}/>

            {machines.length >= 1 && (
                <SettingsActionRow
                    label="Add another machine"
                    detail="Switch the new one on and keep it nearby. Machines already saved are skipped."
                    onPress={() => onAddMachine?.()}/>
            )}

            {remembered !== "" && !several && (
                <SettingsActionRow label="Forget this machine" tone="danger"
                                   detail="XBRW++ will scan again next time."
                                   onPress={() => void forget()}/>
            )}
        </SettingsSection>
    );
}
