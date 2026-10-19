import {createTestDatabase} from "@/test-utils/sqlite";
import {buildType2} from "@/library/machine/protocol";
import Recipe, {CUP_TYPE} from "@/library/Recipe";
import {SlotDatabase} from "@/library/slots/SlotDatabase";
import {prepareSet, readSnapshot, snapshotRecipe, type SlotIndex, type SlotSnapshot} from "@/library/slots/slotModel";
import {recoverSlots, cancelSlots, writeSlots, type SlotLease, type SlotPort} from "@/library/slots/slotWriter";
import {
    formatTeaProbeEvidence, nextTeaProbeCandidate, restoreTeaSlotOriginal, teaProbeFlags,
    teaProbeStatus, writeTeaSlotProbe
} from "@/library/slots/teaSlotProbe";
import {
    teaProbeCandidateSet, teaProbeSnapshot, TEA_SLOT_MATRIX_ID, TEA_SLOT_PROBE_ID
} from "@/library/slots/teaSlotCandidate";
import {coffee} from "./fixtures";

const identity = {deviceId: "one", serial: "serial"};
const EXPECTED_BLOB = [8, 60, 70, 0, 0, 0, 32, 120, 30, 0xFE, 120];
const V2_ID = "tea-slot-0x04-one-steep-v1";

type Sql = ReturnType<typeof createTestDatabase>;

function seeded(withWritten: boolean) {
    const sql = createTestDatabase();
    const store = new SlotDatabase(sql);
    const set = ([0, 1, 2] as const).map((i) => snapshotRecipe(coffee(`Coffee ${i}`, 14 + i)));
    set.forEach((snapshot, i) => store.assign("one", i as SlotIndex, snapshot));
    if (withWritten) {
        store.begin("one", {
            id: "old", serial: "serial", slots: [set[0], set[1], set[2]],
            frames: [0, 1, 2].map(() => []) as never, acknowledged: 0, inFlight: null, error: null
        } as never);
    }
    return {sql, store, set};
}

type Script = {failAt?: SlotIndex | "final"; sent: number[][]; busy?: boolean};

function scripted(store: SlotDatabase, script: Script): SlotPort {
    const lease: SlotLease = {
        sendAndConfirm: async (frame, index) => {
            const journal = store.read("one").journal!;
            expect(journal.inFlight).toBe(index);
            expect(Array.from(frame)).toEqual(journal.frames[index]);
            script.sent.push(Array.from(frame));
            if (index === script.failAt) throw new Error("Receipt unknown");
        },
        confirmSaved: async () => {
            if (script.failAt === "final") throw new Error("Completion unconfirmed");
        },
        release: () => undefined
    };
    return {
        available: true,
        acquire: async (received) => {
            expect(received).toEqual(identity);
            if (script.busy) throw new Error("Machine busy");
            return lease;
        }
    };
}

async function written(store: SlotDatabase, sql?: Sql) {
    // Gets a genuine last-written set the normal way.
    const port = scripted(store, {sent: []});
    await writeSlots(store, identity, port, {id: () => "normal", now: () => 1});
    return sql;
}

function frames(blobs: readonly (readonly number[])[]) {
    return blobs.map((blob, i) => Array.from(buildType2(11510, Uint8Array.from([i, 0x02, ...blob]))));
}

describe("the fixed candidate", () => {
    it("is exactly one steep, flags 0x02, encoded by the existing tea encoder", async () => {
        const {store, set} = seeded(false);
        const script: Script = {sent: []};
        await writeTeaSlotProbe(store, identity, scripted(store, script), {id: () => "t1", now: () => 5});
        expect(teaProbeSnapshot().blob).toEqual(EXPECTED_BLOB);
        expect(script.sent).toEqual(frames([EXPECTED_BLOB, set[1].blob, set[2].blob]));
        const record = store.read("one");
        expect(record.written?.slots[0].probe).toBe(TEA_SLOT_PROBE_ID);
        expect(record.written?.slots[1]).toEqual(set[1]);
        expect(record.written?.slots[2]).toEqual(set[2]);
        const recipe = JSON.parse(record.written!.slots[0].recipeJSON);
        expect(recipe.pours).toHaveLength(1);
        expect(recipe).toMatchObject({dosage: 5, grinder: false, bypassEnabled: false, cupType: CUP_TYPE.TEA});
        expect(JSON.parse(recipe.pours[0])).toMatchObject({volume: 60, temperature: 70, pauseTime: 60, agitation: 0});
    });

    it("does not accept invalid tea or a tampered historical probe", () => {
        const tea = new Recipe();
        tea.cupType = CUP_TYPE.TEA;
        expect(() => snapshotRecipe(tea)).toThrow();
        const exact = teaProbeSnapshot();
        expect(readSnapshot(exact)).toEqual(exact);
        const json = JSON.parse(exact.recipeJSON);
        const tampered = (changes: Partial<SlotSnapshot> & Record<string, unknown>) =>
            () => readSnapshot({...exact, ...changes});
        expect(tampered({name: "Other"})).toThrow();
        expect(tampered({sourceUuid: "other"})).toThrow();
        expect(tampered({probe: "other"})).toThrow();
        expect(tampered({scaleEnabled: true})).toThrow(/unapproved/i);
        expect(tampered({scaleEnabled: false})).toThrow(/unapproved/i);
        expect(tampered({blob: [...exact.blob.slice(0, 1), 61, ...exact.blob.slice(2)]})).toThrow();
        expect(tampered({blob: [...exact.blob, 0]})).toThrow();
        expect(tampered({recipeJSON: "{"})).toThrow();
        const pour = JSON.parse(json.pours[0]);
        json.pours[0] = JSON.stringify({...pour, volume: 61});
        expect(tampered({recipeJSON: JSON.stringify(json)})).toThrow();
        json.pours[0] = JSON.stringify(pour);
        json.grinder = true;
        expect(tampered({recipeJSON: JSON.stringify(json)})).toThrow();
        // A different tea with the discriminant, and a probe-shaped coffee, both fail.
        const other = {...exact, recipeJSON: JSON.stringify({...JSON.parse(exact.recipeJSON), ratio: 13})};
        expect(() => readSnapshot(other)).toThrow();
        const {store} = seeded(false);
        expect(() => store.assign("one", 0, exact)).toThrow("not a draft");
    });
});

