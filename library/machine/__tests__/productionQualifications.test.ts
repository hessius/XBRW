import Machine from "@/library/machine/Machine";
import MachineControls from "@/library/machine/MachineControls";
import {ControlRecoveryStore} from "@/library/machine/controlRecovery";
import {StudioControlProtocol} from "@/library/machine/productionQualifications";
import {MACHINE_STATE, buildType1, buildType2} from "@/library/machine/protocol";
import {FakeTransport, machineInfoFrame} from "@/library/machine/__tests__/FakeTransport";
import {event, notification, status} from "@/library/machine/__tests__/protocolFixtures";

function hexBytes(hex: string): number[] {
    const out: number[] = [];
    for (let i = 0; i < hex.length; i += 2) {
        out.push(parseInt(hex.slice(i, i + 2), 16));
    }
    return out;
}

function uint32Frame(code: number, value: number): number[] {
    const payload = [
        value & 0xFF,
        (value >>> 8) & 0xFF,
        (value >>> 16) & 0xFF,
        (value >>> 24) & 0xFF
    ];
    return notification(code & 0xFF, (code >> 8) & 0xFF, payload);
}

function float32WeightFrame(type: 0x15 | 0x4B, value: number): number[] {
    const buf = new ArrayBuffer(4);
    new DataView(buf).setFloat32(0, value, true);
    return notification(type, type === 0x15 ? 0x50 : 0x9E, Array.from(new Uint8Array(buf)));
}

// Captured 40521 payloads from hardware (J15A01B5AF231 from 2026-11-02, J15A02A45H038 from protocol.test.ts)
const studioIdentity = {deviceId: "studio-5af231", serial: "J15A01B5AF231"};
const j15F231Info = hexBytes(
    "580207499e4b000000c1"
    + "4a313541303142354146323331ffffffffffff5631322e30442e3530308042c547010001004e0fdc01011da5010000401e6c43913278560000000000000000"
    + "0000"
);
const j15F231Frame = notification(
    0x49, 0x9E, j15F231Info.slice(10, j15F231Info.length - 2)
);
const j15H038Captured = [
    0x58, 0x02, 0x07, 0x49, 0x9E, 0x4B, 0x00, 0x00, 0x00, 0xC1,
    0x4A, 0x31, 0x35, 0x41, 0x30, 0x32, 0x41, 0x34, 0x35, 0x48,
    0x30, 0x33, 0x38, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0x56,
    0x31, 0x32, 0x2E, 0x30, 0x44, 0x2E, 0x35, 0x30, 0x30, 0x80,
    0x30, 0xBA, 0x47, 0x00, 0x00, 0x01, 0x01, 0x5A, 0x0F, 0x6E,
    0x01, 0x01, 0x41, 0x36, 0x03, 0x00, 0x00, 0x00, 0x11, 0xDF,
    0x42, 0x91, 0x32, 0x78, 0x56, 0xBC, 0x02, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x39, 0x34
];

class Radio extends FakeTransport {
    get connectedDeviceId() { return this.connectedTo; }
}

async function studioSetup(infoFrame: number[] = j15F231Frame, stateReplyMs?: number) {
    const radio = new Radio();
    radio.infoReply = infoFrame;
    let raw = "";
    const recovery = new ControlRecoveryStore({read: () => raw, write: (next) => { raw = next; }});
    const machine = new Machine(radio, {frameGapMs: 0, stateReplyMs});
    machine.installControlRecovery(recovery);
    await machine.connect(studioIdentity.deviceId);
    radio.emit(status(MACHINE_STATE.IDLE));
    radio.written = [];
    const controls = new MachineControls(machine);
    return {machine, radio, recovery, controls};
}

