import {machineColours, type MachineColour} from "@/constants/colors";

import {asMachineModel, isMachineModel, type MachineModel} from "./machineModel";

/**
 * The xBloom machines this phone knows, in the order it reaches for them.
 *
 * Pure: no settings store, no radio. `savedMachineSettings.ts` is the one place
 * that reads and writes the list, and `hooks/useMachine.ts` is the one place
 * that turns it into Bluetooth. Everything here is a rule about the list, and
 * so is testable without either.
 *
 * **The order is the priority, and the first entry is the default.** There is
 * no separate default flag, because a flag and an order are two facts that can
 * disagree: a list where the default sits third would have to answer which one
 * the app tries first, and every reader would answer it again. One array has
 * one answer. "Make default" moves an entry to the top.
 *
 * See `docs/superpowers/specs/2026-10-17-multiple-machines-design.md`.
 */
export type SavedMachine = {
    /**
     * The Bluetooth peripheral identifier, as `Transport.scan` reports it.
     *
     * The same value `machineDeviceId` has always held, and with the same
     * caveat: on iOS it is minted per phone, so it names this phone's view of
     * the machine rather than the machine. Hence the list stays out of backups
     * exactly as `machineDeviceId` does.
     */
    id: string;
    /** What the user calls it, such as "Home". Empty until they name it. */
    label: string;
    /**
     * Which xBloom this is.
     *
     * Per machine, because the two models grind on scales that do not convert
     * (`machineModel.ts`). A Home Studio and a Work Original are not the same
     * setting twice, and switching machines must switch the model with them.
     */
    model: MachineModel;
    /** What the machine said it was, verbatim. Evidence, as `machineModelString`. */
    modelString: string;
    /** The name it advertised. Evidence, as `machineName`. */
    advertisedName: string;
    /**
     * The serial the machine reported, or "" until it has connected once.
     *
     * Not part of the overlay: no older key holds it. It is how two machines
     * the user gave the same name are told apart, and the one identifier a
     * person can check against the machine itself.
     */
    serial: string;
    /**
     * Which of `machineColours` marks this machine, so that with several saved
     * a glance says which one this phone is connected to.
     *
     * Optional because a list written before colours existed has none.
     * `parseSavedMachines` fills a missing one in, so a machine read from the
     * store always has one, and it is written back with the list's next save.
     */
    colour?: number;
};

/** The longest name a machine can be given. A name is a word or two, not a note. */
export const MACHINE_LABEL_MAX = 24;

/**
 * The machine that is active right now, as the four older settings describe it.
 *
 * Those four keys stay the record of the active machine. Every reader in the
 * app that predates this list (`machineModel` in the importers, the editor's
 * BREW gate on `machineDeviceId`, the Easy Mode slot record) goes on reading
 * them unchanged. The list holds the rest.
 */
export type ActiveMachine = {
    deviceId: string;
    model: MachineModel;
    modelString: string;
    name: string;
};

function isSavedMachine(value: unknown): value is SavedMachine {
    if (typeof value !== "object" || value === null) return false;
    const entry = value as Record<string, unknown>;
    return typeof entry.id === "string" && entry.id !== ""
        && typeof entry.label === "string"
        && isMachineModel(entry.model)
        && typeof entry.modelString === "string"
        && typeof entry.advertisedName === "string"
        // Optional on the way in, so a list written before serials were kept
        // still reads.
        && (entry.serial === undefined || typeof entry.serial === "string");
}

function isColourIndex(value: unknown): value is number {
    return typeof value === "number" && Number.isInteger(value)
        && value >= 0 && value < machineColours.length;
}

/**
 * The colour a new machine should take: the first nobody else has, or past
 * that the least used, ties going to the earlier colour. The `nextAccentIndex`
 * rule, for the same reason: colours repeat as evenly as they can.
 */
export function nextMachineColour(machines: readonly {colour?: number}[]): number {
    const counts = machineColours.map(() => 0);
    for (const machine of machines) {
        if (isColourIndex(machine.colour)) counts[machine.colour]++;
    }
    let best = 0;
    for (let i = 1; i < counts.length; i++) {
        if (counts[i] < counts[best]) best = i;
    }
    return best;
}

