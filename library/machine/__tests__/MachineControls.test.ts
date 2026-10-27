import Machine from "@/library/machine/Machine";
import MachineControls from "@/library/machine/MachineControls";
import {ControlRecoveryStore} from "@/library/machine/controlRecovery";
import type {ControlCapabilityProfile} from "@/library/machine/controlCapabilities";
import type {ControlCommand, ControlFeedback, ControlProtocol, ControlTokens} from "@/library/machine/controlProtocol";
import type {SettingReadings} from "@/library/machine/controlModel";
import {buildType1, MACHINE_STATE} from "@/library/machine/protocol";
import {FakeTransport, machineInfoFrame} from "./FakeTransport";
import {notification, status, type1} from "./protocolFixtures";

// Entirely synthetic qualification: these codes, payloads, limits and timings
// are NOT captures and must never enter the production qualification registry.
const identity = {deviceId: "test-device", serial: "test-serial"};
const profile: ControlCapabilityProfile = {
    id: "synthetic", models: ["test"], firmwares: ["test"], serials: ["test-serial"],
    grind: {grindSize: {min: 1, max: 10, step: 1}, rpm: {min: 100, max: 200, step: 10}},
    pour: {
        temperatureC: {min: 40, max: 90, step: 1}, flowMlPerSecond: {min: 1, max: 4, step: 1},
        volumeMl: {min: 10, max: 100, step: 10}, modes: ["target", "continuous"],
        patterns: ["centered", "circular", "spiral"]
    },
    settings: {brightness: {min: 1, max: 5, step: 1}, waterSource: ["tank", "tap"]}
};
const codes = {
    enter: 60001, exit: 60002, grind: 60003, pour: 60004, stop: 60005,
    tare: 60006, temperature: 60007, pattern: 60008, setting: 60009, inspect: 60010
};
const feedbacks = new Map<number, ControlFeedback>();
let nextFeedback = 0;
function feedback(radio: FakeTransport, tokens: ControlTokens, value: ControlFeedback["value"]) {
    const key = ++nextFeedback;
    feedbacks.set(key, {...tokens, value});
    radio.emit(notification(0xFE, 0xFE, [key & 255, key >> 8]));
}
type Sent = {command: ControlCommand; tokens: ControlTokens};
class Radio extends FakeTransport {
    get connectedDeviceId() { return this.connectedTo; }
}
async function setup(options: {
    raw?: string; failStorage?: () => boolean; refreshSettings?: boolean;
    profile?: ControlCapabilityProfile;
    decodeInfo?: () => ControlFeedback | null;
    infoWaitMs?: number;
    refreshOnlyScale?: boolean;
} = {}) {
    const radio = new Radio();
    radio.infoReply = machineInfoFrame({serial: identity.serial, model: "test", firmware: "test"});
    let raw = options.raw ?? "";
    const recovery = new ControlRecoveryStore({
        read: () => raw,
        write: (value) => { if (options.failStorage?.()) throw new Error("storage"); raw = value; }
    });
    const machine = new Machine(radio, {frameGapMs: 0, infoWaitMs: options.infoWaitMs});
    machine.installControlRecovery(recovery);
    await machine.connect(identity.deviceId);
    radio.emit(status(MACHINE_STATE.IDLE));
    radio.written = [];
    const sent: Sent[] = [];
    let respond: ((item: Sent) => void) | null = null;
    let source: "tank" | "tap" | null = "tank";
    const protocol: ControlProtocol = {
        telemetryFreshMs: 100,
        actualWaterSource: () => source,
        plan: (command, tokens) => {
            const item = {command, tokens};
            const frame = buildType1(codes[command.kind], [tokens.session, tokens.transaction]);
            sent.push(item);
            if (command.kind === "enter" && command.tool === "scale" && options.refreshOnlyScale) {
                return {frame: null, refreshInfo: true, deadlineMs: 50};
            }
            if (command.kind === "inspect" && command.recovery) return {frame: null, refreshInfo: true, deadlineMs: 50};
            if (command.kind === "setting" && options.refreshSettings) return {frame, refreshInfo: true, deadlineMs: 50};
            return {frame, deadlineMs: 50};
        },
        decode: (frame) => frame[3] === 0xFE && frame[4] === 0xFE
            ? feedbacks.get(frame[10] | frame[11] << 8) ?? null
            : frame[3] === 0x49 && frame[4] === 0x9E ? options.decodeInfo?.() ?? null : null
    };
    radio.syntheticWrite = (frame) => {
        const code = frame[3] | frame[4] << 8;
        const item = code === 8100 ? sent.findLast((s) =>
            (s.command.kind === "inspect" && s.command.recovery) || s.command.kind === "setting"
            || (s.command.kind === "enter" && s.command.tool === "scale" && options.refreshOnlyScale))
            : sent.findLast((s) => codes[s.command.kind] === code
                && new DataView(frame.buffer, frame.byteOffset).getUint32(10, true) === s.tokens.session
                && new DataView(frame.buffer, frame.byteOffset).getUint32(14, true) === s.tokens.transaction);
        if (item && code !== 8100) {
            expect(Array.from(frame)).toEqual(type1(codes[item.command.kind], [item.tokens.session, item.tokens.transaction]));
        }
        if (item) respond?.(item);
    };
    const controls = new MachineControls(machine, {qualifications: [{profile: options.profile ?? profile, protocol}]});
    return {
        machine, radio, recovery, controls, sent,
        respond: (fn: typeof respond) => { respond = fn; },
        source: (value: typeof source) => { source = value; }
    };
}
function accept(radio: FakeTransport, item: Sent) {
    const kind = item.command.kind;
    if (kind === "enter") feedback(radio, item.tokens, {kind: "ready"});
    if (kind === "exit") feedback(radio, item.tokens, {kind: "closed"});
    if (kind === "grind" || kind === "pour") feedback(radio, item.tokens, {kind: "running"});
    if (kind === "stop" || kind === "inspect") feedback(radio, item.tokens, {kind: "terminal"});
}
const grind = {grindSize: 5, rpm: 150};
const pour = {mode: "continuous", temperatureC: 80, flowMlPerSecond: 2, pattern: "spiral"} as const;
const readings: SettingReadings = {
    brightness: 1, waterSource: "tank", temperatureUnit: null, weightUnit: null,
    pourRadius: null, vibrationAmplitude: null
};
async function tick() { for (let i = 0; i < 30; i++) await Promise.resolve(); }

