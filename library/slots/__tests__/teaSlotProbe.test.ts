import {createTestDatabase} from "@/test-utils/sqlite";
import {buildType2} from "@/library/machine/protocol";
import Recipe, {CUP_TYPE} from "@/library/Recipe";
import {SlotDatabase} from "@/library/slots/SlotDatabase";
import {readSnapshot, snapshotRecipe, type SlotIndex, type SlotSnapshot} from "@/library/slots/slotModel";
import {recoverSlots, cancelSlots, writeSlots, type SlotLease, type SlotPort} from "@/library/slots/slotWriter";
import {
    formatTeaProbeEvidence, restoreTeaSlotOriginal, teaProbeStatus, writeTeaSlotProbe
} from "@/library/slots/teaSlotProbe";
import {teaProbeSnapshot, TEA_SLOT_PROBE_ID} from "@/library/slots/teaSlotCandidate";
import {coffee} from "./fixtures";

const identity = {deviceId: "one", serial: "serial"};
const EXPECTED_BLOB = [8, 60, 70, 0, 0, 0, 32, 120, 30, 0xFE, 120];

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

    it("does not unblock general tea or accept a tampered probe", () => {
        const tea = new Recipe();
        tea.cupType = CUP_TYPE.TEA;
        expect(() => snapshotRecipe(tea)).toThrow("Tea slot writing is not available");
        const exact = teaProbeSnapshot();
        expect(readSnapshot(exact)).toEqual(exact);
        const json = JSON.parse(exact.recipeJSON);
        const tampered = (changes: Partial<SlotSnapshot> & Record<string, unknown>) =>
            () => readSnapshot({...exact, ...changes});
        expect(tampered({name: "Other"})).toThrow();
        expect(tampered({sourceUuid: "other"})).toThrow();
        expect(tampered({probe: "other"})).toThrow();
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
        const {store, set} = seeded(false);
        await writeTeaSlotProbe(store, identity, scripted(store, {sent: []}));
        const script: Script = {sent: []};
        await restoreTeaSlotOriginal(store, identity, scripted(store, script));
        expect(script.sent).toEqual(frames(set.map((slot) => slot.blob)));
        const record = store.read("one");
        expect(record.experiment?.phase).toBe("restored");
        expect(record.experiment?.evidence.some((entry) => entry.kind === "final")).toBe(true);
        await expect(restoreTeaSlotOriginal(store, identity, scripted(store, {sent: []})))
            .rejects.toThrow("no tea slot probe");
        // A new trial can start again and never captures the probe.
        await writeTeaSlotProbe(store, identity, scripted(store, {sent: []}), {id: () => "t2"});
        expect(store.read("one").experiment?.original.slots).toEqual(set);
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
        expect(teaProbeStatus(record)).toBe("candidate-written");
    });
});