describe("Studio production qualifications", () => {
    it("hydrates 40521 settings passively on connect with zero BLE sends and degrades cleanly offline", async () => {
        const s = await studioSetup();
        expect(s.radio.sent).toEqual([]);
        expect(s.controls.getSnapshot()).toMatchObject({
            phase: "closed",
            identity: studioIdentity,
            settings: {
                temperatureUnit: "C",
                weightUnit: "g",
                brightness: 15,
                waterSource: "tank",
                pourRadius: null,
                vibrationAmplitude: null
            }
        });
        expect(s.controls.describeSettings(studioIdentity, "temperatureUnit")).toMatchObject({
            unavailable: null, reading: "current", readingReason: null
        });
        expect(s.controls.describeSettings(studioIdentity, "vibrationAmplitude")).toMatchObject({
            unavailable: null, reading: "unavailable", readingReason: "missing-readback"
        });
        s.radio.drop();
        expect(s.controls.describeSettings(studioIdentity, "temperatureUnit")).toMatchObject({
            reading: "last-known", readingReason: "offline"
        });
        s.controls.dispose();
    });

    it("hydrates non-zero 40521 pour radius (700 on J15A02A45H038) on connect", async () => {
        const h038Identity = {deviceId: "studio-5af231", serial: "J15A02A45H038"};
        const s = await studioSetup(j15H038Captured);
        expect(s.controls.describeSettings(h038Identity, "pourRadius")).toMatchObject({
            unavailable: null, reading: "current"
        });
        expect(s.controls.getSnapshot().settings).toMatchObject({
            temperatureUnit: "C",
            weightUnit: "g",
            brightness: 15,
            waterSource: "tap",
            pourRadius: 700,
            vibrationAmplitude: null
        });
        s.controls.dispose();
    });

    it("reads captured 11508 agitation amplitude (1300) and writes via 11509 without wiping core settings", async () => {
        const s = await studioSetup();
        const captured11508 = hexBytes("580207f42c10000000c214050000063e");
        s.radio.syntheticWrite = (frame) => {
            const code = frame[3] | (frame[4] << 8);
            if (code === 11508) {
                expect(Array.from(frame)).toEqual(Array.from(buildType2(11508, new Uint8Array(0))));
                s.radio.emit(captured11508);
            }
            if (code === 11509) {
                expect(Array.from(frame)).toEqual(Array.from(buildType2(11509, new Uint8Array([0x78, 0x05, 0x00, 0x00]))));
                s.radio.emit(uint32Frame(11509, 1400));
            }
        };
        await s.controls.readSettings(studioIdentity, "vibrationAmplitude");
        expect(s.radio.sent).toEqual([11508]);
        expect(s.controls.getSnapshot().settings).toMatchObject({
            temperatureUnit: "C",
            weightUnit: "g",
            brightness: 15,
            waterSource: "tank",
            vibrationAmplitude: 1300
        });
        await s.controls.applySetting(studioIdentity, "vibrationAmplitude", 1400);
        expect(s.controls.getSnapshot().settings?.vibrationAmplitude).toBe(1400);
        s.controls.dispose();
    });

    it("executes Scale enter (8003), cup telemetry (0x15), tare (8500) and exit (8014) and re-hydrates settings on close", async () => {
        const s = await studioSetup();
        s.radio.syntheticWrite = (frame) => {
            const code = frame[3] | (frame[4] << 8);
            if (code === 8003) s.radio.emit(event(8003));
            if (code === 8500) s.radio.emit(event(8500));
            if (code === 8014) s.radio.emit(event(8014));
        };
        await s.controls.open(studioIdentity, "scale");
        expect(s.controls.getSnapshot().phase).toBe("ready");
        s.radio.emit(float32WeightFrame(0x15, 136.21));
        expect(s.controls.getSnapshot().cupGrams).toBeCloseTo(136.21, 2);
        await s.controls.tare();
        s.radio.emit(float32WeightFrame(0x15, 0));
        expect(s.controls.getSnapshot().cupGrams).toBe(0);
        await s.controls.close();
        expect(s.controls.getSnapshot()).toMatchObject({
            phase: "closed",
            settings: expect.objectContaining({temperatureUnit: "C", brightness: 15})
        });
        s.controls.dispose();
    });

    it("executes Grind enter (8006), start (3500 with step-5 RPM), stop (3505) and quit (8012)", async () => {
        const s = await studioSetup();
        s.radio.syntheticWrite = (frame) => {
            const code = frame[3] | (frame[4] << 8);
            if (code === 8006) {
                expect(Array.from(frame)).toEqual(Array.from(buildType1(8006, [60, 80])));
                s.radio.emit(event(8006));
            }
            if (code === 3500) {
                expect(Array.from(frame)).toEqual(Array.from(buildType1(3500, [1000, 20, 85])));
                s.radio.emit(event(3500));
            }
            if (code === 3505) s.radio.emit(event(3505));
            if (code === 8012) s.radio.emit(event(8012));
        };
        await s.controls.open(studioIdentity, "grind");
        await s.controls.startGrind({grindSize: 20, rpm: 85});
        expect(s.controls.getSnapshot()).toMatchObject({phase: "running", grindRequest: {grindSize: 20, rpm: 85}});
        await s.controls.stop();
        expect(s.controls.getSnapshot().phase).toBe("ready");
        await s.controls.close();
        expect(s.controls.getSnapshot().phase).toBe("closed");
        s.controls.dispose();
    });

    it("executes Pour target and continuous (vol=0), live temp (4510 float32 ack), live pattern (8016) and stop (4507)", async () => {
        const s = await studioSetup();
        const floatBits = (value: number): number => {
            const buf = new ArrayBuffer(4);
            new DataView(buf).setFloat32(0, value, true);
            return new DataView(buf).getInt32(0, true);
        };
        const flow30Bits = floatBits(30.0);
        const vol600Bits = floatBits(600.0);
        const temp620Bits = floatBits(620.0);
        const captured4510 = hexBytes("5802079e1110000000c10000c8430000");
        const valid4510 = notification(0x9E, 0x11, captured4510.slice(10, 14));
        s.radio.syntheticWrite = (frame) => {
            const code = frame[3] | (frame[4] << 8);
            if (code === 8007) {
                expect(Array.from(frame)).toEqual(Array.from(buildType1(8007, [0, floatBits(250.0)])));
                s.radio.emit(event(8007));
            }
            if (code === 4506) s.radio.emit(event(4506));
            if (code === 4510) {
                expect(Array.from(frame)).toEqual(Array.from(buildType1(4510, [400])));
                s.radio.emit(valid4510);
            }
            if (code === 8016) {
                expect(Array.from(frame)).toEqual(Array.from(buildType1(8016, [2])));
                s.radio.emit(event(8016));
            }
            if (code === 4507) s.radio.emit(event(4507));
            if (code === 8013) s.radio.emit(event(8013));
        };
        await s.controls.open(studioIdentity, "pour");
        await s.controls.startPour({
            mode: "target", temperatureC: 62, pattern: "circular", volumeMl: 60, flowMlPerSecond: 3
        });
        expect(s.radio.written.map((f) => Array.from(f))).toContainEqual(
            Array.from(buildType1(4506, [flow30Bits, vol600Bits, temp620Bits, 0, 1]))
        );
        await s.controls.setTemperature(40);
        await s.controls.setPattern("spiral");
        expect(s.controls.getSnapshot()).toMatchObject({phase: "running", temperatureC: 40, pattern: "spiral"});
        await s.controls.stop();
        await s.controls.startPour({
            mode: "continuous", temperatureC: 62, pattern: "spiral", flowMlPerSecond: 3
        });
        expect(s.radio.written.map((f) => Array.from(f))).toContainEqual(
            Array.from(buildType1(4506, [flow30Bits, 0, temp620Bits, 0, 2]))
        );
        await s.controls.stop();
        await s.controls.startPour({
            mode: "target", temperatureC: 62, pattern: "centered", volumeMl: 60, flowMlPerSecond: 3
        });
        expect(s.radio.written.map((f) => Array.from(f))).toContainEqual(
            Array.from(buildType1(4506, [flow30Bits, vol600Bits, temp620Bits, 0, 0]))
        );
        await s.controls.stop();
        await s.controls.close();
        expect(s.controls.getSnapshot().phase).toBe("closed");
        s.controls.dispose();

        // Tap-fed Studio reports waterFeed = 1 in arg 3 of 4506.
        const tapIdentity = {deviceId: "studio-5af231", serial: "J15A02A45H038"};
        const tap = await studioSetup(j15H038Captured);
        tap.radio.syntheticWrite = (frame) => {
            const code = frame[3] | (frame[4] << 8);
            if (code === 8007) tap.radio.emit(event(8007));
            if (code === 4506) tap.radio.emit(event(4506));
            if (code === 4507) tap.radio.emit(event(4507));
            if (code === 8013) tap.radio.emit(event(8013));
        };
        await tap.controls.open(tapIdentity, "pour");
        await tap.controls.startPour({
            mode: "target", temperatureC: 62, pattern: "centered", volumeMl: 60, flowMlPerSecond: 3
        });
        expect(tap.radio.written.map((f) => Array.from(f))).toContainEqual(
            Array.from(buildType1(4506, [flow30Bits, vol600Bits, temp620Bits, 1, 0]))
        );
        await tap.controls.stop();
        await tap.controls.close();
        tap.controls.dispose();
    });

    it("never leaks tuning readings across machine switches or disconnect/reconnect", async () => {
        const s = await studioSetup(j15H038Captured);
        const h038Identity = {deviceId: "studio-5af231", serial: "J15A02A45H038"};
        const captured11508 = hexBytes("580207f42c10000000c214050000063e");
        s.radio.syntheticWrite = (frame) => {
            const code = frame[3] | (frame[4] << 8);
            if (code === 11508) s.radio.emit(captured11508);
        };
        await s.controls.readSettings(h038Identity, "vibrationAmplitude");
        expect(s.controls.getSnapshot().settings).toMatchObject({
            pourRadius: 700,
            vibrationAmplitude: 1300
        });

        s.radio.drop();
        s.radio.infoReply = j15F231Frame;
        await s.machine.connect(studioIdentity.deviceId);
        s.radio.emit(status(MACHINE_STATE.IDLE));
        await s.controls.readSettings(studioIdentity, "temperatureUnit");
        expect(s.controls.getSnapshot().settings).toMatchObject({
            temperatureUnit: "C",
            waterSource: "tank",
            pourRadius: null,
            vibrationAmplitude: null
        });
        expect(s.controls.describeSettings(studioIdentity, "pourRadius").reading).toBe("unavailable");
        expect(s.controls.describeSettings(studioIdentity, "vibrationAmplitude").reading).toBe("unavailable");
        s.controls.dispose();
    });

    it("requires status proof for moving or cold-start recovery inspect while closing nonmoving sessions on 40521 info", async () => {
        const protocol = new StudioControlProtocol();
        const tokens = {session: 1, transaction: 1};

        // Cold-start recovery (activeTool === null): info frame must not clear a moving marker
        protocol.plan({kind: "inspect", tool: "grind", recovery: true}, tokens);
        expect(protocol.decode(Uint8Array.from(j15F231Frame))).toBeNull();
        expect(protocol.decode(Uint8Array.from(status(MACHINE_STATE.IDLE)))).toEqual({
            ...tokens,
            value: {kind: "terminal"}
        });

        // Planned moving operation (movingStarted === true, even before start ACK): info frame must be ignored
        protocol.plan({kind: "enter", tool: "grind"}, tokens);
        expect(protocol.decode(Uint8Array.from(event(8006)))).toEqual({...tokens, value: {kind: "ready"}});
        protocol.plan({kind: "grind", request: {grindSize: 60, rpm: 80}}, {session: 1, transaction: 2});
        protocol.plan({kind: "inspect", tool: "grind", recovery: true}, {session: 1, transaction: 3});
        expect(protocol.decode(Uint8Array.from(j15F231Frame))).toBeNull();
        expect(protocol.decode(Uint8Array.from(status(MACHINE_STATE.IDLE)))).toEqual({
            session: 1,
            transaction: 3,
            value: {kind: "terminal"}
        });

        // Nonmoving active tool session (enter uncertainty, movingStarted === false): info closes cleanly
        protocol.plan({kind: "enter", tool: "grind"}, {session: 2, transaction: 1});
        protocol.plan({kind: "inspect", tool: "grind", recovery: true}, {session: 2, transaction: 2});
        expect(protocol.decode(Uint8Array.from(j15F231Frame))).toEqual({
            session: 2,
            transaction: 2,
            value: {kind: "closed"}
        });
    });

    it("keeps Studio Pour DISPENSED unavailable while 0x4B only streams 0, and surfaces non-zero 0x4B readings", async () => {
        const s = await studioSetup();
        s.radio.syntheticWrite = (frame) => {
            const code = frame[3] | (frame[4] << 8);
            if (code === 8007 || code === 4506 || code === 4507 || code === 8013) {
                s.radio.emit(event(code));
            }
        };
        await s.controls.open(studioIdentity, "pour");
        await s.controls.startPour({
            mode: "target", temperatureC: 90, pattern: "spiral", volumeMl: 60, flowMlPerSecond: 3
        });
        s.radio.emit(float32WeightFrame(0x4B, 0));
        s.radio.emit(float32WeightFrame(0x4B, 0));
        expect(s.controls.getSnapshot().dispensedMl).toBeNull();
        s.radio.emit(float32WeightFrame(0x4B, 12500));
        expect(s.controls.getSnapshot().dispensedMl).toBe(12.5);
        await s.controls.stop();
        await s.controls.close();
        s.controls.dispose();
    });

    it("keeps running Studio Pour/Grind active across status 0x02/0x03 and clears recovery on unsolicited terminal events or home status", async () => {
        const s = await studioSetup();
        s.radio.syntheticWrite = (frame) => {
            const code = frame[3] | (frame[4] << 8);
            if (code === 8006 || code === 3500 || code === 8012 || code === 8007 || code === 4506 || code === 8013) {
                s.radio.emit(event(code));
            }
        };
        await s.controls.open(studioIdentity, "pour");
        await s.controls.startPour({
            mode: "target", temperatureC: 90, pattern: "spiral", volumeMl: 60, flowMlPerSecond: 3
        });
        expect(s.controls.getSnapshot().phase).toBe("running");
        expect(s.recovery.snapshot.marker).not.toBeNull();

        // Active/delayed 0x03 status must never terminate running Pour or clear recovery.
        s.radio.emit(status(MACHINE_STATE.DISPENSING));
        await Promise.resolve();
        await Promise.resolve();
        expect(s.controls.getSnapshot().phase).toBe("running");
        expect(s.recovery.snapshot.marker).not.toBeNull();

        s.radio.emit(event(4507));
        await Promise.resolve();
        await Promise.resolve();
        expect(s.controls.getSnapshot().phase).toBe("ready");
        expect(s.recovery.snapshot.marker).toBeNull();

        await s.controls.startPour({
            mode: "target", temperatureC: 90, pattern: "spiral", volumeMl: 60, flowMlPerSecond: 3
        });
        expect(s.controls.getSnapshot().phase).toBe("running");
        expect(s.recovery.snapshot.marker).not.toBeNull();

        s.radio.emit(status(0x41));
        await Promise.resolve();
        await Promise.resolve();
        expect(s.controls.getSnapshot().phase).toBe("ready");
        expect(s.recovery.snapshot.marker).toBeNull();
        await s.controls.close();

        await s.controls.open(studioIdentity, "grind");
        await s.controls.startGrind({grindSize: 60, rpm: 80});
        s.radio.emit(status(0x02));
        await Promise.resolve();
        await Promise.resolve();
        expect(s.controls.getSnapshot().phase).toBe("running");
        expect(s.recovery.snapshot.marker).not.toBeNull();

        s.radio.emit(event(3505));
        await Promise.resolve();
        await Promise.resolve();
        expect(s.controls.getSnapshot().phase).toBe("ready");
        expect(s.recovery.snapshot.marker).toBeNull();
        await s.controls.close();
        s.controls.dispose();
    });

    it("does not drop natural Pour completion or emit stale 4507 when stop() waits across FRAME_GAP_MS pacing", async () => {
        jest.useFakeTimers();
        try {
            const radio = new Radio();
            radio.infoReply = j15F231Frame;
            let raw = "";
            const recovery = new ControlRecoveryStore({read: () => raw, write: (next) => { raw = next; }});
            const machine = new Machine(radio, {frameGapMs: 2000});
            machine.installControlRecovery(recovery);
            await machine.connect(studioIdentity.deviceId);
            radio.emit(status(MACHINE_STATE.IDLE));
            const controls = new MachineControls(machine);
            radio.syntheticWrite = (frame) => {
                const code = frame[3] | (frame[4] << 8);
                if (code === 8007 || code === 4506 || code === 4507 || code === 8013) {
                    radio.emit(event(code));
                }
            };

            await controls.open(studioIdentity, "pour");
            const starting = controls.startPour({
                mode: "target", temperatureC: 90, pattern: "spiral", volumeMl: 60, flowMlPerSecond: 3
            });
            await jest.advanceTimersByTimeAsync(2000);
            await starting;

            // stop() immediately enters the 2000 ms FRAME_GAP_MS sleep before sending 4507.
            radio.written = [];
            const stopping = controls.stop();
            await jest.advanceTimersByTimeAsync(500);
            expect(radio.sent).toEqual([]);

            // Delayed 0x03 must not cancel stop() prematurely, while genuine 9006 settles it without sending 4507.
            radio.emit(status(MACHINE_STATE.DISPENSING));
            await Promise.resolve();
            expect(controls.getSnapshot().phase).toBe("stopping");

            radio.emit(event(9006));
            await stopping;
            expect(controls.getSnapshot().phase).toBe("ready");
            expect(recovery.snapshot.marker).toBeNull();
            expect(radio.sent).toEqual([]);

            const closing = controls.close();
            await jest.advanceTimersByTimeAsync(4000);
            await closing;
            controls.dispose();
            await machine.disconnect();
        } finally {
            jest.useRealTimers();
        }
    });

    it("confirms target Pour completion via 4507 after near-target cup plateau while ignoring jitter, cup removal, and continuous mode", async () => {
        jest.useFakeTimers();
        try {
            const s = await studioSetup();
            s.radio.syntheticWrite = (frame) => {
                const code = frame[3] | (frame[4] << 8);
                if (code === 8007 || code === 4506 || code === 4507 || code === 8013) {
                    s.radio.emit(event(code));
                }
            };
            await s.controls.open(studioIdentity, "pour");
            await s.controls.startPour({
                mode: "target", temperatureC: 90, pattern: "spiral", volumeMl: 30, flowMlPerSecond: 3
            });

            // Small +/-0.2 g jitter around baseline stays unbiased and cup placement jump (+150 g in 150 ms) is ignored.
            s.radio.emit(float32WeightFrame(0x15, 0));
            for (const g of [0.2, -0.2, 0.2, -0.2, 0]) {
                await jest.advanceTimersByTimeAsync(100);
                s.radio.emit(float32WeightFrame(0x15, g));
            }
            await jest.advanceTimersByTimeAsync(150);
            s.radio.emit(float32WeightFrame(0x15, 150));

            for (const g of [155, 160, 165, 170, 175, 178.4]) {
                await jest.advanceTimersByTimeAsync(1000);
                s.radio.emit(float32WeightFrame(0x15, g));
            }
            // Removing the cup near target cancels the plateau timer and keeps it off across empty-pan noise.
            await jest.advanceTimersByTimeAsync(500);
            s.radio.emit(float32WeightFrame(0x15, 0));
            await jest.advanceTimersByTimeAsync(100);
            s.radio.emit(float32WeightFrame(0x15, 0.2));
            await jest.advanceTimersByTimeAsync(3000);
            expect(s.radio.sent).not.toContain(4507);

            // Placing the cup back resumes plateau detection.
            await jest.advanceTimersByTimeAsync(200);
            s.radio.emit(float32WeightFrame(0x15, 178.4));
            // Small plateau noise stays inside +0.35 g peak tolerance without sending 4507 early.
            await jest.advanceTimersByTimeAsync(500);
            s.radio.emit(float32WeightFrame(0x15, 178.2));
            await jest.advanceTimersByTimeAsync(500);
            s.radio.emit(float32WeightFrame(0x15, 178.6));
            await jest.advanceTimersByTimeAsync(1300);
            expect(s.radio.sent).not.toContain(4507);

            await jest.advanceTimersByTimeAsync(300);
            expect(s.radio.sent).toContain(4507);
            expect(s.controls.getSnapshot().phase).toBe("ready");
            expect(s.recovery.snapshot.marker).toBeNull();

            // Continuous mode never auto-stops from cup weight plateau.
            s.radio.written = [];
            await s.controls.startPour({
                mode: "continuous", temperatureC: 90, pattern: "spiral", flowMlPerSecond: 3
            });
            for (const g of [184, 192, 200, 210, 215]) {
                await jest.advanceTimersByTimeAsync(1000);
                s.radio.emit(float32WeightFrame(0x15, g));
            }
            await jest.advanceTimersByTimeAsync(3500);
            expect(s.radio.sent).not.toContain(4507);

            s.radio.emit(event(4507));
            await Promise.resolve();
            await Promise.resolve();
            await s.controls.close();
            s.controls.dispose();
        } finally {
            jest.useRealTimers();
        }
    });

    it("recovers nonmoving open() failure via 40521 info even when enter aborted during FRAME_GAP_MS before dispatch", async () => {
        jest.useFakeTimers();
        try {
            const radio = new Radio();
            radio.infoReply = j15F231Frame;
            let raw = "";
            const recovery = new ControlRecoveryStore({read: () => raw, write: (next) => { raw = next; }});
            const machine = new Machine(radio, {frameGapMs: 2000});
            machine.installControlRecovery(recovery);
            await machine.connect(studioIdentity.deviceId);
            radio.emit(status(0x05));
            const controls = new MachineControls(machine);

            // Force ensureFreshControlState() to write 8022 right before attach so open()'s enter sleeps FRAME_GAP_MS.
            radio.homeReply = status(0x41);
            const opening = controls.open(studioIdentity, "grind").catch(() => {});
            await jest.advanceTimersByTimeAsync(100);
            expect(controls.getSnapshot().phase).toBe("entering");

            // Drop link while 8006 is still waiting in FRAME_GAP_MS before dispatch.
            radio.drop();
            await opening;
            expect(controls.getSnapshot().phase).toBe("unknown");
            expect(recovery.snapshot.marker).toBeNull();

            // Reconnect cleanly and reconcile with info-only 8100 reply (no 0x57 status frame).
            await machine.connect(studioIdentity.deviceId);
            radio.emit(status(MACHINE_STATE.IDLE));
            const recovering = controls.recover();
            await jest.advanceTimersByTimeAsync(2000);
            await recovering;
            expect(controls.getSnapshot().phase).toBe("closed");

            controls.dispose();
            await machine.disconnect();
        } finally {
            jest.useRealTimers();
        }
    });

    it("keeps Studio setting pending armed across early 40521 info frames emitted before 8100 refreshInfo dispatches", async () => {
        jest.useFakeTimers();
        try {
            const radio = new Radio();
            radio.infoReply = j15F231Frame;
            let raw = "";
            const recovery = new ControlRecoveryStore({read: () => raw, write: (next) => { raw = next; }});
            const machine = new Machine(radio, {frameGapMs: 2000});
            machine.installControlRecovery(recovery);
            await machine.connect(studioIdentity.deviceId);
            radio.emit(status(MACHINE_STATE.IDLE));
            const controls = new MachineControls(machine);

            const tapInfo = machineInfoFrame({
                serial: studioIdentity.serial, model: "", firmware: "V12.0D.500", waterFeed: 1
            });
            let saw4508 = false;
            radio.syntheticWrite = (frame) => {
                const code = frame[3] | (frame[4] << 8);
                if (code === 4508) {
                    saw4508 = true;
                } else if (code === 8100 && saw4508) {
                    radio.infoReply = tapInfo;
                }
            };

            const applying = controls.applySetting(studioIdentity, "waterSource", "tap");
            // First 8100 (inspect) runs immediately -> 4508 runs after 2000 ms.
            await jest.advanceTimersByTimeAsync(2000);
            expect(saw4508).toBe(true);
            // Emit an early stale 40521 frame while 8100 refreshInfo is still sleeping in FRAME_GAP_MS.
            await jest.advanceTimersByTimeAsync(100);
            radio.emit(j15F231Frame);
            await Promise.resolve();
            // Advance remaining gap so refreshInfo sends 8100 and receives tapInfo.
            await jest.advanceTimersByTimeAsync(2000);
            await applying;
            expect(controls.getSnapshot().phase).toBe("closed");
            expect(controls.getSnapshot().settings?.waterSource).toBe("tap");

            controls.dispose();
            await machine.disconnect();
        } finally {
            jest.useRealTimers();
        }
    });

    it("maps 0x0C NO_WATER and 0x0F NO_BEANS during Studio tool entry to explicit refusals, encodes fractional flow, and resets waterFeed on null info", async () => {
        const protocol = new StudioControlProtocol();
        const tokens = {session: 1, transaction: 1};
        protocol.plan({kind: "enter", tool: "pour"}, tokens);
        expect(protocol.decode(Uint8Array.from(status(MACHINE_STATE.NO_WATER)))).toEqual({
            session: 1,
            transaction: 1,
            value: {
                kind: "refused",
                reason: expect.stringMatching(/\+WATER.*Refill the water tank/i)
            }
        });
        protocol.plan({kind: "enter", tool: "grind"}, tokens);
        expect(protocol.decode(Uint8Array.from(status(MACHINE_STATE.NO_BEANS)))).toEqual({
            session: 1,
            transaction: 1,
            value: {
                kind: "refused",
                reason: expect.stringMatching(/waiting for beans.*Fill the hopper/i)
            }
        });

        const s = await studioSetup(j15H038Captured);
        expect(protocol.actualWaterSource(s.machine.info)).toBe("tap");
        expect(protocol.actualWaterSource(null)).toBeNull();
        const floatBits = (value: number): number => {
            const buf = new ArrayBuffer(4);
            new DataView(buf).setFloat32(0, value, true);
            return new DataView(buf).getInt32(0, true);
        };
        const ex = protocol.prepare({
            kind: "pour",
            request: {mode: "target", temperatureC: 62, pattern: "circular", volumeMl: 30, flowMlPerSecond: 1.5}
        }, tokens);
        expect(Array.from(ex.frame!)).toEqual(
            Array.from(buildType1(4506, [floatBits(15.0), floatBits(300.0), floatBits(620.0), 0, 1]))
        );
        s.controls.dispose();
    });

    it("exits an open idle Studio tool (0x02 grind, 0x04/0x05 scale, or control-originated 0x03 pour) before switching, while refusing non-control 0x03", async () => {
        const protocol = new StudioControlProtocol();
        expect(protocol.idleToolForState(0x02, false)).toBe("grind");
        expect(protocol.idleToolForState(0x04, false)).toBe("scale");
        expect(protocol.idleToolForState(0x05, false)).toBe("scale");
        expect(protocol.idleToolForState(MACHINE_STATE.DISPENSING, true)).toBe("pour");
        expect(protocol.idleToolForState(MACHINE_STATE.DISPENSING, false)).toBeNull();
        expect(protocol.idleToolForState(0x41, false)).toBeNull();

        const s = await studioSetup(j15F231Frame, 20);
        let activeScreen: number = MACHINE_STATE.IDLE;
        s.radio.syntheticWrite = (frame) => {
            const code = frame[3] | (frame[4] << 8);
            if (code === 8022) {
                s.radio.emit(status(activeScreen));
            } else if (code === 8003) {
                activeScreen = 0x05;
                s.radio.emit(event(8003));
            } else if (code === 8006) {
                activeScreen = 0x02;
                s.radio.emit(event(8006));
            } else if (code === 8007) {
                activeScreen = MACHINE_STATE.DISPENSING;
                s.radio.emit(event(8007));
            } else if (code === 8012 || code === 8013 || code === 8014) {
                activeScreen = MACHINE_STATE.COMPLETE;
                s.radio.emit(event(code));
                s.radio.emit(status(MACHINE_STATE.COMPLETE));
            }
        };

        // 1. Machine already sitting in Scale (0x05): open("grind") probes 8022, sends 8014 exit, then 8006 enter.
        activeScreen = 0x05;
        s.radio.emit(status(0x05));
        await s.controls.open(studioIdentity, "grind");
        expect(s.radio.sent).toEqual([8022, 8014, 8006]);
        expect(s.controls.getSnapshot()).toMatchObject({phase: "ready", tool: "grind"});

        // 2. If Grind (0x02) stays on 0x02 after close(), switching to Pour still sends 8012 -> 8007.
        await s.controls.closeInBackground();
        activeScreen = 0x02;
        s.radio.emit(status(0x02));
        s.radio.written = [];
        await s.controls.open(studioIdentity, "pour");
        expect(s.radio.sent).toEqual([8022, 8012, 8007]);
        expect(s.controls.getSnapshot()).toMatchObject({phase: "ready", tool: "pour"});

        // 3. Switch away from Pour (8013 ack resolves close(), then delayed status 0x03 arrives while controlSession is null):
        // recentControlPurpose tracks that 0x03 came from our Pour session, so open("scale") sends 8013 before 8003.
        s.radio.syntheticWrite = (frame) => {
            const code = frame[3] | (frame[4] << 8);
            if (code === 8022) s.radio.emit(status(activeScreen));
            else if (code === 8013) {
                activeScreen = MACHINE_STATE.COMPLETE;
                s.radio.emit(event(8013));
            } else if (code === 8003) {
                activeScreen = 0x05;
                s.radio.emit(event(8003));
            } else if (code === 8014) {
                activeScreen = MACHINE_STATE.COMPLETE;
                s.radio.emit(event(8014));
                s.radio.emit(status(MACHINE_STATE.COMPLETE));
            }
        };
        await s.controls.closeInBackground();
        activeScreen = MACHINE_STATE.DISPENSING;
        s.radio.emit(status(MACHINE_STATE.DISPENSING));
        expect(s.machine.controlStateConfirmed).toBe(true);
        s.radio.syntheticWrite = (frame) => {
            const code = frame[3] | (frame[4] << 8);
            if (code === 8022) s.radio.emit(status(activeScreen));
            else if (code === 8013) {
                activeScreen = MACHINE_STATE.COMPLETE;
                s.radio.emit(event(8013));
                s.radio.emit(status(MACHINE_STATE.COMPLETE));
            } else if (code === 8003) {
                activeScreen = 0x05;
                s.radio.emit(event(8003));
            } else if (code === 8014) {
                activeScreen = MACHINE_STATE.COMPLETE;
                s.radio.emit(event(8014));
                s.radio.emit(status(MACHINE_STATE.COMPLETE));
            }
        };
        s.radio.written = [];
        await s.controls.open(studioIdentity, "scale");
        expect(s.radio.sent).toEqual([8022, 8013, 8003]);
        expect(s.controls.getSnapshot()).toMatchObject({phase: "ready", tool: "scale"});
        await s.controls.close();

        // 4. Non-control 0x03 (after Home reset) must NEVER send 8013 exit.
        s.radio.emit(status(MACHINE_STATE.IDLE));
        expect(s.machine.controlStateConfirmed).toBe(false);
        s.radio.written = [];
        s.radio.emit(status(MACHINE_STATE.DISPENSING));
        await expect(s.controls.open(studioIdentity, "grind")).rejects.toThrow(/fresh known normal/i);
        expect(s.radio.sent).toEqual([]);

        s.controls.dispose();
    });

    it("fails enter fast on WARNING (0x51) with +WATER when low tank or MACHINE WARNING otherwise", async () => {
        const s = await studioSetup(j15F231Frame, 20);
        const lowTank = machineInfoFrame({serial: studioIdentity.serial, model: "Studio", firmware: "V12.0D.500", waterEnough: 0});
        const okTank = machineInfoFrame({serial: studioIdentity.serial, model: "Studio", firmware: "V12.0D.500", waterEnough: 1});
        s.radio.emit(lowTank);
        s.radio.syntheticWrite = (frame) => {
            const code = frame[3] | (frame[4] << 8);
            if (code === 8003 || code === 8006) s.radio.emit(status(MACHINE_STATE.WARNING));
        };
        await expect(s.controls.open(studioIdentity, "scale")).rejects.toThrow(/\+WATER.*Refill the water tank/i);
        s.controls.dispose();

        // With water OK, WARNING status during enter refuses fast with MACHINE WARNING guidance.
        const second = await studioSetup(j15F231Frame, 20);
        second.radio.emit(okTank);
        second.radio.emit(status(MACHINE_STATE.IDLE));
        second.radio.syntheticWrite = (frame) => {
            const code = frame[3] | (frame[4] << 8);
            if (code === 8006) second.radio.emit(status(MACHINE_STATE.WARNING));
        };
        await expect(second.controls.open(studioIdentity, "grind")).rejects.toThrow(/showing a warning/i);
        second.controls.dispose();
    });
});
