import BrewRecorder from "@/library/brew/BrewRecorder";
import type {BrewRecord, BrewSample} from "@/library/brew/BrewRecord";
import Machine from "@/library/machine/Machine";
import {frameCommand, MACHINE_STATE} from "@/library/machine/protocol";
import Pour, {AGITATION, POUR_PATTERN} from "@/library/Pour";
import Recipe, {CUP_TYPE} from "@/library/Recipe";

import {FakeTransport, machineInfoFrame} from "@/library/machine/__tests__/FakeTransport";
import {
    teaCaptureSentBytes,
    teaCaptureTimeline,
    teaCaptureUploadPayload
} from "@/library/machine/__tests__/fixtures/teaCapture";
import {status} from "@/library/machine/__tests__/protocolFixtures";

function threeSteepRecipe(): Recipe {
    const recipe = new Recipe();
    recipe.name = "Tea capture";
    recipe.cupType = CUP_TYPE.TEA;
    recipe.dosage = 5;
    recipe.grinder = false;
    recipe.pours = [
        new Pour(1, 90, 92, 35, AGITATION.ALL_OFF, POUR_PATTERN.SPIRAL, 45),
        new Pour(2, 90, 92, 35, AGITATION.ALL_OFF, POUR_PATTERN.CENTERED, 60),
        new Pour(3, 90, 80, 35, AGITATION.ALL_OFF, POUR_PATTERN.CENTERED, 90)
    ];
    recipe.fixRatio();
    return recipe;
}

describe("captured tea lifecycle replay", () => {
    afterEach(() => jest.useRealTimers());

    it("replays all three captured indices and retains the final water sample once", async () => {
        jest.useFakeTimers();
        jest.setSystemTime(Date.parse("2026-10-16T20:24:03.000Z"));
        const transport = new FakeTransport();
        const machine = new Machine(transport, {
            frameGapMs: 0, infoWaitMs: 5, handshakeFreshMs: 60_000, settleCapMs: 120_000
        });
        await machine.connect("AA:BB");
        transport.emit(machineInfoFrame());
        transport.emit(status(MACHINE_STATE.IDLE));

        const records: {record: BrewRecord; samples: BrewSample[]}[] = [];
        const recipe = threeSteepRecipe();
        const recorder = new BrewRecorder({
            machine,
            recipe,
            onRecord: (record, samples) => records.push({record, samples})
        });
        recorder.start();
        await machine.brew(recipe);

        const upload = transport.written.find((frame) => frameCommand(frame) === 4513);
        expect(upload).toBeDefined();
        expect([...upload!.subarray(10, -2)]).toEqual(teaCaptureUploadPayload);
        expect(transport.written.filter((frame, index) =>
            [4513, 4512].includes(frameCommand(frame) ?? -1)
        ).map((frame) => [...frame])).toEqual(teaCaptureSentBytes);

        transport.emit(status(MACHINE_STATE.STARTING));
        for (const entry of teaCaptureTimeline) {
            jest.setSystemTime(entry.at);
            transport.emit(entry.frame);
        }

        expect(records).toHaveLength(1);
        const [{record, samples}] = records;
        expect(record.beverageKind).toBe("tea");
        expect([...new Set(samples.map((sample) => sample.pour))]).toEqual([1, 2, 3]);
        expect(samples.at(-1)).toMatchObject({at: 367122, water: 390.6, pour: 3});
        expect(record.teaCycles).toEqual([
            {
                index: 0, fillStartedAt: -684, fillEndedAt: 25656,
                steepStartedAt: 26158, steepEndedAt: 70785, endingEndedAt: 103757,
                fillMl: 90, releaseWaterMl: 42.9125
            },
            {
                index: 1, fillStartedAt: 103757, fillEndedAt: 129939,
                steepStartedAt: 130443, steepEndedAt: 189769, endingEndedAt: 221275,
                fillMl: 89.7125, releaseWaterMl: 37.775
            },
            {
                index: 2, fillStartedAt: 221275, fillEndedAt: 247635,
                steepStartedAt: 248144, steepEndedAt: 337772, endingEndedAt: 365197,
                fillMl: 89.425, releaseWaterMl: 40.775
            }
        ]);
        expect(record.stalls).toEqual([[], [], []]);
        expect(record.heldSeconds).toBe(0);
        expect(record).not.toHaveProperty("drawdownAt");
        expect(record).not.toHaveProperty("cupAtDrawdown");

        recorder.stop();
        await machine.disconnect();
    });
});
