import Machine from "@/library/machine/Machine";
import {ControlRecoveryStore} from "@/library/machine/controlRecovery";
import {ControlOperationError, isBrewRefusal} from "@/library/machine/errors";
import {buildType1, MACHINE_STATE} from "@/library/machine/protocol";
import {FRAME_GAP_MS, HANDSHAKE_FRESH_MS, STATE_FRESH_MS} from "@/constants/machine";
import {SlotDatabase} from "@/library/slots/SlotDatabase";
import {prepareSet, snapshotRecipe} from "@/library/slots/slotModel";
import {coffee} from "@/library/slots/__tests__/fixtures";
import {createTestDatabase} from "@/test-utils/sqlite";
import {FakeTransport, machineInfoFrame} from "./FakeTransport";
import {event, status} from "./protocolFixtures";

const identity = {deviceId: "one", serial: "J15ABC123456"};
const marker = {version: 1, ...identity, tool: "pour"} as const;
// These existing frames exercise transport ownership, not standalone command qualification.
class Radio extends FakeTransport {
    get connectedDeviceId() { return this.connectedTo; }
    callbacks: ((frame: Uint8Array, source?: string) => void)[] = [];
    override onFrame(listener: (frame: Uint8Array, source?: string) => void) {
        this.callbacks.push(listener);
        return super.onFrame(listener);
    }
}

async function setup(raw = "", frameGapMs = 0) {
    let stored = raw;
    const recovery = new ControlRecoveryStore({read: () => stored, write: (next) => { stored = next; }});
    const radio = new Radio();
    const machine = new Machine(radio, {frameGapMs});
    const slots = new SlotDatabase(createTestDatabase());
    machine.installSlotDatabase(slots);
    machine.installControlRecovery(recovery);
    machine.setAppState("active");
    await machine.connect("one");
    radio.emit(status(MACHINE_STATE.IDLE));
    radio.written = [];
    return {machine, radio, slots, recovery};
}

it("excludes every ordinary radio path before even brew cleanup or refresh writes", async () => {
    const {machine, radio} = await setup();
    const lease = machine.acquireControlSession(identity, "grind");
    expect(machine.controlBlocker).toBeInstanceOf(ControlOperationError);
    expect(isBrewRefusal(machine.controlBlocker)).toBe(true);
    await expect(machine.send(buildType1(40521))).rejects.toBeInstanceOf(ControlOperationError);
    await expect(machine.askHowItIsDoing()).rejects.toBeInstanceOf(ControlOperationError);
    await expect(machine.brew(coffee("test"))).rejects.toBeInstanceOf(ControlOperationError);
    await expect(machine.switchToProAndRetry(coffee("test"))).rejects.toBeInstanceOf(ControlOperationError);
    expect(() => machine.acquireSlotSession(identity)).toThrow(ControlOperationError);
    expect(() => machine.assertCanForgetDevice("different")).toThrow(ControlOperationError);
    expect(radio.sent).toEqual([]);
    lease.release();
    expect(machine.controlBlocker).toBeNull();
});

it("requires fresh normal state, foreground, exact device and serial, and no active or lost brew", async () => {
    const {machine, radio} = await setup();
    expect(() => machine.acquireControlSession({...identity, serial: null}, "setting")).toThrow(ControlOperationError);
    expect(() => machine.acquireControlSession({...identity, deviceId: "two"}, "scale")).toThrow(ControlOperationError);
    for (const name of ["waking", "lostContact"] as const) {
        machine.phase = {name};
        expect(() => machine.acquireControlSession(identity, "grind")).toThrow(ControlOperationError);
    }
    machine.phase = {name: "idle"};
    machine.setAppState("background");
    expect(() => machine.acquireControlSession(identity, "scale")).toThrow(ControlOperationError);
    machine.setAppState("active");
    radio.emit(status(MACHINE_STATE.BREWING));
    expect(() => machine.acquireControlSession(identity, "scale")).toThrow(ControlOperationError);
    radio.emit(status(MACHINE_STATE.IDLE));
    const now = jest.spyOn(Date, "now").mockReturnValue(Date.now() + STATE_FRESH_MS + 1);
    expect(() => machine.acquireControlSession(identity, "setting")).toThrow(ControlOperationError);
    now.mockRestore();
    await machine.send(buildType1(40521));
    expect(() => machine.acquireControlSession(identity, "grind")).toThrow(ControlOperationError);
});

