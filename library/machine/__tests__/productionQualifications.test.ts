import Machine from "@/library/machine/Machine";
import MachineControls from "@/library/machine/MachineControls";
import {ControlRecoveryStore} from "@/library/machine/controlRecovery";
import {MACHINE_STATE, buildType1, buildType2} from "@/library/machine/protocol";
import {FakeTransport} from "@/library/machine/__tests__/FakeTransport";
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

async function studioSetup(infoFrame: number[] = j15F231Frame) {
    const radio = new Radio();
    radio.infoReply = infoFrame;
    let raw = "";
    const recovery = new ControlRecoveryStore({read: () => raw, write: (next) => { raw = next; }});
    const machine = new Machine(radio, {frameGapMs: 0});
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
        const flow30Bits = 0x41F00000; // float32(30.0)
        const captured4510 = hexBytes("5802079e1110000000c10000c8430000");
        const valid4510 = notification(0x9E, 0x11, captured4510.slice(10, 14));
        s.radio.syntheticWrite = (frame) => {
            const code = frame[3] | (frame[4] << 8);
            if (code === 8007) s.radio.emit(event(8007));
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
            mode: "target", temperatureC: 25, pattern: "circular", volumeMl: 60, flowMlPerSecond: 3
        });
        expect(s.radio.written.map((f) => Array.from(f))).toContainEqual(
            Array.from(buildType1(4506, [250, 1, 60, flow30Bits]))
        );
        await s.controls.setTemperature(40);
        await s.controls.setPattern("spiral");
        expect(s.controls.getSnapshot()).toMatchObject({phase: "running", temperatureC: 40, pattern: "spiral"});
        await s.controls.stop();
        await s.controls.startPour({
            mode: "continuous", temperatureC: 25, pattern: "circular", flowMlPerSecond: 3
        });
        expect(s.radio.written.map((f) => Array.from(f))).toContainEqual(
            Array.from(buildType1(4506, [250, 1, 0, flow30Bits]))
        );
        await s.controls.stop();
        await s.controls.close();
        expect(s.controls.getSnapshot().phase).toBe("closed");
        s.controls.dispose();
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
});
