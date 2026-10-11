import {createTestDatabase} from "@/test-utils/sqlite";
import {SlotDatabase} from "@/library/slots/SlotDatabase";
import {prepareSet, snapshotRecipe} from "@/library/slots/slotModel";
import {teaProbeCandidateSet, teaProbeSnapshot} from "@/library/slots/teaSlotCandidate";
import {
    restoreTeaSlotOriginal, writeTeaSlotProbe, sendSlotRecoveryProbe, clearSlotRecoveryProbe
} from "@/library/slots/teaSlotProbe";
import {cancelSlots, recoverSlots, type SlotLease, type SlotPort} from "@/library/slots/slotWriter";
import {coffee} from "./fixtures";

const STEEPS = "tea-slot-apk-steeps-abc-v1";
const RECOVERY = "slot-apk-recovery-40526-v1";
const identity = {deviceId: "one", serial: "serial"};

function seeded() {
    const sql = createTestDatabase();
    const store = new SlotDatabase(sql);
    for (const index of [0, 1, 2] as const) store.assign("one", index, snapshotRecipe(coffee(`Original ${index}`)));
    const sent: number[][] = [];
    const recovery = jest.fn(async () => {});
    const lease: SlotLease = {
        sendAndConfirm: async frame => { sent.push(Array.from(frame)); },
        confirmSaved: jest.fn(async () => {}),
        sendRecoveryCommand: recovery,
        restartFromBeginning: true,
        release: jest.fn()
    };
    const port: SlotPort = {available: true, acquire: async () => lease};
    return {sql, store, port, lease, sent, recovery};
}

it("packs source-backed one/two/three steep selectors and complete reference stages", () => {
    const {store} = seeded();
    const originals = store.read("one").drafts;
    const slots = teaProbeCandidateSet([
        originals[0]!, originals[1]!, originals[2]!
    ], STEEPS);
    const frames = prepareSet(slots);
    expect(frames.map(frame => frame[11])).toEqual([0x0C, 0x2C, 0x4C]);
    for (const index of [0, 1, 2] as const) {
        expect(slots[index].blob).toEqual([
            8 * (index + 1),
            ...Array.from({length: index + 1}, (_, stage) =>
                [90, 92, 2, 0, 236, 0, stage === 0 ? 120 : 0, 35]).flat(),
            254, 150
        ]);
        expect(teaProbeSnapshot(`${STEEPS}:${["A", "B", "C"][index]}`)).toEqual(slots[index]);
    }
    expect(() => prepareSet([slots[0], slots[0], slots[2]])).toThrow();
});

it("retains per-slot steep observations and archives a restored trial before recovery", async () => {
    const {sql, store, port} = seeded();
    await writeTeaSlotProbe(store, identity, port, {candidateId: STEEPS, id: () => "steeps"});
    store.observeSlot("one", 2, {at: 1, display: "3 steeps", heldSeconds: 20, drainedAsTea: true, note: ""});
    await restoreTeaSlotOriginal(store, identity, port, {id: () => "restore"});
    const archived = store.read("one").experiment;
    await writeTeaSlotProbe(store, identity, port, {candidateId: RECOVERY, id: () => "recovery"});
    const reopened = new SlotDatabase(sql).read("one");
    expect(reopened.experimentHistory).toEqual([archived]);
    expect(reopened.experiment?.originalDrafts).toEqual(archived?.originalDrafts);
    expect(reopened.journal).toMatchObject({acknowledged: 1, inFlight: null});
});

it("writes only original A and retains an incomplete journal instead of claiming a saved set", async () => {
    const {sql, store, port, sent, lease} = seeded();
    const before = store.read("one");
    await writeTeaSlotProbe(store, identity, port, {candidateId: RECOVERY, id: () => "partial"});
    expect(sent).toEqual(prepareSet(before.drafts).slice(0, 1));
    expect(lease.confirmSaved).not.toHaveBeenCalled();
    expect(lease.release).toHaveBeenCalledWith(false);
    const reopened = new SlotDatabase(sql).read("one");
    expect(reopened.journal).toMatchObject({id: "partial", acknowledged: 1, inFlight: null});
    expect(reopened.written).toBeNull();
    expect(reopened.experiment?.original.slots).toEqual(before.drafts);
    expect(reopened.experiment?.evidence.map(entry => entry.kind)).toEqual(["prepared", "dispatch", "receipt", "partial"]);
});