it("never overrides slot journal exclusion, even for recovery", async () => {
    const {machine, slots, recovery} = await setup();
    const item = snapshotRecipe(coffee("test"));
    const items = [item, item, item] as const;
    slots.begin("one", {
        id: "slot", serial: identity.serial, slots: [...items], frames: prepareSet([...items]),
        acknowledged: 0, inFlight: null, error: null
    });
    expect(() => machine.acquireControlSession(identity, "grind")).toThrow(ControlOperationError);
    recovery.reserve(marker);
    expect(() => machine.acquireControlSession(identity, "recovery")).toThrow(ControlOperationError);
});

it("provides leased 8100 refresh, frame budget and token isolation without phantom brews", async () => {
    const {machine, radio} = await setup();
    const changed = jest.fn();
    machine.onLink(changed);
    const lease = machine.acquireControlSession(identity, "scale");
    await expect(lease.refreshInfo()).resolves.toBe(true);
    expect(radio.sent).toEqual([8100]);
    radio.frameBudget = 2;
    await expect(lease.send(buildType1(40521))).rejects.toThrow("narrow");
    radio.frameBudget = 244;
    radio.emit(event(40510));
    expect(machine.phase.name).toBe("idle");
    lease.release();
    const next = machine.acquireControlSession(identity, "scale");
    lease.release();
    await expect(lease.refreshInfo()).rejects.toBeInstanceOf(ControlOperationError);
    expect(machine.controlBlocker).not.toBeNull();
    next.release();
    expect(changed).toHaveBeenCalled();
});

it("restores a global reservation, permits only matched recovery inspection/stop, and retains it on disconnect", async () => {
    const {machine, radio} = await setup(JSON.stringify(marker));
    expect(machine.controlRecovery).toEqual({marker, error: null});
    radio.emit(status(MACHINE_STATE.NO_WATER));
    expect(() => machine.acquireControlSession(identity, "pour")).toThrow(ControlOperationError);
    expect(() => machine.acquireControlSession({...identity, serial: null}, "recovery")).toThrow(ControlOperationError);
    const lease = machine.acquireControlSession(identity, "recovery");
    await expect(lease.send(buildType1(40521))).rejects.toBeInstanceOf(ControlOperationError);
    await expect(lease.refreshInfo()).resolves.toBe(true);
    await lease.sendStop(buildType1(40519));
    await machine.disconnect();
    expect(machine.controlBlocker).not.toBeNull();
    await expect(lease.sendStop(buildType1(40519))).rejects.toBeInstanceOf(ControlOperationError);
    lease.release();
    await expect(machine.connect("two")).rejects.toBeInstanceOf(ControlOperationError);
    expect(radio.connectedTo).toBeNull();
});

it("reserves durably only on explicit possible-start preparation and clears only with proof", async () => {
    const {machine, recovery} = await setup();
    const changed = jest.fn();
    machine.onLink(changed);
    const lease = machine.acquireControlSession(identity, "pour");
    expect(recovery.snapshot.marker).toBeNull();
    lease.reserve();
    expect(changed).toHaveBeenCalledTimes(2);
    expect(recovery.snapshot.marker).toEqual(marker);
    expect(() => lease.clearRecovery({...marker, qualifiedTerminal: false})).toThrow(ControlOperationError);
    lease.clearRecovery({...marker, qualifiedTerminal: true});
    expect(changed).toHaveBeenCalledTimes(3);
    lease.release();
    expect(machine.controlBlocker).toBeNull();
});