describe("preserving the original set", () => {
    it("rejects a pending probe journal whose scale differs from the preserved candidate", async () => {
        const {store, sql} = seeded(false);
        await expect(writeTeaSlotProbe(store, identity, scripted(store, {sent: [], failAt: 1})))
            .rejects.toThrow(/unknown/i);
        const corrupt = JSON.parse(JSON.stringify(store.read("one")));
        corrupt.journal.slots[1].scaleEnabled = true;
        corrupt.journal.frames = prepareSet(corrupt.journal.slots);
        sql.runSync("UPDATE easy_mode_slots SET recordJSON = ? WHERE deviceId = ?",
            [JSON.stringify(corrupt), "one"]);
        expect(() => new SlotDatabase(sql).read("one")).toThrow(/preserved set/i);
    });

    it("preserves independent written and draft scale choices through a probe and restoration", async () => {
        const {store, sql} = seeded(false);
        store.setScaleEnabled("one", 0, true);
        store.setScaleEnabled("one", 1, true);
        await written(store);
        const original = store.read("one").written!;
        store.setScaleEnabled("one", 1, false);
        store.setScaleEnabled("one", 2, true);
        const drafts = store.read("one").drafts;
        const script: Script = {sent: []};
        await writeTeaSlotProbe(store, identity, scripted(store, script), {id: () => "scale-probe"});
        expect(script.sent.map(frame => frame[11])).toEqual([0x02, 0x12, 0x02]);
        expect(store.read("one").written?.slots[0]).not.toHaveProperty("scaleEnabled");
        const reopened = new SlotDatabase(sql);
        await restoreTeaSlotOriginal(reopened, identity, scripted(reopened, script), {id: () => "scale-restore"});
        expect(script.sent.slice(3)).toEqual(prepareSet(original.slots));
        const restored = new SlotDatabase(sql).read("one");
        expect(restored.written?.slots).toEqual(original.slots);
        expect(restored.drafts).toEqual(drafts);
    });

    it("records the last-written set and distinct drafts before the first send", async () => {
        const {store} = seeded(false);
        await written(store);
        const lastWritten = store.read("one").written!.slots;
        store.assign("one", 0, snapshotRecipe(coffee("Newer draft", 13)));
        const draftsBefore = store.read("one").drafts;
        const script: Script = {sent: []};
        const port = scripted(store, script);
        const acquire = port.acquire;
        port.acquire = async (who, options) => {
            const lease = await acquire(who, options);
            const send = lease.sendAndConfirm;
            lease.sendAndConfirm = async (frame, index) => {
                const {experiment, journal} = store.read("one");
                expect(experiment?.original.source).toBe("written");
                expect(experiment?.original.slots).toEqual(lastWritten);
                expect(experiment?.originalDrafts).toEqual(draftsBefore);
                expect(experiment?.serial).toBe("serial");
                expect(experiment?.evidence[0].frames).toEqual(journal?.frames);
                return send(frame, index);
            };
            return lease;
        };
        await writeTeaSlotProbe(store, identity, port, {id: () => "t1"});
        expect(store.read("one").drafts).toEqual(draftsBefore);
        expect(() => store.setScaleEnabled("one", 0, true)).toThrow(/restore/i);
    });

    it("falls back to a complete draft set and refuses an incomplete one before anything", async () => {
        const {store} = seeded(false);
        store.assign("one", 2, null);
        const script: Script = {sent: []};
        await expect(writeTeaSlotProbe(store, identity, scripted(store, script)))
            .rejects.toThrow("complete A/B/C");
        expect(store.read("one").journal).toBeNull();
        expect(store.read("one").experiment).toBeUndefined();
        expect(script.sent).toEqual([]);
        const full = seeded(false);
        await writeTeaSlotProbe(full.store, identity, scripted(full.store, {sent: []}));
        expect(full.store.read("one").experiment?.original).toMatchObject({source: "draft", writtenAt: null});
    });

    it("never captures the probe as the original on a repeat and keeps originals when unresolved", async () => {
        const {store, set} = seeded(false);
        await writeTeaSlotProbe(store, identity, scripted(store, {sent: []}), {id: () => "t1"});
        const script: Script = {sent: []};
        await expect(writeTeaSlotProbe(store, identity, scripted(store, script)))
            .rejects.toThrow("already in progress");
        expect(script.sent).toEqual([]);
        expect(store.read("one").experiment?.original.slots).toEqual(set);
        const failed = seeded(false);
        await expect(writeTeaSlotProbe(failed.store, identity,
            scripted(failed.store, {sent: [], failAt: 1}))).rejects.toThrow("Receipt unknown");
        await expect(writeTeaSlotProbe(failed.store, identity, scripted(failed.store, {sent: []})))
            .rejects.toThrow("Finish the incomplete write");
        expect(failed.store.read("one").experiment?.original.slots).toEqual(failed.set);
    });

    it("blocks normal writes and draft edits while the trial is unrestored", async () => {
        const {store} = seeded(false);
        await writeTeaSlotProbe(store, identity, scripted(store, {sent: []}));
        await expect(writeSlots(store, identity, scripted(store, {sent: []}))).rejects.toThrow("Restore");
        expect(() => store.assign("one", 0, snapshotRecipe(coffee()))).toThrow("Restore");
    });
});

describe("identity and exclusion", () => {
    it("requires a serial and the matching one, and a free machine", async () => {
        const {store} = seeded(false);
        await expect(writeTeaSlotProbe(store, {deviceId: "one", serial: null}, scripted(store, {sent: []})))
            .rejects.toThrow("serial");
        await expect(writeTeaSlotProbe(store, identity, scripted(store, {sent: [], busy: true})))
            .rejects.toThrow("busy");
        expect(store.read("one").experiment).toBeUndefined();
        await writeTeaSlotProbe(store, identity, scripted(store, {sent: []}));
        const other = {deviceId: "one", serial: "different"};
        await expect(restoreTeaSlotOriginal(store, other, scripted(store, {sent: []})))
            .rejects.toThrow("different machine");
        expect(teaProbeStatus(store.read("one"))).toBe("candidate-written");
    });
});