it("keeps production unsupported and enters only after correlated non-starting evidence", async () => {
    const s = await setup();
    const unsupported = new MachineControls(s.machine);
    await expect(unsupported.open(identity, "grind")).rejects.toThrow("unqualified");
    const initial = s.controls.getSnapshot();
    expect(s.controls.getSnapshot()).toBe(initial);
    const listener = jest.fn();
    const off = s.controls.subscribe(listener);
    s.respond((item) => accept(s.radio, item));
    await s.controls.open(identity, "grind");
    expect(s.controls.getSnapshot().phase).toBe("ready");
    expect(s.sent.map((s) => s.command.kind)).toEqual(["enter"]);
    await s.controls.open(identity, "grind");
    expect(s.sent).toHaveLength(1);
    await expect(s.controls.open({...identity, deviceId: "other"}, "pour")).rejects.toThrow();
    expect(Object.isFrozen(s.controls.getSnapshot().identity)).toBe(true);
    off();
    const calls = listener.mock.calls.length;
    await s.controls.close();
    expect(listener).toHaveBeenCalledTimes(calls);
    expect(s.controls.getSnapshot().phase).toBe("closed");
    expect(s.machine.controlBlocker).toBeNull();
});

it("reserves before a synchronous Start response and clears only a qualified terminal", async () => {
    const s = await setup();
    s.respond((item) => {
        if (item.command.kind === "grind") expect(s.recovery.snapshot.marker?.tool).toBe("grind");
        accept(s.radio, item);
    });
    await s.controls.open(identity, "grind");
    const request = {...grind};
    await s.controls.startGrind(request);
    request.rpm = 200;
    expect(s.controls.getSnapshot()).toMatchObject({phase: "running", grindRequest: grind});
    await expect(s.controls.close()).rejects.toThrow();
    feedback(s.radio, s.sent[1].tokens, {kind: "terminal"});
    expect(s.controls.getSnapshot().phase).toBe("ready");
    expect(s.recovery.snapshot.marker).toBeNull();
    await s.controls.close();
});

it("keeps Stop's promise identity and waits for terminal, not native acceptance", async () => {
    const s = await setup();
    s.respond((item) => { if (item.command.kind !== "stop") accept(s.radio, item); });
    await s.controls.open(identity, "pour");
    await s.controls.startPour(pour);
    s.radio.emit(machineInfoFrame({serial: identity.serial, model: "test", firmware: "test", waterEnough: 0}));
    const stopping = s.controls.stop();
    expect(s.controls.stop()).toBe(stopping);
    await tick();
    expect(s.controls.getSnapshot().phase).toBe("stopping");
    expect(s.recovery.snapshot.marker).not.toBeNull();
    const stop = s.sent[s.sent.length - 1];
    feedback(s.radio, {...stop.tokens, transaction: stop.tokens.transaction - 1}, {kind: "tared"});
    expect(s.controls.getSnapshot().phase).toBe("stopping");
    feedback(s.radio, stop.tokens, {kind: "terminal"});
    await stopping;
    expect(s.controls.getSnapshot().phase).toBe("ready");
    expect(s.recovery.snapshot.marker).toBeNull();
    await s.controls.close();
});

it.each(["native", "missing", "contradictory"] as const)("retains reservation after %s Start uncertainty", async (mode) => {
    const s = await setup();
    s.respond((item) => {
        if (item.command.kind !== "grind") accept(s.radio, item);
        else if (mode === "contradictory") feedback(s.radio, item.tokens, {kind: "ready"});
    });
    await s.controls.open(identity, "grind");
    if (mode === "native") s.radio.failWriteOf = {code: codes.grind, reason: "native failed"};
    await expect(s.controls.startGrind(grind)).rejects.toThrow();
    expect(s.controls.getSnapshot().phase).toBe("unknown");
    expect(s.recovery.snapshot.marker?.tool).toBe("grind");
    expect(s.machine.controlBlocker).not.toBeNull();
    await expect(s.controls.close()).rejects.toThrow();
    s.radio.failWriteOf = null;
    await s.controls.stop();
    await s.controls.close();
});

it("refuses invalid requests and failed marker storage before Start dispatch", async () => {
    let fail = false;
    const s = await setup({failStorage: () => fail});
    s.respond((item) => accept(s.radio, item));
    await s.controls.open(identity, "grind");
    await expect(s.controls.startGrind({...grind, rpm: Infinity})).rejects.toThrow();
    expect(s.recovery.snapshot.marker).toBeNull();
    fail = true;
    await expect(s.controls.startGrind(grind)).rejects.toThrow("persist");
    expect(s.radio.sent).toEqual([codes.enter]);
    expect(s.controls.getSnapshot().phase).toBe("unknown");
    fail = false;
    await s.controls.stop();
    await s.controls.close();
});