it("rechecks identity and generation after writes and before subsequent dispatch", async () => {
    const {machine, radio} = await setup();
    const lease = machine.acquireControlSession(identity, "grind");
    const original = radio.write.bind(radio);
    radio.write = async (frame) => {
        await original(frame);
        radio.emit(machineInfoFrame({serial: "DIFFERENT"}));
    };
    await expect(lease.send(buildType1(40521))).rejects.toBeInstanceOf(ControlOperationError);
    const count = radio.sent.length;
    await expect(lease.send(buildType1(40521))).rejects.toBeInstanceOf(ControlOperationError);
    expect(radio.sent).toHaveLength(count);
    lease.release();
    radio.write = original;
    await machine.disconnect();
    await machine.connect("one");
    radio.emit(status(MACHINE_STATE.IDLE));
    const next = machine.acquireControlSession(identity, "scale");
    await expect(lease.refreshInfo()).rejects.toBeInstanceOf(ControlOperationError);
    next.release();
});

it("shares tank readings but never guesses actual source from MachineInfo", async () => {
    const {machine, radio} = await setup();
    const lease = machine.acquireControlSession(identity, "pour");
    expect(() => lease.assertPourPreflight(null)).toThrow(ControlOperationError);
    expect(() => lease.assertPourPreflight("tank")).not.toThrow();
    radio.emit(event(40522, 0));
    expect(() => lease.assertPourPreflight("tank")).toThrow(ControlOperationError);
    expect(() => lease.assertPourPreflight("tap")).not.toThrow();
    radio.emit(machineInfoFrame({waterEnough: 0, waterFeed: 1}));
    expect(() => lease.assertPourPreflight("tank")).toThrow(ControlOperationError);
    lease.release();
    expect(() => machine.acquireControlSession(identity, "grind")).not.toThrow();
});

it("runs a synthetic control dispatch callback only after pacing and MTU checks", async () => {
    const {machine, radio} = await setup("", 10);
    const lease = machine.acquireControlSession(identity, "pour");
    const dispatch = jest.fn(() => lease.assertPourPreflight("tank"));
    radio.frameBudget = 2;
    await expect(lease.send(buildType1(60001), dispatch)).rejects.toThrow("narrow");
    expect(dispatch).not.toHaveBeenCalled();
    radio.frameBudget = 244;
    await lease.send(buildType1(60001));
    const sending = lease.send(buildType1(60002), dispatch);
    radio.emit(event(40522, 0));
    await expect(sending).rejects.toThrow("water");
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(radio.sent).toEqual([60001]);
    lease.release();
});

it("cancels a synthetic queued control handshake without dispatching a nonessential frame", async () => {
    const {machine, radio} = await setup("", 10);
    const lease = machine.acquireControlSession(identity, "scale");
    await lease.send(buildType1(60001));
    const clock = jest.spyOn(Date, "now").mockReturnValue(Date.now() + HANDSHAKE_FRESH_MS + 1);
    let current = true;
    const dispatch = jest.fn();
    const checkCurrent = () => { if (!current) throw new Error("cancelled"); };
    try {
        const sending = lease.send(buildType1(60002), dispatch, checkCurrent);
        current = false;
        await expect(sending).rejects.toThrow("cancelled");
        expect(dispatch).not.toHaveBeenCalled();
        expect(radio.sent).toEqual([60001]);
    } finally {
        clock.mockRestore();
        lease.release();
    }
});

it("refuses dispatch after failed reservation and keeps stop/recovery available after a failed clear", async () => {
    const radio = new Radio();
    const machine = new Machine(radio, {frameGapMs: 0});
    let fail = true;
    const store = new ControlRecoveryStore({
        read: () => "", write: () => { if (fail) throw new Error("storage"); }
    });
    machine.installControlRecovery(store);
    await machine.connect("one");
    radio.emit(status(MACHINE_STATE.IDLE));
    radio.written = [];
    const lease = machine.acquireControlSession(identity, "pour");
    expect(() => lease.reserve()).toThrow(ControlOperationError);
    await expect(lease.send(buildType1(40521))).rejects.toBeInstanceOf(ControlOperationError);
    expect(radio.sent).toEqual([]);
    fail = false;
    lease.clearRecovery({...marker, qualifiedTerminal: true});
    lease.reserve();
    fail = true;
    expect(() => lease.clearRecovery({...marker, qualifiedTerminal: true})).toThrow(ControlOperationError);
    await lease.sendStop(buildType1(40519));
    lease.release();
    await machine.disconnect();
    await machine.connect("one");
    const recovery = machine.acquireControlSession(identity, "recovery");
    await recovery.sendStop(buildType1(40519));
    fail = false;
    recovery.clearRecovery({...marker, qualifiedTerminal: true});
    recovery.release();
    expect(machine.controlBlocker).toBeNull();
});