/**
 * Give every machine that has no colour the next free one, in list order.
 *
 * So the machine somebody has had all along, the only one on an upgraded
 * phone, is green, which is the colour the link glyph has always been, and a
 * second one is blue. Colours already chosen are never moved.
 */
function withColours(machines: SavedMachine[]): SavedMachine[] {
    const done: SavedMachine[] = machines.filter((machine) => isColourIndex(machine.colour));
    return machines.map((machine) => {
        if (isColourIndex(machine.colour)) return machine;
        const coloured = {...machine, colour: nextMachineColour(done)};
        done.push(coloured);
        return coloured;
    });
}

/** The colour a machine is drawn in. Green for one with none, as always. */
export function machineColourOf(machine: {colour?: number}): MachineColour {
    return machineColours[isColourIndex(machine.colour) ? machine.colour : 0];
}

/**
 * Read the stored list, keeping what is well formed and dropping the rest.
 *
 * Forgiving rather than all-or-nothing, for the reason `Settings.get` is: a row
 * edited by hand or written by a later version must not cost the user every
 * machine because one entry has a field this version does not know. A
 * duplicate id keeps its first, higher-priority entry.
 */
export function parseSavedMachines(raw: string): SavedMachine[] {
    if (raw === "") return [];
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return [];
    }
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<string>();
    const machines: SavedMachine[] = [];
    for (const entry of parsed) {
        if (!isSavedMachine(entry) || seen.has(entry.id)) continue;
        seen.add(entry.id);
        machines.push({
            id: entry.id,
            label: entry.label.slice(0, MACHINE_LABEL_MAX),
            model: entry.model,
            modelString: entry.modelString,
            advertisedName: entry.advertisedName,
            serial: entry.serial ?? "",
            ...(isColourIndex(entry.colour) ? {colour: entry.colour} : {})
        });
    }
    return withColours(machines);
}

export function serialiseSavedMachines(machines: readonly SavedMachine[]): string {
    return machines.length === 0 ? "" : JSON.stringify(machines);
}

/**
 * The list as the app should see it: the stored list, with the active machine
 * described by the keys that own it.
 *
 * This is the whole migration. Somebody upgrading has a `machineDeviceId` and
 * no list, and gets a list of one: their machine, unnamed, as the default,
 * with the model they had already chosen. Nothing is written to do it, so
 * there is no migration step to fail halfway, and a phone that goes back to an
 * older build finds its four keys exactly where it left them.
 *
 * The overlay is the other half. The active machine's model and readings are
 * written by code that has never heard of this list (the settings row, a
 * restored backup, Studio detection), so the keys are believed over the
 * stored copy. Whenever the list is saved, it is saved from this view, which
 * is what keeps the stored copy from drifting.
 *
 * An active id the list does not name is added at the end rather than the
 * top. It can only happen if something wrote `machineDeviceId` directly, and
 * a machine that arrived that way has not been made anybody's default.
 */
export function resolveSavedMachines(raw: string, active: ActiveMachine): SavedMachine[] {
    const stored = parseSavedMachines(raw);
    if (active.deviceId === "") return stored;
    const overlay = (entry: SavedMachine): SavedMachine => ({
        ...entry,
        model: active.model,
        modelString: active.modelString,
        advertisedName: active.name
    });
    if (!stored.some((entry) => entry.id === active.deviceId)) {
        return withColours([...stored, overlay({
            id: active.deviceId, label: "", model: active.model, modelString: "", advertisedName: "",
            serial: ""
        })]);
    }
    return stored.map((entry) => entry.id === active.deviceId ? overlay(entry) : entry);
}

/**
 * What a machine is called on screen.
 *
 * The user's name first. Failing that, the name it advertised, which is at
 * least something printed on the machine's own Bluetooth listing. Failing
 * both, its place in the list, because two machines both called "xBloom" is
 * the one outcome the names exist to prevent.
 */
export function machineLabel(machine: SavedMachine, index: number): string {
    if (machine.label.trim() !== "") return machine.label.trim();
    if (machine.advertisedName.trim() !== "") return machine.advertisedName.trim();
    return `xBloom ${index + 1}`;
}