it("rechecks actual water source at the native dispatch boundary after pacing", async () => {
    const s = await setup();
    s.respond((item) => accept(s.radio, item));
    await s.controls.open(identity, "pour");
    s.source(null);
    await expect(s.controls.startPour(pour)).rejects.toThrow("water");
    expect(s.radio.sent).not.toContain(codes.pour);
    expect(s.controls.getSnapshot().phase).toBe("ready");
    expect(s.recovery.snapshot.marker).toBeNull();
    s.source("tap");
    await s.controls.startPour(pour);
    await s.controls.stop();
    await s.controls.close();
});

it("retains a failed terminal clear and lets Stop retry without requiring water", async () => {
    let fail = false;
    const s = await setup({failStorage: () => fail});
    s.respond((item) => accept(s.radio, item));
    await s.controls.open(identity, "pour");
    await s.controls.startPour(pour);
    fail = true;
    await expect(s.controls.stop()).rejects.toThrow("persist");
    expect(s.controls.getSnapshot().phase).toBe("unknown");
    expect(s.recovery.snapshot.marker).not.toBeNull();
    fail = false;
    s.source(null);
    await s.controls.stop();
    await s.controls.close();
});

it("does not turn a Start racing Stop back into running", async () => {
    const s = await setup();
    s.respond((item) => { if (item.command.kind !== "grind") accept(s.radio, item); });
    await s.controls.open(identity, "grind");
    const starting = s.controls.startGrind(grind);
    const rejected = expect(starting).rejects.toThrow();
    await tick();
    const stopping = s.controls.stop();
    feedback(s.radio, s.sent[1].tokens, {kind: "running"});
    await stopping;
    await rejected;
    expect(s.controls.getSnapshot().phase).toBe("ready");
    expect(s.sent.map((s) => s.command.kind)).toEqual(["enter", "grind", "stop"]);
    await s.controls.close();
});

it("keeps scale samples in grams, expires stale readings, and taring is not an optimistic zero", async () => {
    const s = await setup();
    s.respond((item) => accept(s.radio, item));
    await s.controls.open(identity, "scale");
    const entry = s.sent[0];
    expect(s.controls.getSnapshot().cupGrams).toBeNull();
    feedback(s.radio, entry.tokens, {kind: "cup", grams: 42.5});
    expect(s.controls.getSnapshot().cupGrams).toBe(42.5);
    expect(s.controls.getSnapshot().dispensedMl).toBeNull();
    const tare = s.controls.tare();
    const accepted = expect(tare).resolves.toBeUndefined();
    await tick();
    expect(s.controls.getSnapshot()).toMatchObject({phase: "applying", cupGrams: 42.5});
    feedback(s.radio, entry.tokens, {kind: "cup", grams: 0});
    expect(s.controls.getSnapshot().phase).toBe("applying");
    feedback(s.radio, s.sent[1].tokens, {kind: "tared"});
    await accepted;
    expect(s.controls.getSnapshot().phase).toBe("ready");
    jest.useFakeTimers();
    feedback(s.radio, entry.tokens, {kind: "cup", grams: 3});
    jest.advanceTimersByTime(101);
    expect(s.controls.getSnapshot().cupGrams).toBeNull();
    jest.useRealTimers();
    await s.controls.close();
    feedback(s.radio, entry.tokens, {kind: "cup", grams: 999});
    expect(s.controls.getSnapshot().cupGrams).toBeNull();
});

it("does not mix cup grams, old run totals, or a continuous UI timer with terminal proof", async () => {
    const s = await setup();
    s.respond((item) => accept(s.radio, item));
    await s.controls.open(identity, "pour");
    await s.controls.startPour(pour);
    const first = s.sent[1].tokens;
    feedback(s.radio, first, {kind: "cup", grams: 12});
    feedback(s.radio, first, {kind: "dispensed", ml: 37});
    expect(s.controls.getSnapshot()).toMatchObject({cupGrams: 12, dispensedMl: 37});
    await s.controls.stop();
    await s.controls.startPour({...pour, mode: "target", volumeMl: 20});
    expect(s.controls.getSnapshot().dispensedMl).toBeNull();
    feedback(s.radio, first, {kind: "dispensed", ml: 99});
    expect(s.controls.getSnapshot().dispensedMl).toBeNull();
    // Synthetic physical completion only, not a duration or integrated flow.
    feedback(s.radio, s.sent[3].tokens, {kind: "terminal"});
    expect(s.controls.getSnapshot().phase).toBe("ready");
    await s.controls.close();
});