it("renews a stale session through the leased frame path, not through public send", async () => {
    const {machine, radio} = await setup();
    const lease = machine.acquireControlSession(identity, "scale");
    const time = jest.spyOn(Date, "now").mockReturnValue(Date.now() + HANDSHAKE_FRESH_MS + 1);
    try {
        await lease.send(buildType1(40521));
        expect(radio.sent).toEqual([8100, 40521]);
    } finally { time.mockRestore(); lease.release(); }
});

it("blocks acquisition while an ordinary refresh is waiting and when no state is known", async () => {
    const {machine, radio} = await setup();
    radio.infoReply = null;
    const refresh = machine.askHowItIsDoing();
    expect(() => machine.acquireControlSession(identity, "setting")).toThrow(ControlOperationError);
    radio.emit(machineInfoFrame());
    await refresh;
    await machine.disconnect();
    radio.infoReply = machineInfoFrame();
    await machine.connect("one");
    expect(() => machine.acquireControlSession(identity, "grind")).toThrow(ControlOperationError);
    expect(() => machine.acquireControlSession(identity, "recovery")).toThrow(ControlOperationError);
});

it("checks after a pending refresh wait and invalidates paced dispatch on background", async () => {
    const {machine, radio} = await setup();
    const lease = machine.acquireControlSession(identity, "scale");
    radio.infoReply = null;
    const refresh = lease.refreshInfo();
    machine.setAppState("background");
    radio.emit(machineInfoFrame());
    await expect(refresh).rejects.toBeInstanceOf(ControlOperationError);
    const count = radio.sent.length;
    machine.setAppState("active");
    await expect(lease.send(buildType1(40521))).rejects.toBeInstanceOf(ControlOperationError);
    expect(radio.sent).toHaveLength(count);
    lease.release();
});

it("accepts an exact nullable reported serial and refuses it as soon as the serial is learned", async () => {
    const {machine, radio} = await setup();
    radio.emit(machineInfoFrame({serial: ""}));
    const lease = machine.acquireControlSession({...identity, serial: null}, "scale");
    radio.emit(machineInfoFrame());
    await expect(lease.refreshInfo()).rejects.toBeInstanceOf(ControlOperationError);
    expect(radio.sent).toEqual([]);
    lease.release();
});

it("never dispatches the next paced frame after entering the background", async () => {
    jest.useFakeTimers();
    try {
        const {machine, radio} = await setup("", FRAME_GAP_MS);
        const lease = machine.acquireControlSession(identity, "scale");
        await lease.send(buildType1(40521));
        const pending = lease.send(buildType1(40521)).catch((error: unknown) => error);
        machine.setAppState("background");
        expect(await pending).toBeInstanceOf(ControlOperationError);
        await jest.runOnlyPendingTimersAsync();
        expect(radio.sent).toEqual([40521]);
        lease.release();
    } finally { jest.useRealTimers(); }
});

it("rechecks persistence before a paced mutation, even when a clear failed during the wait", async () => {
    jest.useFakeTimers();
    try {
        let fail = false;
        const radio = new Radio();
        const machine = new Machine(radio, {frameGapMs: FRAME_GAP_MS});
        machine.installControlRecovery(new ControlRecoveryStore({
            read: () => "", write: () => { if (fail) throw new Error("storage"); }
        }));
        await machine.connect("one");
        radio.emit(status(MACHINE_STATE.IDLE));
        radio.written = [];
        const lease = machine.acquireControlSession(identity, "pour");
        lease.reserve();
        await lease.send(buildType1(40521));
        const pending = lease.send(buildType1(40521)).catch((error: unknown) => error);
        fail = true;
        expect(() => lease.clearRecovery({...marker, qualifiedTerminal: true})).toThrow(ControlOperationError);
        await jest.advanceTimersByTimeAsync(FRAME_GAP_MS);
        expect(await pending).toBeInstanceOf(ControlOperationError);
        expect(radio.sent).toEqual([40521]);
        lease.release();
    } finally { jest.useRealTimers(); }
});