describe("durability", () => {
    it("persists the trial and a pending candidate through relaunch, then recovers it", async () => {
        const {sql, store, set} = seeded(false);
        const first: Script = {sent: [], failAt: 1};
        await expect(writeTeaSlotProbe(store, identity, scripted(store, first), {id: () => "t1"}))
            .rejects.toThrow("Receipt unknown");
        const relaunched = new SlotDatabase(sql);
        const record = relaunched.read("one");
        expect(teaProbeStatus(record)).toBe("pending-candidate");
        expect(record.journal?.slots[0].probe).toBe(TEA_SLOT_PROBE_ID);
        expect(record.experiment?.original.slots).toEqual(set);
        await expect(restoreTeaSlotOriginal(relaunched, identity, scripted(relaunched, {sent: []})))
            .rejects.toThrow("Finish the incomplete write");
        const script: Script = {sent: []};
        await recoverSlots(relaunched, identity, scripted(relaunched, script), {finishUncertain: true});
        expect(teaProbeStatus(relaunched.read("one"))).toBe("candidate-written");
        expect(script.sent).toEqual(frames([EXPECTED_BLOB, set[1].blob, set[2].blob]).slice(1));
    });

    it("rolls back completely when the database fails at preparation", async () => {
        const {sql, store} = seeded(false);
        const failing = {...sql, runSync: () => { throw new Error("disk full"); },
            withTransactionSync: sql.withTransactionSync} as unknown as Sql;
        const broken = new SlotDatabase(failing);
        const script: Script = {sent: []};
        await expect(writeTeaSlotProbe(broken, identity, scripted(broken, script))).rejects.toThrow("disk full");
        expect(script.sent).toEqual([]);
        const reread = new SlotDatabase(sql).read("one");
        expect(reread.experiment).toBeUndefined();
        expect(reread.journal).toBeNull();
        expect(store.read("one").drafts.every((slot) => slot !== null)).toBe(true);
    });

    it("rejects a corrupted persisted trial instead of broadening it", async () => {
        const {sql, store} = seeded(false);
        await writeTeaSlotProbe(store, identity, scripted(store, {sent: []}));
        const row = sql.getFirstSync("SELECT recordJSON FROM easy_mode_slots WHERE deviceId = ?", ["one"]) as
            {recordJSON: string};
        const damage = (edit: (record: any) => void) => {
            const record = JSON.parse(row.recordJSON);
            edit(record);
            sql.runSync("UPDATE easy_mode_slots SET recordJSON = ? WHERE deviceId = ?",
                [JSON.stringify(record), "one"]);
            expect(() => new SlotDatabase(sql).read("one")).toThrow();
        };
        damage((record) => { record.experiment.candidate[0].blob[1] = 61; });
        damage((record) => { record.experiment.original.slots[1] = record.experiment.original.slots[2]; });
        damage((record) => { record.experiment.deviceId = "other"; });
        damage((record) => { record.experiment.serial = ""; });
        damage((record) => { record.experiment.evidence[0].kind = "invented"; });
        damage((record) => { record.experiment.phase = "restored"; });
        damage((record) => { record.written.slots[0].name = "Tea"; });
        damage((record) => { delete record.experiment; });
        damage((record) => { record.drafts[0] = record.written.slots[0]; });
    });
});

describe("evidence and observation", () => {
    it("records frames and each journal mutation without claiming the physical result", async () => {
        const {store} = seeded(false);
        await writeTeaSlotProbe(store, identity, scripted(store, {sent: []}), {
            id: () => "t1", now: () => 9, machine: {model: "Studio", firmware: "V12"}
        });
        const experiment = store.read("one").experiment!;
        expect(experiment.trialId).toBe("t1");
        expect(experiment.candidateId).toBe(TEA_SLOT_PROBE_ID);
        expect(experiment.machine).toEqual({model: "Studio", firmware: "V12"});
        expect(experiment.evidence.map((entry) => entry.kind)).toEqual([
            "prepared", "dispatch", "receipt", "dispatch", "receipt", "dispatch", "receipt", "final"
        ]);
        expect(experiment.observation).toBeNull();
        expect(experiment.evidence[0].frames).toEqual(frames([EXPECTED_BLOB,
            experiment.original.slots[1].blob, experiment.original.slots[2].blob]));
        store.observe("one", {at: 3, display: "TEA 60 ml", heldSeconds: 58, drainedAsTea: true, note: "ok"});
        const read = new SlotDatabase((store as any).sql).read("one").experiment!;
        expect(read.observation?.heldSeconds).toBe(58);
        expect(read.evidence).toEqual(experiment.evidence);
        expect(() => store.observe("one", {at: 1, display: "", heldSeconds: -1, drainedAsTea: null, note: ""}))
            .toThrow();
        expect(formatTeaProbeEvidence(read)).toContain("\"candidateId\": \"tea-slot-0x02-one-steep-v1\"");
    });

    it("records an error and a refusal in the same commit as the journal", async () => {
        const {store} = seeded(false);
        await expect(writeTeaSlotProbe(store, identity, scripted(store, {sent: [], failAt: 0})))
            .rejects.toThrow();
        const kinds = store.read("one").experiment!.evidence.map((entry) => entry.kind);
        expect(kinds).toEqual(["prepared", "dispatch", "error"]);
    });
});