it("serializes live proposals, ignores out-of-order replies and gives Stop priority over queued updates", async () => {
    const s = await setup();
    s.respond((item) => accept(s.radio, item));
    await s.controls.open(identity, "pour");
    await s.controls.startPour(pour);
    const temp = s.controls.setTemperature(85);
    await tick();
    expect(s.controls.getSnapshot()).toMatchObject({temperatureC: 80, pendingTemperatureC: 85});
    const pattern = s.controls.setPattern("centered");
    const rejected = expect(pattern).rejects.toThrow("cancel");
    feedback(s.radio, s.sent[1].tokens, {kind: "temperature", celsius: 85});
    expect(s.controls.getSnapshot().temperatureC).toBe(80);
    feedback(s.radio, s.sent[2].tokens, {kind: "temperature", celsius: 85});
    await temp;
    await tick();
    const second = s.controls.setTemperature(86);
    const secondRejected = expect(second).rejects.toThrow("cancel");
    await s.controls.stop();
    await rejected;
    await secondRejected;
    expect(s.radio.sent.filter((code) => code === codes.temperature)).toHaveLength(1);
    expect(s.controls.getSnapshot()).toMatchObject({phase: "ready", temperatureC: 85, pendingPattern: null, pendingTemperatureC: null});
    await s.controls.close();
});

it("rejects fractional and unsupported live proposals before sending; refusals cannot confirm them", async () => {
    const s = await setup();
    s.respond((item) => accept(s.radio, item));
    await s.controls.open(identity, "pour");
    await s.controls.startPour(pour);
    await expect(s.controls.setTemperature(80.5)).rejects.toThrow();
    expect(s.sent).toHaveLength(2);
    s.respond((item) => feedback(s.radio, item.tokens, {kind: "refused", reason: "synthetic refusal"}));
    await expect(s.controls.setPattern("circular")).rejects.toThrow("refusal");
    expect(s.controls.getSnapshot()).toMatchObject({phase: "unknown", pattern: "spiral"});
    s.respond((item) => accept(s.radio, item));
    await s.controls.stop();
    await s.controls.close();
});

it("applies a closed-only setting after decoded current values and a fresh matching readback under the same lease", async () => {
    const s = await setup();
    s.respond((item) => {
        if (item.command.kind === "inspect") feedback(s.radio, item.tokens, {kind: "settings", readings});
        if (item.command.kind === "setting") {
            expect(s.machine.controlBlocker).not.toBeNull();
            feedback(s.radio, item.tokens, {kind: "settings", readings: {...readings, brightness: 3}});
        }
    });
    await s.controls.applySetting(identity, "brightness", 3);
    expect(s.controls.getSnapshot()).toMatchObject({phase: "closed", applyingSetting: null, settings: {brightness: 3}});
    expect(s.machine.controlBlocker).toBeNull();
    expect(s.sent.map((s) => s.command.kind)).toEqual(["inspect", "setting"]);
});

it("does not claim a setting applied on wrong readback and retains its owner for inspection recovery", async () => {
    const s = await setup();
    s.respond((item) => {
        if (item.command.kind === "inspect" || item.command.kind === "setting") {
            feedback(s.radio, item.tokens, {kind: "settings", readings});
        }
    });
    const applying = s.controls.applySetting(identity, "brightness", 3);
    await expect(s.controls.applySetting(identity, "brightness", 4)).rejects.toThrow();
    await expect(applying).rejects.toThrow("readback");
    expect(s.controls.getSnapshot()).toMatchObject({phase: "unknown", applyingSetting: "brightness"});
    expect(s.recovery.snapshot.marker).toBeNull();
    expect(s.machine.controlBlocker).not.toBeNull();
    await expect(s.controls.close()).rejects.toThrow();
    await s.controls.recover();
    expect(s.controls.getSnapshot()).toMatchObject({phase: "closed", settings: {brightness: 1}});
    expect(s.machine.controlBlocker).toBeNull();
});

it("recovers only the exact persisted identity, never starts, and keeps an active recovery Stop-only", async () => {
    const marker = {version: 1, ...identity, tool: "pour"};
    const s = await setup({raw: JSON.stringify(marker)});
    s.respond((item) => {
        if (item.command.kind === "inspect") feedback(s.radio, item.tokens, {kind: "active"});
        else accept(s.radio, item);
    });
    await s.controls.recover();
    expect(s.controls.getSnapshot()).toMatchObject({phase: "unknown", tool: "pour", identity});
    await expect(s.controls.startPour(pour)).rejects.toThrow();
    expect(s.sent.map((s) => s.command.kind)).toEqual(["inspect"]);
    await s.controls.stop();
    expect(s.controls.getSnapshot().phase).toBe("closed");
    expect(s.recovery.snapshot.marker).toBeNull();
    expect(s.machine.controlBlocker).toBeNull();
});

it("ignores old sessions after reconnect and uses narrow inspection rather than entry for recovery", async () => {
    const s = await setup();
    s.respond((item) => accept(s.radio, item));
    await s.controls.open(identity, "grind");
    await s.controls.startGrind(grind);
    const old = s.sent[1].tokens;
    s.radio.drop();
    expect(s.controls.getSnapshot().phase).toBe("unknown");
    await s.machine.connect(identity.deviceId);
    s.radio.emit(status(MACHINE_STATE.IDLE));
    feedback(s.radio, old, {kind: "terminal"});
    expect(s.recovery.snapshot.marker).not.toBeNull();
    await s.controls.recover();
    expect(s.sent.map((s) => s.command.kind)).toEqual(["enter", "grind", "inspect"]);
    expect(s.controls.getSnapshot().phase).toBe("closed");
    expect(s.recovery.snapshot.marker).toBeNull();
});

it("makes remount during entry or an active run idempotent without retargeting or restarting", async () => {
    const s = await setup();
    const opening = s.controls.open(identity, "grind");
    const remount = s.controls.open(identity, "grind");
    await tick();
    feedback(s.radio, s.sent[0].tokens, {kind: "ready"});
    await opening;
    await remount;
    s.respond((item) => accept(s.radio, item));
    await s.controls.startGrind(grind);
    await s.controls.open(identity, "grind");
    expect(s.sent.map((s) => s.command.kind)).toEqual(["enter", "grind"]);
    await s.controls.stop();
    await s.controls.close();
});