it("invalidates across a connection generation and ignores callbacks from the old connection", async () => {
    const {machine, radio} = await setup(JSON.stringify(marker));
    const oldCallback = radio.callbacks[0];
    const lease = machine.acquireControlSession(identity, "recovery");
    const original = radio.write.bind(radio);
    radio.write = async (frame) => {
        await original(frame);
        await machine.disconnect();
    };
    await expect(lease.sendStop(buildType1(40519))).rejects.toBeInstanceOf(ControlOperationError);
    lease.release();
    radio.write = original;
    await machine.connect("one");
    oldCallback(Uint8Array.from(machineInfoFrame({serial: "OLD-SERIAL"})));
    oldCallback(Uint8Array.from(status(MACHINE_STATE.BREWING)));
    oldCallback(Uint8Array.from(event(40510)));
    expect(machine.slotIdentity).toEqual(identity);
    expect(machine.state).toBeNull();
    expect(machine.phase.name).toBe("idle");
    const next = machine.acquireControlSession(identity, "recovery");
    await expect(lease.refreshInfo()).rejects.toBeInstanceOf(ControlOperationError);
    next.release();
});

it("does not grant possible-start or pour-preflight authority to recovery or settings", async () => {
    const {machine} = await setup(JSON.stringify(marker));
    const recovery = machine.acquireControlSession(identity, "recovery");
    expect(() => recovery.reserve()).toThrow(ControlOperationError);
    expect(() => recovery.assertPourPreflight("tap")).toThrow(ControlOperationError);
    recovery.clearRecovery({...marker, qualifiedTerminal: true});
    recovery.release();
    const settings = machine.acquireControlSession(identity, "setting");
    expect(() => settings.reserve()).toThrow(ControlOperationError);
    settings.release();
});

it("rechecks known normal state before a settings mutation, not just at acquisition", async () => {
    const {machine, radio} = await setup();
    const lease = machine.acquireControlSession(identity, "setting");
    radio.emit(status(MACHINE_STATE.NO_WATER));
    await expect(lease.send(buildType1(40521))).rejects.toBeInstanceOf(ControlOperationError);
    expect(radio.sent).toEqual([]);
    lease.release();
});

it("keeps the whole PRO retry reserved across normal-state replies, gaps and its handshake", async () => {
    jest.useFakeTimers();
    const {machine, radio} = await setup("", FRAME_GAP_MS);
    const original = radio.write.bind(radio);
    radio.write = async (frame) => {
        await original(frame);
        if ((frame[3] | frame[4] << 8) === 11511) radio.emit(status(MACHINE_STATE.IDLE));
    };
    machine.phase = {name: "failed", reason: "rejected"};
    const pending = machine.switchToProAndRetry(coffee("test")).catch((error: unknown) => error);
    try {
        await jest.advanceTimersByTimeAsync(0);
        expect(radio.sent).toEqual([11511]);
        expect(() => machine.acquireControlSession(identity, "scale")).toThrow(ControlOperationError);
        expect(() => machine.acquireSlotSession(identity)).toThrow(/busy/i);
        await jest.advanceTimersByTimeAsync(FRAME_GAP_MS);
        expect(radio.sent).toEqual([11511, 8100]);
        expect(() => machine.acquireControlSession(identity, "setting")).toThrow(ControlOperationError);
        await jest.advanceTimersByTimeAsync(FRAME_GAP_MS * 10);
        expect(await pending).toBeUndefined();
    } finally {
        await machine.disconnect();
        await jest.advanceTimersByTimeAsync(FRAME_GAP_MS * 10);
        await pending;
        jest.useRealTimers();
    }
});