/**
 * Where a machine sits in the connect order, in words: `Tried 1st`.
 *
 * The order is what the list means. When the app connects by itself it scans
 * once and takes the highest machine in this order that answers. The first
 * entry used to read "Default", which sat next to "Selected" and "Connected"
 * and read as a third word for the machine in use. It is not that: the first
 * machine can be away while the third is the one connected. So it says what
 * it does.
 *
 * Null with fewer than two saved, because with one machine there is no order
 * and "Tried 1st" would be a word about nothing.
 */
export function machineOrderWord(index: number, count: number): string | null {
    if (count < 2) return null;
    const place = index + 1;
    const tens = place % 100;
    const suffix = tens >= 11 && tens <= 13 ? "th"
        : place % 10 === 1 ? "st"
        : place % 10 === 2 ? "nd"
        : place % 10 === 3 ? "rd"
        : "th";
    return `Tried ${place}${suffix}`;
}

/**
 * A short tag that tells two machines apart when their names do not.
 *
 * Names need not be unique: a cafe may well call two machines "Bar". The last
 * four characters of the serial are printed on the machine as well as
 * reported by it, so they can be checked by eye. Before a machine has
 * connected once there is no serial, and the end of its Bluetooth identifier
 * stands in. That one is only good for telling rows apart on this phone: on
 * iOS it is minted per phone and printed nowhere.
 */
export function machineTag(machine: {id: string; serial?: string}): string {
    const serial = (machine.serial ?? "").trim();
    if (serial !== "") return `#${serial.slice(-4).toUpperCase()}`;
    const bare = machine.id.replace(/[^0-9a-z]/gi, "");
    return `ID ${bare.slice(-4).toUpperCase()}`;
}

/**
 * Add a machine at the end of the order, or leave the list alone if it is
 * there. One that arrives without a colour takes the next free one.
 */
export function addSavedMachine(machines: readonly SavedMachine[], entry: SavedMachine): SavedMachine[] {
    if (machines.some((machine) => machine.id === entry.id)) return [...machines];
    return withColours([...machines, entry]);
}

/** Change one entry. An id that is not in the list changes nothing. */
export function updateSavedMachine(
    machines: readonly SavedMachine[],
    id: string,
    change: Partial<Omit<SavedMachine, "id">>
): SavedMachine[] {
    return machines.map((machine) => {
        if (machine.id !== id) return machine;
        const next = {...machine, ...change};
        // A colour that is not one of the palette's keeps the old one.
        const colour = isColourIndex(next.colour) ? next.colour : machine.colour;
        const updated: SavedMachine = {
            ...next,
            label: next.label.trim().slice(0, MACHINE_LABEL_MAX),
            model: asMachineModel(next.model)
        };
        if (colour === undefined) delete updated.colour;
        else updated.colour = colour;
        return updated;
    });
}

/**
 * Give an entry a new peripheral id, keeping its name, model and place.
 *
 * For the stale-id case the single-machine path has always handled: a scan
 * finds the machine under a new identifier. The user's machine has not
 * changed, so neither should what they called it.
 */
export function replaceSavedMachineId(
    machines: readonly SavedMachine[], from: string, to: string
): SavedMachine[] {
    if (machines.some((machine) => machine.id === to)) return [...machines];
    return machines.map((machine) => machine.id === from ? {...machine, id: to} : machine);
}

/** Move an entry to the top, which is what makes it the default. */
export function makeDefaultMachine(machines: readonly SavedMachine[], id: string): SavedMachine[] {
    const chosen = machines.find((machine) => machine.id === id);
    if (chosen === undefined) return [...machines];
    return [chosen, ...machines.filter((machine) => machine.id !== id)];
}

/**
 * Move an entry one place up (-1) or down (+1).
 *
 * One place at a time, by buttons, rather than by dragging: a drag list is a
 * new gesture for this app and an awkward one for a screen reader, and nobody
 * has more than a handful of machines to sort.
 */
export function moveSavedMachine(
    machines: readonly SavedMachine[], id: string, by: -1 | 1
): SavedMachine[] {
    const from = machines.findIndex((machine) => machine.id === id);
    const to = from + by;
    if (from < 0 || to < 0 || to >= machines.length) return [...machines];
    const next = [...machines];
    [next[from], next[to]] = [next[to], next[from]];
    return next;
}

export function removeSavedMachine(machines: readonly SavedMachine[], id: string): SavedMachine[] {
    return machines.filter((machine) => machine.id !== id);
}