it("cancels a not-yet-dispatched Start when Stop is tapped immediately", async () => {
    const s = await setup();
    s.respond((item) => accept(s.radio, item));
    await s.controls.open(identity, "grind");
    const start = s.controls.startGrind(grind);
    const rejected = expect(start).rejects.toThrow("cancel");
    await s.controls.stop();
    await rejected;
    expect(s.radio.sent).toEqual([codes.enter]);
    expect(s.recovery.snapshot.marker).toBeNull();
    expect(s.controls.getSnapshot().phase).toBe("ready");
    await s.controls.close();
});

it("cancels live work on synthetic natural completion without turning terminal proof back into unknown", async () => {
    const s = await setup();
    s.respond((item) => accept(s.radio, item));
    await s.controls.open(identity, "pour");
    await s.controls.startPour({...pour, mode: "target", volumeMl: 20});
    const update = s.controls.setTemperature(85);
    const rejected = expect(update).rejects.toThrow("cancel");
    await tick();
    feedback(s.radio, s.sent[1].tokens, {kind: "terminal"});
    await rejected;
    expect(s.controls.getSnapshot()).toMatchObject({phase: "ready", pendingTemperatureC: null});
    expect(s.recovery.snapshot.marker).toBeNull();
    await s.controls.close();
});

it("does not mistake a new session after recovery for the old Stop-only recovery", async () => {
    const s = await setup({raw: JSON.stringify({version: 1, ...identity, tool: "grind"})});
    s.respond((item) => accept(s.radio, item));
    await s.controls.recover();
    await s.controls.open(identity, "grind");
    await s.controls.startGrind(grind);
    await s.controls.stop();
    expect(s.controls.getSnapshot().phase).toBe("ready");
    await s.controls.close();
});

it("captures injected capability bounds instead of permitting caller mutation to widen them", async () => {
    const mutable = {...profile, grind: {...profile.grind!, rpm: {...profile.grind!.rpm}}};
    const s = await setup({profile: mutable});
    s.respond((item) => accept(s.radio, item));
    await s.controls.open(identity, "grind");
    mutable.grind.rpm.max = 1000;
    await expect(s.controls.startGrind({...grind, rpm: 1000})).rejects.toThrow();
    expect(s.radio.sent).toEqual([codes.enter]);
    await s.controls.close();
});

it("refuses unsupported tools before entry and nonmoving uncertainty requires inspection, not a motor marker", async () => {
    const s = await setup({profile: {...profile, grind: null}});
    await expect(s.controls.open(identity, "grind")).rejects.toThrow("unsupported");
    expect(s.radio.sent).toEqual([]);
    await expect(s.controls.open(identity, "scale")).rejects.toThrow("missing");
    expect(s.controls.getSnapshot().phase).toBe("unknown");
    expect(s.recovery.snapshot.marker).toBeNull();
    expect(s.machine.controlBlocker).not.toBeNull();
    s.respond((item) => accept(s.radio, item));
    await s.controls.recover();
    expect(s.controls.getSnapshot().phase).toBe("closed");
    expect(s.sent.map((s) => s.command.kind)).toEqual(["enter", "inspect"]);
});

it("refreshes settings readback through the held lease and ignores a prior inspection's value", async () => {
    const s = await setup({refreshSettings: true});
    s.respond((item) => {
        if (item.command.kind === "inspect") feedback(s.radio, item.tokens, {kind: "settings", readings});
        if (item.command.kind === "setting") {
            feedback(s.radio, s.sent[0].tokens, {kind: "settings", readings: {...readings, brightness: 3}});
            if (s.radio.sent.at(-1) === 8100) {
                feedback(s.radio, item.tokens, {kind: "settings", readings: {...readings, brightness: 3}});
            }
        }
    });
    await s.controls.applySetting(identity, "brightness", 3);
    expect(s.radio.sent).toEqual([codes.inspect, codes.setting, 8100]);
    expect(s.machine.controlBlocker).toBeNull();
});

it("does not send a timed-out queued transaction after a pending native write finally settles", async () => {
    const s = await setup();
    s.respond((item) => accept(s.radio, item));
    await s.controls.open(identity, "pour");
    await s.controls.startPour(pour);
    let settle: () => void = () => {};
    s.radio.syntheticWrite = (frame) => {
        if ((frame[3] | frame[4] << 8) === codes.temperature) return new Promise<void>((resolve) => { settle = resolve; });
    };
    const live = s.controls.setTemperature(85);
    const liveRejected = expect(live).rejects.toThrow();
    await tick();
    const stop = s.controls.stop();
    const stopRejected = expect(stop).rejects.toThrow("missing");
    await stopRejected;
    expect(s.machine.controlBlocker).not.toBeNull();
    settle();
    await liveRejected;
    await tick();
    expect(s.radio.sent).not.toContain(codes.stop);
    s.radio.syntheticWrite = (frame) => {
        const item = s.sent.findLast((s) => codes[s.command.kind] === (frame[3] | frame[4] << 8));
        if (item) accept(s.radio, item);
    };
    await s.controls.stop();
    await s.controls.close();
});