it.each(["send", "sendStop", "refreshInfo"] as const)(
    "retains exclusion when released during an unresolved leased %s write",
    async (method) => {
        const {machine, radio} = await setup();
        const original = radio.write.bind(radio);
        let unblock!: () => void;
        const held = new Promise<void>((resolve) => { unblock = resolve; });
        let entered!: () => void;
        const writing = new Promise<void>((resolve) => { entered = resolve; });
        radio.write = async (frame) => {
            entered();
            await held;
            await original(frame);
        };
        const lease = machine.acquireControlSession(identity, "scale");
        const pending = (method === "refreshInfo"
            ? lease.refreshInfo()
            : lease[method](buildType1(40521))).catch((error: unknown) => error);
        await writing;
        try {
            lease.release();
            expect(machine.controlBlocker).toBeInstanceOf(ControlOperationError);
            expect(() => machine.acquireControlSession(identity, "scale")).toThrow(ControlOperationError);
            expect(() => machine.acquireSlotSession(identity)).toThrow(ControlOperationError);
            await expect(machine.send(buildType1(40521))).rejects.toBeInstanceOf(ControlOperationError);
            await expect(machine.askHowItIsDoing()).rejects.toBeInstanceOf(ControlOperationError);
            await expect(machine.brew(coffee("test"))).rejects.toBeInstanceOf(ControlOperationError);
            expect(radio.sent).toEqual([]);
            unblock();
            expect(await pending).toBeInstanceOf(ControlOperationError);
            expect(radio.sent).toEqual([method === "refreshInfo" ? 8100 : 40521]);
            const next = machine.acquireControlSession(identity, "scale");
            await next.refreshInfo();
            expect(radio.sent).toEqual([method === "refreshInfo" ? 8100 : 40521, 8100]);
            next.release();
        } finally {
            unblock();
            await pending;
            lease.release();
            await machine.disconnect();
        }
    }
);

it("retains a released refresh owner until its info wait settles, not just its native write", async () => {
    const {machine, radio} = await setup();
    radio.infoReply = null;
    const lease = machine.acquireControlSession(identity, "scale");
    const pending = lease.refreshInfo().catch((error: unknown) => error);
    for (let i = 0; i < 10; i++) await Promise.resolve();
    try {
        expect(radio.sent).toEqual([8100]);
        lease.release();
        expect(() => machine.acquireControlSession(identity, "scale")).toThrow(ControlOperationError);
        radio.emit(machineInfoFrame());
        expect(await pending).toBeInstanceOf(ControlOperationError);
        const next = machine.acquireControlSession(identity, "scale");
        next.release();
    } finally {
        radio.emit(machineInfoFrame());
        await pending;
        lease.release();
        await machine.disconnect();
    }
});

it("waits for every released operation to settle, including a rejected native write", async () => {
    const {machine, radio} = await setup();
    const original = radio.write.bind(radio);
    const releases: (() => void)[] = [];
    let entered!: () => void;
    const writing = new Promise<void>((resolve) => { entered = resolve; });
    radio.write = async (frame) => {
        await new Promise<void>((resolve) => {
            releases.push(resolve);
            if (releases.length === 2) entered();
        });
        await original(frame);
    };
    const lease = machine.acquireControlSession(identity, "scale");
    const first = lease.send(buildType1(40521)).catch((error: unknown) => error);
    const second = lease.refreshInfo().catch((error: unknown) => error);
    await writing;
    try {
        lease.release();
        radio.failNextWrite = "native refusal";
        releases[0]();
        expect(await first).toBeInstanceOf(ControlOperationError);
        expect(machine.controlBlocker).toBeInstanceOf(ControlOperationError);
        expect(() => machine.acquireControlSession(identity, "scale")).toThrow(ControlOperationError);
        releases[1]();
        expect(await second).toBeInstanceOf(ControlOperationError);
        expect(radio.sent).toEqual([8100]);
        const next = machine.acquireControlSession(identity, "scale");
        next.release();
    } finally {
        releases.forEach((release) => release());
        await Promise.all([first, second]);
        lease.release();
        await machine.disconnect();
    }
});
