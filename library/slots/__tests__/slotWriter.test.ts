import {createTestDatabase} from "@/test-utils/sqlite";
import {SlotDatabase} from "@/library/slots/SlotDatabase";
import {prepareSet, snapshotRecipe, type SlotIndex, type Triple, type SlotSnapshot} from "@/library/slots/slotModel";
import {
    writeSlots, recoverSlots, unavailableSlotPort, type SlotPort, type SlotLease
} from "@/library/slots/slotWriter";
import {coffee} from "./fixtures";

const identity = {deviceId: "one", serial: "serial"};

function ready() {
    const sql = createTestDatabase();
    const store = new SlotDatabase(sql);
    for (const index of [0, 1, 2] as const) {
        store.assign("one", index, snapshotRecipe(coffee(String(index), 14 + index)));
    }
    return {sql, store};
}

function scripted(store: SlotDatabase, failAt?: SlotIndex | "final") {
    const sent: number[] = [];
    const released: boolean[] = [];
    let reserved = false;
    const lease: SlotLease = {
        sendAndConfirm: async (frame, index) => {
            const journal = store.read("one").journal!;
            expect(journal.inFlight).toBe(index);
            expect(journal.acknowledged).toBe(index);
            expect(Array.from(frame)).toEqual(journal.frames[index]);
            sent.push(index);
            if (index === failAt) throw new Error("Receipt unknown");
        },
        confirmSaved: async () => {
            expect(store.read("one").journal?.acknowledged).toBe(3);
            expect(store.read("one").written).toBeNull();
            if (failAt === "final") throw new Error("Completion unconfirmed");
        },
        release: (complete) => { released.push(complete); reserved = !complete; }
    };
    const port: SlotPort = {
        available: true,
        acquire: async (received) => {
            expect(received).toEqual(identity);
            if (reserved) throw new Error("Machine busy");
            reserved = true;
            return lease;
        }
    };
    return {port, sent, released};
}

it("persists before sending A/B/C and only promotes after final machine evidence", async () => {
    const {store} = ready();
    const script = scripted(store);
    await writeSlots(store, identity, script.port, {id: () => "attempt", now: () => 42});
    expect(script.sent).toEqual([0, 1, 2]);
    expect(script.released).toEqual([true]);
    expect(store.read("one").written?.at).toBe(42);
    expect(store.read("one").journal).toBeNull();
});

it("captures an immutable target before awaiting acquisition instead of journaling a retargeted caller", async () => {
    const {store} = ready();
    const script = scripted(store);
    const target = {...identity};
    const acquire = script.port.acquire;
    script.port.acquire = async (bound) => {
        const lease = await acquire(bound);
        target.deviceId = "different";
        target.serial = "changed";
        return lease;
    };
    await expect(writeSlots(store, target, script.port)).resolves.toBeUndefined();
    expect(store.read("one").written).not.toBeNull();
    expect(store.read("different").journal).toBeNull();
    expect(script.sent).toEqual([0, 1, 2]);
});

it("does not create a journal for invalid sets or the unavailable production port", async () => {
    const {store} = ready();
    await expect(writeSlots(store, identity, unavailableSlotPort)).rejects.toThrow(/integrat/i);
    expect(store.read("one").journal).toBeNull();
    store.assign("one", 2, null);
    const acquire = jest.fn();
    await expect(writeSlots(store, identity, {available: true, acquire})).rejects.toThrow(/three/i);
    expect(acquire).not.toHaveBeenCalled();
});

it.each([0, 1, 2] as const)("never advances or replays slot %s after ambiguous receipt", async (index) => {
    const {store, sql} = ready();
    const script = scripted(store, index);
    await expect(writeSlots(store, identity, script.port)).rejects.toThrow(/unknown/i);
    const reopened = new SlotDatabase(sql);
    expect(reopened.read("one").journal?.inFlight).toBe(index);
    expect(reopened.read("one").written).toBeNull();
    const acquire = jest.fn();
    await expect(recoverSlots(reopened, identity, {available: true, acquire}))
        .rejects.toThrow(/receipt.*unknown/i);
    expect(acquire).not.toHaveBeenCalled();
    expect(script.sent).toEqual([0, 1, 2].slice(0, index + 1));
    expect(script.released).toEqual([false]);
});

it("keeps all receipts but does not infer completion from a missing saved event", async () => {
    const {store} = ready();
    const script = scripted(store, "final");
    await expect(writeSlots(store, identity, script.port)).rejects.toThrow(/unconfirmed/i);
    expect(store.read("one").journal).toMatchObject({acknowledged: 3, inFlight: null});
    await expect(recoverSlots(store, identity, script.port)).rejects.toThrow(/completion/i);
});

it.each(["Native dispatch failed", "Receipt timeout", "Duplicate receipt", "Delayed receipt ambiguous"])(
    "retains uncertainty when the exclusive port refuses: %s", async (message) => {
        const {store} = ready();
        const script = scripted(store);
        const acquire = script.port.acquire;
        script.port.acquire = async (bound) => {
            const lease = await acquire(bound);
            return {
                ...lease,
                sendAndConfirm: async (frame, index) => {
                    await lease.sendAndConfirm(frame, index);
                    throw new Error(message);
                }
            };
        };
        await expect(writeSlots(store, identity, script.port)).rejects.toThrow(message);
        expect(store.read("one").journal).toMatchObject({
            acknowledged: 0, inFlight: 0, error: message
        });
        expect(script.sent).toEqual([0]);
        expect(script.released).toEqual([false]);
    }
);