it("requires an exact receipt boundary for 40526 and never clears the journal on command receipt", async () => {
    const {store, port, recovery} = seeded();
    await expect(sendSlotRecoveryProbe(store, identity, port)).rejects.toThrow();
    await writeTeaSlotProbe(store, identity, port, {candidateId: RECOVERY});
    const journal = store.read("one").journal;
    await expect(sendSlotRecoveryProbe(store, {...identity, serial: "other"}, port)).rejects.toThrow();
    await sendSlotRecoveryProbe(store, identity, port);
    expect(recovery).toHaveBeenCalledTimes(1);
    expect(store.read("one").journal).toEqual(journal);
    expect(store.read("one").experiment?.evidence.at(-1)?.kind).toBe("recovery-receipt");
    await cancelSlots(store, identity, port);
    await restoreTeaSlotOriginal(store, identity, port);
    expect(store.read("one").experiment?.phase).toBe("restored");
    expect(store.read("one").journal).toBeNull();
});

it("keeps a recovery fallback that sends original B/C and then allows full restoration", async () => {
    const {store, port, lease, sent} = seeded();
    port.acquire = async () => ({...lease, restartFromBeginning: false});
    await writeTeaSlotProbe(store, identity, port, {candidateId: RECOVERY});
    await recoverSlots(store, identity, port, {finishUncertain: true});
    expect(sent.map(frame => frame[10])).toEqual([0, 1, 2]);
    await restoreTeaSlotOriginal(store, identity, port);
    expect(store.read("one").experiment?.phase).toBe("restored");
});

it("retains uncertainty on a failed A write and refuses the recovery command", async () => {
    const {store, port, lease, recovery} = seeded();
    lease.sendAndConfirm = async () => { throw new Error("No receipt"); };
    await expect(writeTeaSlotProbe(store, identity, port, {candidateId: RECOVERY})).rejects.toThrow("No receipt");
    expect(store.read("one").journal?.inFlight).toBe(0);
    await expect(sendSlotRecoveryProbe(store, identity, port)).rejects.toThrow(/receipt/i);
    expect(recovery).not.toHaveBeenCalled();
});

it("requires a recovery receipt and known normal state before clearing the lab journal", async () => {
    const {store, port} = seeded();
    await writeTeaSlotProbe(store, identity, port, {candidateId: RECOVERY});
    await expect(clearSlotRecoveryProbe(store, identity, port)).rejects.toThrow(/receipt/i);
    await sendSlotRecoveryProbe(store, identity, port);
    const acquire = jest.spyOn(port, "acquire");
    await clearSlotRecoveryProbe(store, identity, port);
    expect(acquire).toHaveBeenLastCalledWith(identity, {restart: true, requireKnownNormal: true});
    expect(store.read("one").journal).toBeNull();
    expect(store.read("one").written).toBeNull();
    expect(store.read("one").experiment?.phase).toBe("active");
});

it("blocks new labs during unrestored trials, arbitrary ids and duplicate completed labs", async () => {
    const {store, port} = seeded();
    await expect(writeTeaSlotProbe(store, identity, port, {candidateId: "arbitrary"})).rejects.toThrow();
    await writeTeaSlotProbe(store, identity, port, {candidateId: STEEPS});
    await expect(writeTeaSlotProbe(store, identity, port, {candidateId: RECOVERY})).rejects.toThrow();
    await restoreTeaSlotOriginal(store, identity, port);
    await expect(writeTeaSlotProbe(store, identity, port, {candidateId: STEEPS})).rejects.toThrow();
});