it("detects an actual serial change before interpreting that very info frame as terminal proof", async () => {
    let response: ControlFeedback | null = null;
    const s = await setup({decodeInfo: () => response});
    s.respond((item) => accept(s.radio, item));
    await s.controls.open(identity, "grind");
    await s.controls.startGrind(grind);
    response = {...s.sent[1].tokens, value: {kind: "terminal"}};
    s.radio.emit(machineInfoFrame({serial: "wrong-serial", model: "test", firmware: "test"}));
    expect(s.controls.getSnapshot().phase).toBe("unknown");
    expect(s.recovery.snapshot.marker).not.toBeNull();
    await expect(s.controls.recover()).rejects.toThrow();
    expect(s.machine.controlBlocker).not.toBeNull();
    response = null;
    s.radio.emit(machineInfoFrame({serial: identity.serial, model: "test", firmware: "test"}));
    await s.controls.recover();
    expect(s.recovery.snapshot.marker).toBeNull();
});

it("detects changed qualification identity even without a control response", async () => {
    const s = await setup();
    s.respond((item) => accept(s.radio, item));
    await s.controls.open(identity, "scale");
    s.radio.emit(machineInfoFrame({serial: identity.serial, model: "test", firmware: "other-fw"}));
    expect(s.controls.getSnapshot().phase).toBe("unknown");
    expect(s.recovery.snapshot.marker).toBeNull();
    await expect(s.controls.recover()).rejects.toThrow();
    expect(s.machine.controlBlocker).not.toBeNull();
    s.radio.emit(machineInfoFrame({serial: identity.serial, model: "test", firmware: "test"}));
    await s.controls.recover();
});

it("bounds the entire native transaction even if running feedback arrives before a stalled native acceptance", async () => {
    const s = await setup();
    s.respond((item) => accept(s.radio, item));
    await s.controls.open(identity, "grind");
    let settle: () => void = () => {};
    s.radio.syntheticWrite = (frame) => {
        if ((frame[3] | frame[4] << 8) === codes.grind) {
            feedback(s.radio, s.sent[1].tokens, {kind: "running"});
            return new Promise<void>((resolve) => { settle = resolve; });
        }
    };
    jest.useFakeTimers();
    const starting = s.controls.startGrind(grind);
    const rejected = expect(starting).rejects.toThrow("missing");
    await tick();
    await jest.advanceTimersByTimeAsync(51);
    jest.useRealTimers();
    expect(s.controls.getSnapshot().phase).toBe("unknown");
    await rejected;
    expect(s.recovery.snapshot.marker).not.toBeNull();
    settle();
    await tick();
    s.respond((item) => accept(s.radio, item));
    s.radio.syntheticWrite = (frame) => {
        const item = s.sent.findLast((s) => codes[s.command.kind] === (frame[3] | frame[4] << 8));
        if (item) accept(s.radio, item);
    };
    await s.controls.stop();
    await s.controls.close();
});

it("captures the caller identity rather than retaining its mutable object in feedback guards", async () => {
    const s = await setup();
    s.respond((item) => accept(s.radio, item));
    const caller = {...identity};
    await s.controls.open(caller, "scale");
    caller.serial = "other";
    caller.deviceId = "other";
    s.radio.emit(machineInfoFrame({serial: identity.serial, model: "test", firmware: "test"}));
    expect(s.controls.getSnapshot()).toMatchObject({phase: "ready", identity});
    await s.controls.close();
});

it("rechecks a tank flag changed synchronously during durable reservation before water dispatch", async () => {
    let writing = () => {};
    const s = await setup({failStorage: () => { writing(); return false; }});
    s.respond((item) => accept(s.radio, item));
    await s.controls.open(identity, "pour");
    writing = () => s.radio.emit(notification(40522 & 255, 40522 >> 8, [0, 0, 0, 0]));
    await expect(s.controls.startPour(pour)).rejects.toThrow("water");
    expect(s.radio.sent).not.toContain(codes.pour);
    expect(s.controls.getSnapshot().phase).not.toBe("running");
    writing = () => {};
    await s.controls.stop();
    await s.controls.close();
});

it("honors Stop requested synchronously by a reservation observer before native Start", async () => {
    const s = await setup();
    s.respond((item) => accept(s.radio, item));
    await s.controls.open(identity, "grind");
    let stopping: Promise<void> | null = null;
    const off = s.recovery.subscribe(() => {
        if (s.recovery.snapshot.marker && !stopping) stopping = s.controls.stop();
    });
    await expect(s.controls.startGrind(grind)).rejects.toThrow("cancel");
    await stopping;
    off();
    expect(s.radio.sent).toEqual([codes.enter, codes.stop]);
    expect(s.controls.getSnapshot().phase).toBe("ready");
    await s.controls.close();
});

it("honors Stop requested synchronously by the starting snapshot observer", async () => {
    const s = await setup();
    s.respond((item) => accept(s.radio, item));
    await s.controls.open(identity, "grind");
    let stopping: Promise<void> | null = null;
    const off = s.controls.subscribe(() => {
        if (s.controls.getSnapshot().phase === "starting" && !stopping) stopping = s.controls.stop();
    });
    await expect(s.controls.startGrind(grind)).rejects.toThrow("cancel");
    await stopping;
    off();
    expect(s.radio.sent).toEqual([codes.enter]);
    expect(s.controls.getSnapshot().phase).toBe("ready");
    await s.controls.close();
});