it("resumes an explicitly confirmed boundary with exactly the remaining immutable frames", async () => {
    const {store, sql} = ready();
    const snapshot = snapshotRecipe(coffee());
    const slots: Triple<SlotSnapshot> = [snapshot, snapshot, snapshot];
    store.begin("one", {
        id: "attempt", serial: "serial", slots, frames: prepareSet(slots),
        acknowledged: 0, inFlight: null, error: null
    });
    store.dispatching("one", "attempt", 0);
    store.acknowledge("one", "attempt", 0);
    const reopened = new SlotDatabase(sql);
    const script = scripted(reopened);
    await recoverSlots(reopened, identity, script.port);
    expect(script.sent).toEqual([1, 2]);
    expect(script.released).toEqual([true]);
});

it("blocks different serials and overlapping write attempts", async () => {
    const {store} = ready();
    const script = scripted(store, 1);
    await expect(writeSlots(store, identity, script.port)).rejects.toThrow();
    await expect(recoverSlots(store, {...identity, serial: "other"}, script.port))
        .rejects.toThrow(/different machine/i);
    await expect(writeSlots(store, identity, script.port)).rejects.toThrow(/incomplete/i);
});

it("cannot acquire two overlapping slot leases before the first frame", async () => {
    const {store} = ready();
    const script = scripted(store);
    const first = writeSlots(store, identity, script.port);
    const second = writeSlots(store, identity, script.port);
    await expect(second).rejects.toThrow(/busy/i);
    await first;
    expect(script.sent).toEqual([0, 1, 2]);
    expect(script.released).toEqual([true]);
});

it("leaves receipt uncertainty durable when persisting acknowledgement fails", async () => {
    const {store, sql} = ready();
    const script = scripted(store);
    const send = script.port.acquire;
    script.port.acquire = async (bound) => {
        const lease = await send(bound);
        return {
            ...lease,
            sendAndConfirm: async (frame, index) => {
                await lease.sendAndConfirm(frame, index);
                sql.execSync("CREATE TRIGGER fail_update BEFORE INSERT ON easy_mode_slots BEGIN SELECT RAISE(ABORT, 'disk full'); END;");
            }
        };
    };
    await expect(writeSlots(store, identity, script.port)).rejects.toThrow(/disk full/i);
    expect(store.read("one").journal?.inFlight).toBe(0);
    expect(script.sent).toEqual([0]);
    expect(script.released).toEqual([false]);
});

it("explicitly replays unknown B from the immutable journal without clearing uncertainty", async () => {
    const {store, sql} = ready();
    await expect(writeSlots(store, identity, scripted(store, 1).port)).rejects.toThrow(/unknown/i);
    const journal = store.read("one").journal!;
    const script = scripted(store);
    const acquire = script.port.acquire;
    script.port.acquire = async (bound, options) => {
        expect(options).toMatchObject({restart: false, finishUncertain: true});
        expect(store.read("one").journal).toBe(journal);
        return acquire(bound, options);
    };
    const boundaries: unknown[] = [];
    const off = store.subscribe(() => boundaries.push(store.read("one").journal));
    await recoverSlots(store, identity, script.port, {finishUncertain: true});
    off();
    expect(boundaries[0]).toMatchObject({
        id: journal.id, acknowledged: 1, inFlight: 1, slots: journal.slots, frames: journal.frames
    });
    expect(script.sent).toEqual([1, 2]);
    expect(new SlotDatabase(sql).read("one").written?.slots).toEqual(journal.slots);
});

it("persists the uncertain redispatch boundary before any replay and surfaces storage failure", async () => {
    const {store, sql} = ready();
    await expect(writeSlots(store, identity, scripted(store, 1).port)).rejects.toThrow();
    const before = store.read("one").journal;
    sql.execSync("CREATE TRIGGER fail_replay BEFORE INSERT ON easy_mode_slots BEGIN SELECT RAISE(ABORT, 'disk full'); END;");
    const script = scripted(store);
    await expect(recoverSlots(store, identity, script.port, {finishUncertain: true}))
        .rejects.toThrow(/disk full/i);
    expect(script.sent).toEqual([]);
    expect(script.released).toEqual([false]);
    expect(new SlotDatabase(sql).read("one").journal).toEqual(before);
});

it("explicitly observes a three-receipt journal without speculatively resending C", async () => {
    const {store} = ready();
    await expect(writeSlots(store, identity, scripted(store, "final").port)).rejects.toThrow();
    const script = scripted(store);
    await recoverSlots(store, identity, script.port, {finishUncertain: true});
    expect(script.sent).toEqual([]);
    expect(store.read("one").journal).toBeNull();
    expect(store.read("one").written).not.toBeNull();
});