/**
 * What a scan should do with the machines it has heard so far.
 *
 * - `stop`: the best machine there could be is in range. Nothing heard later
 *   can beat it, so waiting would only keep somebody watching a spinner.
 * - `settle`: a saved machine is in range, but not the best one. That one may
 *   simply not have advertised yet, so the scan waits a short while more.
 * - `continue`: nothing saved has been heard. An xBloom the user has not saved
 *   is not a candidate; in a cafe with four of them it is somebody else's.
 */
export type ScanVerdict = "stop" | "settle" | "continue";

/**
 * The machine a scan is hoping for: the preferred one if it is saved,
 * otherwise the default.
 *
 * **The machine on screen wins when it is in range; otherwise the priority
 * order.** The preferred machine is the one in use, which is the one the
 * editor's chip and the home panel name. Without this, somebody whose screen
 * says Work, standing where Home is also in range, would press BREW and have
 * it land on Home, because Home is higher in the order. The order still
 * decides everything else: at home Work is not heard, so Home wins.
 */
function hopedFor(priority: readonly string[], preferred: string): string | undefined {
    return preferred !== "" && priority.includes(preferred) ? preferred : priority[0];
}

export function scanVerdict(
    found: readonly {id: string}[], priority: readonly string[], preferred = ""
): ScanVerdict {
    if (priority.length === 0) return "continue";
    const heard = new Set(found.map((machine) => machine.id));
    const target = hopedFor(priority, preferred);
    if (target !== undefined && heard.has(target)) return "stop";
    return priority.some((id) => heard.has(id)) ? "settle" : "continue";
}

/**
 * The saved machine to connect to among those a scan heard, or null.
 *
 * The preferred machine (the one on screen) if it was heard; otherwise the
 * highest-priority saved machine heard. This is the cafe rule as well as the
 * home-and-work rule: several saved machines in range is not a question to
 * ask, and switching to another is one tap.
 */
export function bestSavedMachine(
    found: readonly {id: string}[], machines: readonly SavedMachine[], preferred = ""
): SavedMachine | null {
    const heard = new Set(found.map((machine) => machine.id));
    if (preferred !== "" && heard.has(preferred)) {
        const onScreen = machines.find((machine) => machine.id === preferred);
        if (onScreen !== undefined) return onScreen;
    }
    return machines.find((machine) => heard.has(machine.id)) ?? null;
}

/**
 * The saved machines split by whether a scan just heard them, each keeping
 * its place in the order (and its index, which is its priority).
 *
 * For the picker, so that in a cafe the machines in the room come first. The
 * connected machine counts as heard: a machine holding a link is not expected
 * to advertise, so a scan would otherwise list the one machine certainly in
 * range as absent. `heard` null means nobody has looked, and every machine is
 * listed in order with none marked either way.
 */
export function splitByRange(
    machines: readonly SavedMachine[],
    heard: readonly string[] | null,
    connectedId: string | null
): {inRange: {machine: SavedMachine; index: number}[]; away: {machine: SavedMachine; index: number}[]} {
    const indexed = machines.map((machine, index) => ({machine, index}));
    const near = new Set(heard ?? []);
    if (connectedId !== null) near.add(connectedId);
    return {
        inRange: indexed.filter(({machine}) => near.has(machine.id)),
        away: indexed.filter(({machine}) => !near.has(machine.id))
    };
}

/**
 * Every machine a scan heard that is not saved yet, nearest-sounding first.
 *
 * For adding one with several unsaved xBlooms in the room, where taking the
 * first one heard would be a guess. Signal strength only orders this list,
 * as a hint about which is closest; it is never used to choose between
 * saved machines, where the user's order is the rule.
 */
export function unsavedMachines<T extends {id: string; rssi?: number}>(
    found: readonly T[], machines: readonly SavedMachine[]
): T[] {
    const saved = new Set(machines.map((machine) => machine.id));
    return found
        .filter((machine) => !saved.has(machine.id))
        .map((machine, order) => ({machine, order}))
        .sort((a, b) =>
            (b.machine.rssi ?? -Infinity) - (a.machine.rssi ?? -Infinity) || a.order - b.order)
        .map(({machine}) => machine);
}