it("does not overwrite pre-dispatch connection invalidation with a ready snapshot", async () => {
    const s = await setup();
    s.respond((item) => accept(s.radio, item));
    await s.controls.open(identity, "grind");
    const starting = s.controls.startGrind(grind);
    s.radio.drop();
    await expect(starting).rejects.toThrow();
    expect(s.controls.getSnapshot().phase).toBe("unknown");
    expect(s.recovery.snapshot.marker).toBeNull();
    expect(s.machine.controlBlocker).not.toBeNull();
    await s.machine.connect(identity.deviceId);
    s.radio.emit(status(MACHINE_STATE.IDLE));
    await s.controls.recover();
    expect(s.controls.getSnapshot().phase).toBe("closed");
});

it("keeps a running motor uncertain when later correlated lifecycle feedback contradicts it", async () => {
    const s = await setup();
    s.respond((item) => accept(s.radio, item));
    await s.controls.open(identity, "grind");
    await s.controls.startGrind(grind);
    feedback(s.radio, s.sent[1].tokens, {kind: "ready"});
    expect(s.controls.getSnapshot().phase).toBe("unknown");
    expect(s.recovery.snapshot.marker).not.toBeNull();
    await s.controls.stop();
    await s.controls.close();
});

it.each(["closed", "ready", "running", "tared"] as const)(
    "retains moving recovery's marker and owner after synthetic nonterminal %s feedback",
    async (kind) => {
        const marker = {version: 1, ...identity, tool: "pour"};
        const s = await setup({raw: JSON.stringify(marker)});
        s.respond((item) => {
            if (item.command.kind === "inspect") feedback(s.radio, item.tokens, {kind});
        });
        await expect(s.controls.recover()).rejects.toThrow("Contradictory");
        expect(s.controls.getSnapshot()).toMatchObject({phase: "unknown", identity, tool: "pour"});
        expect(s.recovery.snapshot.marker).toEqual(marker);
        expect(s.machine.controlBlocker).not.toBeNull();
        expect(() => s.machine.acquireControlSession(identity, "recovery")).toThrow("Another");
        await expect(s.controls.close()).rejects.toThrow();
        s.respond((item) => accept(s.radio, item));
        await s.controls.recover();
        expect(s.recovery.snapshot.marker).toBeNull();
    }
);

it.each(["same-write", "pending-native"] as const)(
    "rejects Start on synthetic running then refused feedback during %s completion",
    async (timing) => {
        const s = await setup();
        s.respond((item) => accept(s.radio, item));
        await s.controls.open(identity, "grind");
        let settle = () => {};
        if (timing === "pending-native") {
            const write = s.radio.syntheticWrite;
            s.radio.syntheticWrite = async (frame) => {
                await write?.(frame);
                if ((frame[3] | frame[4] << 8) === codes.grind) {
                    await new Promise<void>((resolve) => { settle = resolve; });
                }
            };
        }
        s.respond((item) => {
            accept(s.radio, item);
            if (item.command.kind === "grind" && timing === "same-write") {
                feedback(s.radio, item.tokens, {kind: "refused", reason: "synthetic refusal"});
            }
        });
        const starting = s.controls.startGrind(grind);
        const rejected = expect(starting).rejects.toThrow("Contradictory");
        if (timing === "pending-native") {
            await tick();
            feedback(s.radio, s.sent[1].tokens, {kind: "refused", reason: "synthetic refusal"});
            settle();
        }
        await rejected;
        expect(s.controls.getSnapshot().phase).toBe("unknown");
        expect(s.recovery.snapshot.marker?.tool).toBe("grind");
        expect(s.machine.controlBlocker).not.toBeNull();
        expect(() => s.machine.acquireControlSession(identity, "recovery")).toThrow("Another");
        s.respond((item) => accept(s.radio, item));
        await s.controls.stop();
        await s.controls.close();
    }
);

it("ignores synthetic contradictory feedback for a different transaction while Start completes", async () => {
    const s = await setup();
    s.respond((item) => {
        accept(s.radio, item);
        if (item.command.kind === "grind") {
            feedback(s.radio, s.sent[0].tokens, {kind: "refused", reason: "stale synthetic refusal"});
        }
    });
    await s.controls.open(identity, "grind");
    await expect(s.controls.startGrind(grind)).resolves.toBeUndefined();
    expect(s.controls.getSnapshot().phase).toBe("running");
    expect(s.recovery.snapshot.marker?.tool).toBe("grind");
    await s.controls.stop();
    await s.controls.close();
});

it("retains nonmoving ownership when reconnect recovery has no fresh normal state", async () => {
    const s = await setup();
    await expect(s.controls.open(identity, "scale")).rejects.toThrow("missing");
    s.radio.drop();
    await s.machine.connect(identity.deviceId);
    await expect(s.controls.recover()).rejects.toThrow("normal");
    expect(s.controls.getSnapshot().phase).toBe("unknown");
    expect(s.recovery.snapshot.marker).toBeNull();
    expect(s.machine.controlBlocker).not.toBeNull();
    await expect(s.machine.askHowItIsDoing()).rejects.toThrow();
    await expect(s.machine.send(buildType1(60011))).rejects.toThrow();
    s.radio.emit(status(MACHINE_STATE.IDLE));
    s.respond((item) => accept(s.radio, item));
    await s.controls.recover();
    expect(s.controls.getSnapshot().phase).toBe("closed");
    expect(s.machine.controlBlocker).toBeNull();
});