describe("restoration", () => {
    it("writes the preserved set through the writer and restores drafts only after final", async () => {
        const {store, set} = seeded(false);
        await written(store);
        const draft = snapshotRecipe(coffee("Draft", 13));
        store.assign("one", 1, draft);
        const drafts = store.read("one").drafts;
        const original = store.read("one").written!.slots;
        await writeTeaSlotProbe(store, identity, scripted(store, {sent: []}), {id: () => "t1"});

        const failing: Script = {sent: [], failAt: "final"};
        await expect(restoreTeaSlotOriginal(store, identity, scripted(store, failing), {id: () => "r1"}))
            .rejects.toThrow("Completion unconfirmed");
        expect(teaProbeStatus(store.read("one"))).toBe("pending-restore");
        expect(store.read("one").experiment?.original.slots).toEqual(original);
        expect(store.read("one").written?.slots[0].probe).toBe(TEA_SLOT_PROBE_ID);
        await expect(restoreTeaSlotOriginal(store, identity, scripted(store, {sent: []})))
            .rejects.toThrow("Finish the incomplete write");

        // Recovery completes the same restore journal; drafts come back in that commit.
        await recoverSlots(store, identity, scripted(store, {sent: []}), {finishUncertain: true, now: () => 77});
        const after = store.read("one");
        expect(teaProbeStatus(after)).toBe("restored");
        expect(after.written).toEqual({at: 77, slots: original});
        expect(after.drafts).toEqual(drafts);
        expect(after.experiment?.evidence.at(-1)?.kind).toBe("restored");
        expect(after.experiment?.original.slots).toEqual(original);
        expect(set).toHaveLength(3);
        store.assign("one", 0, snapshotRecipe(coffee("Free again")));
    });

    it("sends exactly the original frames and keeps evidence after restoring", async () => {
        const {sql, store, set} = seeded(false);
        await writeTeaSlotProbe(store, identity, scripted(store, {sent: []}));
        const script: Script = {sent: []};
        await restoreTeaSlotOriginal(store, identity, scripted(store, script));
        expect(script.sent).toEqual(frames(set.map((slot) => slot.blob)));
        const record = store.read("one");
        expect(record.experiment?.phase).toBe("restored");
        expect(record.experiment?.evidence.some((entry) => entry.kind === "final")).toBe(true);
        await expect(restoreTeaSlotOriginal(store, identity, scripted(store, {sent: []})))
            .rejects.toThrow("no tea slot probe");
        const archived = record.experiment!;
        const next: Script = {sent: []};
        await writeTeaSlotProbe(store, identity, scripted(store, next), {id: () => "t2"});
        expect(store.read("one").experiment?.candidateId).toBe(V2_ID);
        expect(new SlotDatabase(sql).read("one").experimentHistory).toEqual([archived]);
        const slots = teaProbeCandidateSet([set[0], set[1], set[2]]);
        expect(() => store.beginProbe("one", {
            id: "t2", serial: "serial", slots, frames: prepareSet(slots),
            acknowledged: 0, inFlight: null, error: null
        }, "t2", {}, 5)).toThrow(/already in progress/i);
    });

    describe("the approved second candidate", () => {
        async function restoredV1() {
            const seededSet = seeded(false);
            const {store} = seededSet;
            await written(store);
            store.assign("one", 0, snapshotRecipe(coffee("Distinct draft", 13)));
            await writeTeaSlotProbe(store, identity, scripted(store, {sent: []}), {
                id: () => "t1", machine: {firmware: "V12.0D.500"}
            });
            store.observe("one", {
                at: 10, display: "Water", heldSeconds: 60, drainedAsTea: false,
                note: "No steep counter or tea drain"
            });
            await restoreTeaSlotOriginal(store, identity, scripted(store, {sent: []}), {id: () => "r1"});
            return seededSet;
        }

        it("selects only the restore-first v1 to v2 sequence", async () => {
            const {store} = seeded(false);
            expect(nextTeaProbeCandidate(store.read("one"))).toBe(TEA_SLOT_PROBE_ID);
            await writeTeaSlotProbe(store, identity, scripted(store, {sent: []}), {id: () => "t1"});
            expect(nextTeaProbeCandidate(store.read("one"))).toBeNull();
            await restoreTeaSlotOriginal(store, identity, scripted(store, {sent: []}), {id: () => "r1"});
            expect(nextTeaProbeCandidate(store.read("one"))).toBe(V2_ID);
            expect(teaProbeFlags(TEA_SLOT_PROBE_ID)).toBe(0x02);
            expect(teaProbeFlags(V2_ID)).toBe(0x04);
            expect(() => teaProbeFlags("tea-slot-0x08-one-steep-v1")).toThrow();
            await writeTeaSlotProbe(store, identity, scripted(store, {sent: []}), {id: () => "t2"});
            expect(nextTeaProbeCandidate(store.read("one"))).toBeNull();
            await restoreTeaSlotOriginal(store, identity, scripted(store, {sent: []}), {id: () => "r2"});
            expect(nextTeaProbeCandidate(store.read("one"))).toBe(TEA_SLOT_MATRIX_ID);
            await writeTeaSlotProbe(store, identity, scripted(store, {sent: []}), {id: () => "t3"});
            expect(nextTeaProbeCandidate(store.read("one"))).toBeNull();
            await restoreTeaSlotOriginal(store, identity, scripted(store, {sent: []}), {id: () => "r3"});
            expect(nextTeaProbeCandidate(store.read("one"))).toBeNull();
            const script: Script = {sent: []};
            await expect(writeTeaSlotProbe(store, identity, scripted(store, script), {id: () => "t4"}))
                .rejects.toThrow(/restored.*evidence.*available/i);
            expect(script.sent).toEqual([]);
        });

        it("changes only A's flag and CRC, preserving the tea blob and B/C frames", async () => {
            const {sql, store} = await restoredV1();
            const before = store.read("one");
            const archived = before.experiment!;
            const originalFrames = prepareSet(before.written!.slots);
            const script: Script = {sent: []};
            await writeTeaSlotProbe(store, identity, scripted(store, script), {id: () => "t2"});
            const after = new SlotDatabase(sql).read("one");
            expect(after.experiment?.candidateId).toBe(V2_ID);
            expect(after.experiment?.candidate[0].blob).toEqual(EXPECTED_BLOB);
            expect(script.sent[0]).toEqual(Array.from(buildType2(
                11510, Uint8Array.from([0, 0x04, ...EXPECTED_BLOB])
            )));
            expect(script.sent[0][11]).toBe(0x04);
            const v1Frame = archived.evidence[0].frames![0];
            expect(script.sent[0].slice(0, 11)).toEqual(v1Frame.slice(0, 11));
            expect(script.sent[0].slice(12, -2)).toEqual(v1Frame.slice(12, -2));
            expect(script.sent[0].slice(-2)).not.toEqual(v1Frame.slice(-2));
            expect(script.sent.slice(1)).toEqual(originalFrames.slice(1));
            expect(after.experimentHistory).toEqual([archived]);
            expect(after.experiment?.original).toEqual({
                source: "written", writtenAt: before.written!.at, slots: before.written!.slots
            });
            expect(after.experiment?.originalDrafts).toEqual(before.drafts);
            expect(JSON.parse(formatTeaProbeEvidence(after.experiment!, after.experimentHistory)))
                .toMatchObject({archivedTrials: [JSON.parse(formatTeaProbeEvidence(archived))]});
        });

        it("retains the full archived v1 through an interrupted v2 and recovery/restore relaunch", async () => {
            const {sql, store} = await restoredV1();
            const archived = store.read("one").experiment!;
            await expect(writeTeaSlotProbe(store, identity, scripted(store, {sent: [], failAt: 0}),
                {id: () => "t2"})).rejects.toThrow("Receipt unknown");
            const relaunched = new SlotDatabase(sql);
            expect(relaunched.read("one").experimentHistory).toEqual([archived]);
            expect(relaunched.read("one").journal?.frames[0][11]).toBe(0x04);
            expect(teaProbeStatus(relaunched.read("one"))).toBe("pending-candidate");
            expect(nextTeaProbeCandidate(relaunched.read("one"))).toBeNull();
            await recoverSlots(relaunched, identity, scripted(relaunched, {sent: []}), {finishUncertain: true});
            await restoreTeaSlotOriginal(relaunched, identity, scripted(relaunched, {sent: []}), {id: () => "r2"});
            const after = new SlotDatabase(sql).read("one");
            expect(after.experimentHistory).toEqual([archived]);
            expect(after.experiment?.phase).toBe("restored");
            expect(after.drafts).toEqual(archived.originalDrafts);
        });

        it("leaves v1, its originals and evidence untouched on v2 preparation failure", async () => {
            const {sql, store} = await restoredV1();
            const before = store.read("one");
            const failing = {...sql, runSync: () => { throw new Error("disk full"); }};
            const broken = new SlotDatabase(failing);
            const script: Script = {sent: []};
            await expect(writeTeaSlotProbe(broken, identity, scripted(broken, script), {id: () => "t2"}))
                .rejects.toThrow("disk full");
            expect(script.sent).toEqual([]);
            expect(new SlotDatabase(sql).read("one")).toEqual(before);
            expect(broken.read("one")).toEqual(before);
        });

        it("retains archived v1 if dispatch storage fails after v2 preparation committed", async () => {
            const {sql, store} = await restoredV1();
            const before = store.read("one");
            let writes = 0;
            const failing: Sql = {
                ...sql,
                runSync: (source, params) => {
                    if (++writes === 2) throw new Error("dispatch disk full");
                    return sql.runSync(source, params);
                }
            };
            const broken = new SlotDatabase(failing);
            const script: Script = {sent: []};
            await expect(writeTeaSlotProbe(broken, identity, scripted(broken, script), {id: () => "t2"}))
                .rejects.toThrow("dispatch disk full");
            const after = new SlotDatabase(sql).read("one");
            expect(script.sent).toEqual([]);
            expect(after.experimentHistory).toEqual([before.experiment]);
            expect(after.experiment?.original.slots).toEqual(before.written?.slots);
            expect(after.experiment?.originalDrafts).toEqual(before.drafts);
            expect(after.experiment?.evidence.map(entry => entry.kind)).toEqual(["prepared", "error"]);
            expect(after.journal?.error).toBe("dispatch disk full");
        });

        it("rejects a serial switch, missing serial, reused trial and unapproved repeat without sends", async () => {
            const {store} = await restoredV1();
            const before = store.read("one");
            const script: Script = {sent: []};
            for (const serial of [null, "other"]) {
                await expect(writeTeaSlotProbe(store, {...identity, serial}, scripted(store, script)))
                    .rejects.toThrow(/serial|different machine/i);
            }
            await expect(writeTeaSlotProbe(store, identity, scripted(store, script), {id: () => "t1"}))
                .rejects.toThrow(/trial/i);
            const slots = teaProbeCandidateSet(before.written!.slots);
            expect(() => store.beginProbe("one", {
                id: "arbitrary", serial: "serial", slots, frames: prepareSet(slots),
                acknowledged: 0, inFlight: null, error: null
            }, "arbitrary", {}, 10)).toThrow();
            expect(store.read("one")).toBe(before);
            expect(script.sent).toEqual([]);
        });

        it("rejects probe B/C and arbitrary flags or candidate identities", () => {
            const probe = teaProbeSnapshot(V2_ID);
            const regular = snapshotRecipe(coffee());
            expect(readSnapshot(probe)).toEqual(probe);
            expect(() => prepareSet([regular, probe, regular])).toThrow(/slot A/i);
            expect(() => prepareSet([regular, regular, probe])).toThrow(/slot A/i);
            expect(() => readSnapshot({...probe, flags: 0x08})).toThrow();
            expect(() => readSnapshot({...probe, probe: TEA_SLOT_PROBE_ID})).toThrow();
            expect(() => teaProbeSnapshot("tea-slot-0x08-one-steep-v1")).toThrow();
        });

        it("strictly rejects damaged histories and unapproved candidate/trial sequences", async () => {
            const {sql, store} = await restoredV1();
            await writeTeaSlotProbe(store, identity, scripted(store, {sent: []}), {id: () => "t2"});
            const row = sql.getFirstSync("SELECT recordJSON FROM easy_mode_slots WHERE deviceId = ?", ["one"]) as
                {recordJSON: string};
            type MutableRecord = ReturnType<SlotDatabase["read"]>;
            const damage = (edit: (record: MutableRecord) => void) => {
                const record: MutableRecord = JSON.parse(row.recordJSON);
                edit(record);
                sql.runSync("UPDATE easy_mode_slots SET recordJSON = ? WHERE deviceId = ?",
                    [JSON.stringify(record), "one"]);
                expect(() => new SlotDatabase(sql).read("one")).toThrow();
            };
            damage(record => { delete record.experimentHistory; });
            damage(record => { record.experimentHistory = []; });
            damage(record => { record.experimentHistory!.push(record.experimentHistory![0]); });
            damage(record => { record.experimentHistory![0].phase = "active"; });
            damage(record => { record.experimentHistory![0].pending = {journalId: "old", kind: "candidate"}; });
            damage(record => { record.experimentHistory![0].serial = "other"; });
            damage(record => { record.experimentHistory![0].deviceId = "other"; });
            damage(record => { record.experimentHistory![0].candidateId = V2_ID; });
            damage(record => { record.experiment!.trialId = "t1"; });
            damage(record => { record.experimentHistory![0].evidence.at(-1)!.kind = "final"; });
            damage(record => { record.experimentHistory![0].evidence[0].frames![0][11] = 0x04; });
            damage(record => { record.experiment!.candidateId = "unknown"; });
        });

        it("rejects a different probe in last-written A and any last-written probe B/C", async () => {
            const {sql, store} = await restoredV1();
            await writeTeaSlotProbe(store, identity, scripted(store, {sent: []}), {id: () => "t2"});
            const before = store.read("one");
            for (const index of [0, 1, 2] as const) {
                const record: ReturnType<SlotDatabase["read"]> = JSON.parse(JSON.stringify(before));
                record.written!.slots[index] = teaProbeSnapshot();
                sql.runSync("UPDATE easy_mode_slots SET recordJSON = ? WHERE deviceId = ?",
                    [JSON.stringify(record), "one"]);
                expect(() => new SlotDatabase(sql).read("one")).toThrow();
            }
        });

        it("rejects a blank persisted serial instead of permitting a successor", async () => {
            const {sql, store} = await restoredV1();
            const record: ReturnType<SlotDatabase["read"]> = JSON.parse(JSON.stringify(store.read("one")));
            record.experiment!.serial = " ";
            sql.runSync("UPDATE easy_mode_slots SET recordJSON = ? WHERE deviceId = ?",
                [JSON.stringify(record), "one"]);
            expect(() => new SlotDatabase(sql).read("one")).toThrow();
        });
    });

    it("keeps originals and drafts when a cancelled candidate never resolved", async () => {
        const {store, set} = seeded(false);
        await expect(writeTeaSlotProbe(store, identity, scripted(store, {sent: [], failAt: 0}), {id: () => "t1"}))
            .rejects.toThrow();
        await cancelSlots(store, identity, {
            available: true,
            acquire: async () => ({
                restartFromBeginning: true, assertCurrent: () => undefined,
                sendAndConfirm: async () => undefined, confirmSaved: async () => undefined,
                release: () => undefined
            })
        });
        const record = store.read("one");
        expect(record.drafts).toEqual(set);
        expect(record.journal).toBeNull();
        expect(record.experiment?.evidence.at(-1)?.kind).toBe("cancelled");
        expect(teaProbeStatus(record)).toBe("candidate-unconfirmed");
    });

    it.each(["prepared", 0, 1, "final"] as const)(
        "never reports candidate success after cancelling at %s", async (boundary) => {
            const {sql, store, set} = seeded(false);
            if (boundary === "prepared") {
                const slots = teaProbeCandidateSet([set[0], set[1], set[2]]);
                store.beginProbe("one", {
                    id: "t1", serial: "serial", slots, frames: prepareSet(slots),
                    acknowledged: 0, inFlight: null, error: null
                }, "t1", {}, 5);
            } else {
                await expect(writeTeaSlotProbe(store, identity,
                    scripted(store, {sent: [], failAt: boundary}), {id: () => "t1"})).rejects.toThrow();
            }
            const before = store.read("one");
            expect(teaProbeStatus(before)).toBe("pending-candidate");
            await cancelSlots(store, identity, {
                available: true,
                acquire: async () => ({
                    restartFromBeginning: true, sendAndConfirm: async () => {},
                    confirmSaved: async () => {}, release: () => {}
                })
            });
            const record = new SlotDatabase(sql).read("one");
            expect(teaProbeStatus(record)).toBe("candidate-unconfirmed");
            expect(record.experiment?.original.slots).toEqual(set);
            expect(record.experiment?.evidence.slice(0, -1)).toEqual(before.experiment?.evidence);
            expect(record.experiment?.evidence.at(-1)?.kind).toBe("cancelled");
            expect(record.experiment?.evidence.some(entry => entry.kind === "final")).toBe(false);
        }
    );

    it("does not claim candidate storage or restoration after cancelling an unconfirmed restore", async () => {
        const {sql, store} = seeded(false);
        await writeTeaSlotProbe(store, identity, scripted(store, {sent: []}));
        await expect(restoreTeaSlotOriginal(store, identity, scripted(store, {sent: [], failAt: "final"})))
            .rejects.toThrow("Completion unconfirmed");
        expect(teaProbeStatus(store.read("one"))).toBe("pending-restore");
        await cancelSlots(store, identity, {
            available: true,
            acquire: async () => ({
                restartFromBeginning: true, sendAndConfirm: async () => {},
                confirmSaved: async () => {}, release: () => {}
            })
        });
        expect(teaProbeStatus(new SlotDatabase(sql).read("one"))).toBe("candidate-unconfirmed");
        await restoreTeaSlotOriginal(store, identity, scripted(store, {sent: []}));
        expect(teaProbeStatus(new SlotDatabase(sql).read("one"))).toBe("restored");
    });
});