it.each(["missing-info", "silent-refresh", "wrong-post-refresh"] as const)(
    "does not accept early proposal feedback instead of required fresh settings readback: %s",
    async (mode) => {
        const s = await setup({refreshSettings: true, infoWaitMs: 10});
        const originalInfo = s.radio.infoReply;
        if (mode !== "wrong-post-refresh") s.radio.infoReply = null;
        s.respond((item) => {
            if (item.command.kind === "inspect") feedback(s.radio, item.tokens, {kind: "settings", readings});
            if (item.command.kind === "setting") {
                if (s.radio.sent.at(-1) === codes.setting) {
                    feedback(s.radio, item.tokens, {kind: "settings", readings: {...readings, brightness: 3}});
                } else if (mode === "wrong-post-refresh") {
                    feedback(s.radio, item.tokens, {kind: "settings", readings});
                } else if (mode === "missing-info") {
                    feedback(s.radio, item.tokens, {kind: "settings", readings: {...readings, brightness: 3}});
                }
            }
        });
        await expect(s.controls.applySetting(identity, "brightness", 3)).rejects.toThrow(/refresh|readback|response/);
        expect(s.controls.getSnapshot()).toMatchObject({
            phase: "unknown", applyingSetting: "brightness", settings: {brightness: 1}
        });
        expect(s.machine.controlBlocker).not.toBeNull();
        expect(s.recovery.snapshot.marker).toBeNull();
        s.radio.infoReply = originalInfo;
        await s.controls.recover();
        expect(s.machine.controlBlocker).toBeNull();
    }
);

it.each(["temperature", "pattern", "setting"] as const)(
    "latches a synthetic same-kind %s value mismatch after an earlier matching response",
    async (kind) => {
        const s = await setup();
        s.respond((item) => accept(s.radio, item));
        if (kind !== "setting") {
            await s.controls.open(identity, "pour");
            await s.controls.startPour(pour);
        }
        s.respond((item) => {
            if (item.command.kind === "inspect") feedback(s.radio, item.tokens, {kind: "settings", readings});
            if (item.command.kind === "temperature") {
                feedback(s.radio, item.tokens, {kind: "temperature", celsius: 85});
                feedback(s.radio, item.tokens, {kind: "temperature", celsius: 84});
            }
            if (item.command.kind === "pattern") {
                feedback(s.radio, item.tokens, {kind: "pattern", pattern: "centered"});
                feedback(s.radio, item.tokens, {kind: "pattern", pattern: "circular"});
            }
            if (item.command.kind === "setting") {
                feedback(s.radio, item.tokens, {kind: "settings", readings: {...readings, brightness: 3}});
                feedback(s.radio, item.tokens, {kind: "settings", readings});
            }
        });
        const operation = kind === "temperature" ? s.controls.setTemperature(85)
            : kind === "pattern" ? s.controls.setPattern("centered")
                : s.controls.applySetting(identity, "brightness", 3);
        await expect(operation).rejects.toThrow("readback");
        expect(s.controls.getSnapshot().phase).toBe("unknown");
        expect(s.machine.controlBlocker).not.toBeNull();
        if (kind === "setting") {
            expect(s.controls.getSnapshot().settings?.brightness).toBe(1);
            expect(s.recovery.snapshot.marker).toBeNull();
            await s.controls.recover();
        } else {
            expect(s.controls.getSnapshot()).toMatchObject({temperatureC: 80, pattern: "spiral"});
            expect(s.recovery.snapshot.marker?.tool).toBe("pour");
            s.respond((item) => accept(s.radio, item));
            await s.controls.stop();
            await s.controls.close();
        }
    }
);

it("ignores a stale other-transaction value mismatch during synthetic live confirmation", async () => {
    const s = await setup();
    s.respond((item) => accept(s.radio, item));
    await s.controls.open(identity, "pour");
    await s.controls.startPour(pour);
    s.respond((item) => {
        if (item.command.kind === "temperature") {
            feedback(s.radio, item.tokens, {kind: "temperature", celsius: 85});
            feedback(s.radio, s.sent[0].tokens, {kind: "temperature", celsius: 84});
        } else accept(s.radio, item);
    });
    await s.controls.setTemperature(85);
    expect(s.controls.getSnapshot()).toMatchObject({phase: "running", temperatureC: 85});
    await s.controls.stop();
    await s.controls.close();
});

it("streams correlated grams after synthetic refresh-only Scale entry and ignores wrong or stale tokens", async () => {
    const s = await setup({refreshOnlyScale: true});
    s.respond((item) => accept(s.radio, item));
    await s.controls.open(identity, "scale");
    const entry = s.sent[0].tokens;
    expect(s.radio.sent).toEqual([8100]);
    expect(s.controls.getSnapshot()).toMatchObject({phase: "ready", cupGrams: null});
    feedback(s.radio, {...entry, session: entry.session + 1}, {kind: "cup", grams: 99});
    feedback(s.radio, {...entry, transaction: entry.transaction + 1}, {kind: "cup", grams: 99});
    expect(s.controls.getSnapshot().cupGrams).toBeNull();
    feedback(s.radio, entry, {kind: "cup", grams: 42.5});
    expect(s.controls.getSnapshot().cupGrams).toBe(42.5);
    await s.controls.close();
    await s.controls.open(identity, "scale");
    feedback(s.radio, entry, {kind: "cup", grams: 99});
    expect(s.controls.getSnapshot().cupGrams).toBeNull();
    feedback(s.radio, s.sent[2].tokens, {kind: "cup", grams: 44});
    expect(s.controls.getSnapshot().cupGrams).toBe(44);
    await s.controls.close();
});