describe("the reference-derived A/B/C matrix", () => {
    // Independent fixture: literal audited bytes and the frames they must produce.
    const SEGMENT = [90, 92, 2, 0, 236, 0, 120, 35];
    const BLOBS = [[8, ...SEGMENT, 254, 150], [8, ...SEGMENT, 254, 150], [8, ...SEGMENT, 50, 150]];
    const FRAMES = [
        [88, 1, 2, 246, 44, 25, 0, 0, 0, 1, 0, 2, 8, 90, 92, 2, 0, 236, 0, 120, 35, 254, 150, 7, 242],
        [88, 1, 2, 246, 44, 25, 0, 0, 0, 1, 1, 4, 8, 90, 92, 2, 0, 236, 0, 120, 35, 254, 150, 103, 240],
        [88, 1, 2, 246, 44, 25, 0, 0, 0, 1, 2, 4, 8, 90, 92, 2, 0, 236, 0, 120, 35, 50, 150, 154, 157]
    ];

    async function restoredV2() {
        const seededSet = seeded(false);
        const {store} = seededSet;
        await written(store);
        store.assign("one", 0, snapshotRecipe(coffee("Distinct draft", 13)));
        await writeTeaSlotProbe(store, identity, scripted(store, {sent: []}), {id: () => "t1"});
        store.observe("one", {at: 10, display: "Water", heldSeconds: 60, drainedAsTea: false, note: "v1 result"});
        await restoreTeaSlotOriginal(store, identity, scripted(store, {sent: []}), {id: () => "r1"});
        await writeTeaSlotProbe(store, identity, scripted(store, {sent: []}), {id: () => "t2"});
        store.observe("one", {at: 20, display: "Water", heldSeconds: 60, drainedAsTea: false, note: "v2 result"});
        await restoreTeaSlotOriginal(store, identity, scripted(store, {sent: []}), {id: () => "r2"});
        return seededSet;
    }

    it("is offered only after the confirmed v2 restoration and sends the three audited frames", async () => {
        const {sql, store} = await restoredV2();
        const before = store.read("one");
        const script: Script = {sent: []};
        await writeTeaSlotProbe(store, identity, scripted(store, script), {id: () => "t3", now: () => 30});
        expect(script.sent).toEqual(FRAMES);
        expect(script.sent.map(frame => frame[11])).toEqual([0x02, 0x04, 0x04]);
        const after = new SlotDatabase(sql).read("one");
        expect(after.experiment?.candidateId).toBe(TEA_SLOT_MATRIX_ID);
        expect(after.experiment?.candidate.map(slot => slot.blob)).toEqual(BLOBS);
        expect(after.experiment?.candidate.map(slot => slot.probe)).toEqual(
            [`${TEA_SLOT_MATRIX_ID}:A`, `${TEA_SLOT_MATRIX_ID}:B`, `${TEA_SLOT_MATRIX_ID}:C`]);
        expect(after.experiment?.candidate.map(slot => slot.name)).toEqual(["TEA REF A", "TEA REF B", "TEA REF C"]);
        expect(after.experiment?.slotObservations).toEqual([null, null, null]);
        expect(after.experiment?.observation).toBeNull();
        expect(after.experiment?.original.slots).toEqual(before.written!.slots);
        expect(after.written?.slots).toEqual(after.experiment?.candidate);
        expect(after.experiment?.evidence[0].frames).toEqual(FRAMES);
        const recipe = JSON.parse(after.experiment!.candidate[0].recipeJSON);
        expect(recipe).toMatchObject({cupType: CUP_TYPE.TEA, dosage: 3, ratio: 15, grinder: false});
        expect(JSON.parse(recipe.pours[0])).toMatchObject({
            volume: 90, temperature: 92, pauseTime: 20, pourPattern: 2, agitation: 0, flowRate: 35
        });
        expect(JSON.parse(after.experiment!.candidate[2].recipeJSON)).toMatchObject({grinder: true, grindSize: 50});
    });

    it("archives both prior trials intact and writes nothing before the matrix is prepared", async () => {
        const {sql, store} = await restoredV2();
        const v2 = store.read("one").experiment!;
        const v1 = store.read("one").experimentHistory![0];
        await writeTeaSlotProbe(store, identity, scripted(store, {sent: []}), {id: () => "t3"});
        const after = new SlotDatabase(sql).read("one");
        expect(after.experimentHistory).toEqual([v1, v2]);
        const copy = JSON.parse(formatTeaProbeEvidence(after.experiment!, after.experimentHistory));
        expect(copy.slotObservations).toEqual([null, null, null]);
        expect(copy.evidence[0].frames).toEqual(FRAMES);
        expect(copy.archivedTrials.map((trial: {candidateId: string}) => trial.candidateId))
            .toEqual([TEA_SLOT_PROBE_ID, V2_ID]);
        expect(copy.archivedTrials[1].observation.note).toBe("v2 result");
    });

    it("survives relaunch with a pending matrix, recovers it and restores the originals", async () => {
        const {sql, store} = await restoredV2();
        const v1 = store.read("one").experimentHistory![0];
        const v2 = store.read("one").experiment!;
        const originals = store.read("one").experiment!.original.slots;
        await expect(writeTeaSlotProbe(store, identity, scripted(store, {sent: [], failAt: 1}),
            {id: () => "t3"})).rejects.toThrow("Receipt unknown");
        const relaunched = new SlotDatabase(sql);
        expect(teaProbeStatus(relaunched.read("one"))).toBe("pending-candidate");
        expect(relaunched.read("one").journal?.frames).toEqual(FRAMES);
        expect(relaunched.read("one").experimentHistory).toEqual([v1, v2]);
        expect(nextTeaProbeCandidate(relaunched.read("one"))).toBeNull();
        await recoverSlots(relaunched, identity, scripted(relaunched, {sent: []}), {finishUncertain: true});
        const sent: number[][] = [];
        await restoreTeaSlotOriginal(relaunched, identity, scripted(relaunched, {sent}), {id: () => "r3"});
        expect(sent).toEqual(prepareSet(originals));
        const after = new SlotDatabase(sql).read("one");
        expect(after.experiment?.phase).toBe("restored");
        expect(after.written?.slots).toEqual(originals);
        expect(after.experimentHistory).toEqual([v1, v2]);
    });

    it("rolls back completely when preparation fails and leaves both trials untouched", async () => {
        const {sql, store} = await restoredV2();
        const before = store.read("one");
        const failing = {...sql, runSync: () => { throw new Error("disk full"); }};
        const broken = new SlotDatabase(failing);
        const script: Script = {sent: []};
        await expect(writeTeaSlotProbe(broken, identity, scripted(broken, script), {id: () => "t3"}))
            .rejects.toThrow("disk full");
        expect(script.sent).toEqual([]);
        expect(new SlotDatabase(sql).read("one")).toEqual(before);
    });

    it("rejects a changed flag, order, suffix, partial set or reused slot candidate", () => {
        const [a, b, c] = [`${TEA_SLOT_MATRIX_ID}:A`, `${TEA_SLOT_MATRIX_ID}:B`, `${TEA_SLOT_MATRIX_ID}:C`]
            .map(id => teaProbeSnapshot(id));
        expect(prepareSet([a, b, c])).toEqual(FRAMES);
        expect(() => prepareSet([b, a, c])).toThrow(/reference matrix/i);
        expect(() => prepareSet([a, c, b])).toThrow(/reference matrix/i);
        expect(() => prepareSet([a, b, b])).toThrow(/reference matrix/i);
        expect(() => prepareSet([a, b, snapshotRecipe(coffee())])).toThrow(/reference matrix/i);
        expect(() => prepareSet([snapshotRecipe(coffee()), b, c])).toThrow(/reference matrix/i);
        expect(() => prepareSet([teaProbeSnapshot(), b, c])).toThrow(/reference matrix/i);
        expect(() => readSnapshot({...c, blob: [...c.blob.slice(0, 9), 254, 150]})).toThrow();
        expect(() => readSnapshot({...c, blob: [...c.blob.slice(0, 9), 50, 120]})).toThrow();
        expect(() => readSnapshot({...a, blob: [...a.blob.slice(0, 9), 50, 150]})).toThrow();
        expect(() => readSnapshot({...a, blob: [8, ...SEGMENT.slice(0, 7), 30, 254, 44]})).toThrow();
        expect(() => readSnapshot({...b, probe: `${TEA_SLOT_MATRIX_ID}:A`})).toThrow();
        expect(() => readSnapshot({...b, name: "TEA REF A"})).toThrow();
        const json = JSON.parse(b.recipeJSON);
        expect(() => readSnapshot({...b, recipeJSON: JSON.stringify({...json, ratio: 30})})).toThrow();
        expect(() => readSnapshot({...b, recipeJSON: JSON.stringify({...json, grinder: true})})).toThrow();
        expect(() => readSnapshot({...b, extra: true})).toThrow();
        expect(() => teaProbeSnapshot(TEA_SLOT_MATRIX_ID)).toThrow();
        expect(() => prepareSet([a, b, c].map(slot => ({...slot, probe: undefined})) as never)).toThrow();
    });

    it("allows no fourth trial and keeps evidence after the matrix is restored", async () => {
        const {store} = await restoredV2();
        await writeTeaSlotProbe(store, identity, scripted(store, {sent: []}), {id: () => "t3"});
        await restoreTeaSlotOriginal(store, identity, scripted(store, {sent: []}), {id: () => "r3"});
        const record = store.read("one");
        expect(nextTeaProbeCandidate(record)).toBeNull();
        expect(record.experimentHistory).toHaveLength(2);
        const script: Script = {sent: []};
        await expect(writeTeaSlotProbe(store, identity, scripted(store, script), {id: () => "t4"}))
            .rejects.toThrow(/restored.*evidence.*available/i);
        expect(script.sent).toEqual([]);
        expect(store.read("one")).toBe(record);
    });

    it("refuses a serial mismatch, a pending ordinary write and invalid tea", async () => {
        const {store} = await restoredV2();
        const before = store.read("one");
        const script: Script = {sent: []};
        for (const serial of [null, "other"]) {
            await expect(writeTeaSlotProbe(store, {...identity, serial}, scripted(store, script)))
                .rejects.toThrow(/serial|different machine/i);
        }
        await expect(writeSlots(store, identity, scripted(store, {sent: [], failAt: 0}), {id: () => "n1"}))
            .rejects.toThrow("Receipt unknown");
        expect(nextTeaProbeCandidate(store.read("one"))).toBeNull();
        await expect(writeTeaSlotProbe(store, identity, scripted(store, script), {id: () => "t3"}))
            .rejects.toThrow(/incomplete write/i);
        expect(script.sent).toEqual([]);
        expect(before.experiment?.candidateId).toBe(V2_ID);
        const tea = new Recipe();
        tea.cupType = CUP_TYPE.TEA;
        expect(() => snapshotRecipe(tea)).toThrow();
    });

    it("keeps A, B and C reports separate and leaves the older single observations alone", async () => {
        const {sql, store} = await restoredV2();
        await writeTeaSlotProbe(store, identity, scripted(store, {sent: []}), {id: () => "t3"});
        const report = (note: string, drainedAsTea: boolean | null) => ({
            at: 40, display: "Steep 20", heldSeconds: 20, drainedAsTea, note
        });
        store.observeSlot("one", 1, report("B", true));
        store.observeSlot("one", 2, {at: 41, display: "Grind", heldSeconds: null, drainedAsTea: null, note: "C not run"});
        store.observeSlot("one", 0, report("A", false));
        store.observeSlot("one", 1, report("B again", true));
        const after = new SlotDatabase(sql).read("one");
        expect(after.experiment?.slotObservations?.map(item => item?.note)).toEqual(["A", "B again", "C not run"]);
        expect(after.experiment?.slotObservations?.[2]).toMatchObject({heldSeconds: null, drainedAsTea: null});
        expect(after.experiment?.observation).toBeNull();
        expect(after.experimentHistory?.map(trial => trial.observation?.note)).toEqual(["v1 result", "v2 result"]);
        expect(() => store.observe("one", report("single", null))).toThrow(/separately/i);
        expect(() => store.observeSlot("one", 0, {...report("x", null), heldSeconds: -1})).toThrow();
        const copy = JSON.parse(formatTeaProbeEvidence(after.experiment!, after.experimentHistory));
        expect(copy.slotObservations).toHaveLength(3);
    });

    it("rejects an observation on older trials and damaged matrix histories", async () => {
        const {sql, store} = await restoredV2();
        const report = {at: 1, display: "", heldSeconds: null, drainedAsTea: null, note: ""};
        expect(() => store.observeSlot("one", 0, report)).toThrow();
        await writeTeaSlotProbe(store, identity, scripted(store, {sent: []}), {id: () => "t3"});
        const row = sql.getFirstSync("SELECT recordJSON FROM easy_mode_slots WHERE deviceId = ?", ["one"]) as
            {recordJSON: string};
        type MutableRecord = ReturnType<SlotDatabase["read"]>;
        const damage = (edit: (record: MutableRecord) => void) => {
            const record: MutableRecord = JSON.parse(row.recordJSON);
            edit(record);
            sql.runSync("UPDATE easy_mode_slots SET recordJSON = ? WHERE deviceId = ?",
                [JSON.stringify(record), "one"]);
            expect(() => new SlotDatabase(sql).read("one")).toThrow();
        };
        damage(record => { delete record.experiment!.slotObservations; });
        damage(record => { record.experimentHistory![0].slotObservations = [null, null, null]; });
        damage(record => { record.experimentHistory!.reverse(); });
        damage(record => { record.experimentHistory!.pop(); });
        damage(record => { record.experimentHistory!.push(record.experimentHistory![1]); });
        damage(record => { record.experimentHistory![1].trialId = record.experimentHistory![0].trialId; });
        damage(record => { record.experiment!.slotObservations![0] = {...report, heldSeconds: -2}; });
        damage(record => { record.written!.slots.reverse(); });
        damage(record => { record.experiment!.evidence[0].frames![1][11] = 0x02; });
    });
});
