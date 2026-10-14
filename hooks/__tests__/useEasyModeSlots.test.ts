import {act, renderHook} from "@testing-library/react-native";
import {createTestDatabase} from "@/test-utils/sqlite";
import {SlotDatabase} from "@/library/slots/SlotDatabase";
import {coffee} from "@/library/slots/__tests__/fixtures";
import {prepareSet, snapshotRecipe} from "@/library/slots/slotModel";
import {incomingEasyModeRecipe, openEasyModeRecipe, prepareEasyModeEntry, sharedSlotDatabase, useEasyModeSlots, useSlotRecord} from "@/hooks/useEasyModeSlots";
import {forgetLastMove, SETTLE_MS} from "@/hooks/steadyRouter";
import type {SlotLease} from "@/library/slots/slotWriter";
import {nextTeaProbeCandidate, writeTeaSlotProbe} from "@/library/slots/teaSlotProbe";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
    router: {push: (...args: unknown[]) => mockPush(...args)}
}));
jest.mock("expo-sqlite", () => ({
    openDatabaseSync: () => jest.requireActual("@/test-utils/sqlite").createTestDatabase()
}));

beforeEach(() => {
    forgetLastMove();
    mockPush.mockClear();
});

it.each([undefined, null, 0, "15", {}, -1, 32])(
    "refuses raw incoming dosage %p instead of opening a default-dose recipe", (dosage) => {
        const raw = JSON.parse(JSON.stringify(coffee()));
        raw.dosage = dosage;
        const incoming = incomingEasyModeRecipe(JSON.stringify(raw));
        expect(incoming.recipe).toBeUndefined();
        expect(incoming.error).toMatch(/dose|dosage/i);
    }
);

it.each([1, 15, 31])("preserves incoming raw dosage %s and its actual wire bytes", (dosage) => {
    const recipe = coffee();
    recipe.dosage = dosage;
    recipe.ratio = 5;
    recipe.pours[0].volume = dosage * 5;
    const incoming = incomingEasyModeRecipe(JSON.stringify(recipe));
    expect(incoming.error).toBeNull();
    expect(incoming.recipe?.dosage).toBe(dosage);
    expect(snapshotRecipe(incoming.recipe!).blob).toEqual(snapshotRecipe(recipe).blob);
});

it("assigns only once on rapid context taps but allows a deliberate repeat visit", () => {
    const now = jest.spyOn(Date, "now").mockReturnValue(1000);
    const recipe = coffee();
    const store = sharedSlotDatabase();
    const deviceId = "rapid-context";
    try {
        openEasyModeRecipe(recipe, deviceId);
        openEasyModeRecipe(recipe, deviceId);
        expect(mockPush).toHaveBeenCalledTimes(1);
        expect(store.read(deviceId).drafts.map((slot) => slot?.sourceUuid ?? null))
            .toEqual([recipe.uuid, null, null]);
        now.mockReturnValue(1000 + SETTLE_MS);
        openEasyModeRecipe(recipe, deviceId);
        expect(mockPush).toHaveBeenCalledTimes(2);
        expect(store.read(deviceId).drafts[1]?.sourceUuid).toBe(recipe.uuid);
    } finally {
        now.mockRestore();
    }
});

it("context entry fills only an empty slot and full sets require replacement choice", () => {
    const store = new SlotDatabase(createTestDatabase());
    const recipe = coffee();
    expect(prepareEasyModeEntry(store, "one", recipe)).toEqual({pathname: "/easyMode"});
    expect(store.read("one").drafts[0]?.sourceUuid).toBe(recipe.uuid);
    prepareEasyModeEntry(store, "one", recipe);
    prepareEasyModeEntry(store, "one", recipe);
    expect(prepareEasyModeEntry(store, "one", recipe).params?.recipeJSON).toBe(JSON.stringify(recipe));
    expect(store.read("one").drafts.every((slot) => slot?.sourceUuid === recipe.uuid)).toBe(true);
});

it("notifies both screen and library subscribers after a durable assignment", async () => {
    const store = new SlotDatabase(createTestDatabase());
    const editor = await renderHook(() => useEasyModeSlots(
        {deviceId: "one", serial: null}, undefined, store
    ));
    const library = await renderHook(() => useSlotRecord("one", store));
    await act(async () => editor.result.current.assign(1, coffee()));
    expect(library.result.current.drafts[1]?.name).toBe("Morning");
    expect(editor.result.current.error).toBeNull();
});

it("exposes durable scale changes, success booleans and visible failures", async () => {
    const sql = createTestDatabase();
    const store = new SlotDatabase(sql);
    store.assign("one", 0, snapshotRecipe(coffee()));
    const editor = await renderHook(() => useEasyModeSlots(
        {deviceId: "one", serial: null}, undefined, store
    ));
    const library = await renderHook(() => useSlotRecord("one", store));
    await act(async () => { expect(editor.result.current.setScaleEnabled(1, true)).toBe(false); });
    expect(editor.result.current.error).toMatch(/choose.*recipe/i);
    await act(async () => { expect(editor.result.current.setScaleEnabled(0, true)).toBe(true); });
    expect(editor.result.current.error).toBeNull();
    expect(library.result.current.drafts[0]?.scaleEnabled).toBe(true);
    expect(new SlotDatabase(sql).read("one").drafts[0]?.scaleEnabled).toBe(true);
    sql.execSync("CREATE TRIGGER fail_scale BEFORE INSERT ON easy_mode_slots BEGIN SELECT RAISE(ABORT, 'disk full'); END;");
    await act(async () => { expect(editor.result.current.setScaleEnabled(0, false)).toBe(false); });
    expect(editor.result.current.error).toMatch(/disk full/i);
    expect(editor.result.current.record.drafts[0]?.scaleEnabled).toBe(true);
});

it("context entry during recovery opens the frozen batch without proposing a replacement", () => {
    const store = new SlotDatabase(createTestDatabase());
    const recipe = coffee();
    const slot = snapshotRecipe(recipe);
    store.begin("one", {
        id: "attempt", serial: null, slots: [slot, slot, slot],
        frames: prepareSet([slot, slot, slot]),
        acknowledged: 0, inFlight: null, error: null
    });
    expect(prepareEasyModeEntry(store, "one", coffee("Replacement")))
        .toEqual({pathname: "/easyMode"});
    expect(store.read("one").drafts).toEqual([null, null, null]);
});

it("surfaces invalid assignment and production transport blocks without a journal", async () => {
    const store = new SlotDatabase(createTestDatabase());
    const editor = await renderHook(() => useEasyModeSlots(
        {deviceId: "one", serial: null}, undefined, store
    ));
    const invalid = coffee();
    invalid.bypassEnabled = true;
    await act(async () => editor.result.current.assign(0, invalid));
    expect(editor.result.current.error).toMatch(/bypass/i);
    await act(async () => { await editor.result.current.write(); });
    expect(editor.result.current.error).toMatch(/integrat/i);
    expect(store.read("one").journal).toBeNull();
});

it("holds the screen lock across a duplicate tap while lease acquisition is pending", async () => {
    const store = new SlotDatabase(createTestDatabase());
    for (const index of [0, 1, 2] as const) store.assign("one", index, snapshotRecipe(coffee()));
    let resolveLease: (lease: SlotLease) => void = () => { throw new Error("No pending acquisition"); };
    const acquire = jest.fn(() => new Promise<SlotLease>((resolve) => { resolveLease = resolve; }));
    const editor = await renderHook(() => useEasyModeSlots(
        {deviceId: "one", serial: null}, {available: true, acquire}, store
    ));
    let first: Promise<void> = Promise.resolve();
    await act(async () => {
        first = editor.result.current.write();
        void editor.result.current.write();
    });

    expect(acquire).toHaveBeenCalledTimes(1);
    expect(editor.result.current.running).toBe(true);
    await act(async () => { expect(editor.result.current.setScaleEnabled(0, true)).toBe(false); });
    expect(editor.result.current.error).toMatch(/wait.*operation/i);
    expect(store.read("one").drafts[0]?.scaleEnabled).toBeUndefined();
    await act(async () => {
        resolveLease({
            sendAndConfirm: async () => {},
            confirmSaved: async () => {},
            release: () => {}
        });
        await first;
    });
    expect(editor.result.current.running).toBe(false);
});

it("exposes a dedicated tea probe action through the normal hook lock and supplied port", async () => {
    const store = new SlotDatabase(createTestDatabase());
    for (const index of [0, 1, 2] as const) store.assign("one", index, snapshotRecipe(coffee()));
    let resolveLease!: (lease: SlotLease) => void;
    const acquire = jest.fn(() => new Promise<SlotLease>(resolve => { resolveLease = resolve; }));
    const editor = await renderHook(() => useEasyModeSlots(
        {deviceId: "one", serial: "serial"}, {available: true, acquire}, store
    ));
    let writing!: Promise<void>;
    await act(async () => {
        writing = editor.result.current.writeTeaProbe();
        void editor.result.current.writeTeaProbe();
        void editor.result.current.write();
    });

    expect(acquire).toHaveBeenCalledTimes(1);
    expect(acquire).toHaveBeenCalledWith(
        {deviceId: "one", serial: "serial"}, {restart: false, requireKnownNormal: true}
    );
    expect(store.read("one").experiment).toBeUndefined();
    expect(editor.result.current.running).toBe(true);
    await act(async () => {
        resolveLease({
            sendAndConfirm: async () => {}, confirmSaved: async () => {}, release: () => {}
        });
        await writing;
    });
    expect(editor.result.current.attempt).toMatchObject({operation: "probe", status: "success"});
    expect(editor.result.current.record.experiment?.evidence.at(-1)?.kind).toBe("final");
    await act(async () => { expect(editor.result.current.setScaleEnabled(0, true)).toBe(false); });
    expect(editor.result.current.error).toMatch(/restore/i);
    let restoring!: Promise<void>;
    await act(async () => { restoring = editor.result.current.restoreTeaOriginal(); });
    await act(async () => {
        resolveLease({
            sendAndConfirm: async () => {}, confirmSaved: async () => {}, release: () => {}
        });
        await restoring;
    });
    expect(acquire.mock.calls[1]).toEqual([
        {deviceId: "one", serial: "serial"}, {restart: false}
    ]);
    expect(editor.result.current.attempt).toMatchObject({operation: "restore", status: "success"});
    expect(editor.result.current.record.experiment?.phase).toBe("restored");
});

it("keeps active trials on the recovery route instead of assigning an incoming normal recipe", async () => {
    const store = new SlotDatabase(createTestDatabase());
    for (const i of [0, 1, 2] as const) store.assign("one", i, snapshotRecipe(coffee()));
    await writeTeaSlotProbe(store, {deviceId: "one", serial: "serial"}, {
        available: true, acquire: async () => ({
            sendAndConfirm: async () => {}, confirmSaved: async () => {}, release: () => {}
        })
    });
    const before = store.read("one");
    expect(prepareEasyModeEntry(store, "one", coffee("Incoming"))).toEqual({pathname: "/easyMode"});
    expect(store.read("one")).toBe(before);
});

it("advances the dedicated hook action once after restore and keeps archived observations immutable", async () => {
    const sql = createTestDatabase();
    const store = new SlotDatabase(sql);
    for (const index of [0, 1, 2] as const) store.assign("one", index, snapshotRecipe(coffee()));
    const sent: number[][] = [];
    const acquire = jest.fn(async () => ({
        sendAndConfirm: async (frame: Uint8Array) => { sent.push(Array.from(frame)); },
        confirmSaved: async () => {}, release: () => {}
    }));
    const editor = await renderHook(() => useEasyModeSlots(
        {deviceId: "one", serial: "serial"}, {available: true, acquire}, store
    ));
    await act(async () => { await editor.result.current.writeTeaProbe({id: () => "t1"}); });
    await act(async () => {
        editor.result.current.observeTeaProbe("t1", {
            at: 1, display: "Water", heldSeconds: 60, drainedAsTea: false, note: "No tea drain"
        });
        await editor.result.current.restoreTeaOriginal({id: () => "r1"});
    });
    const archived = editor.result.current.record.experiment!;
    expect(nextTeaProbeCandidate(editor.result.current.record)).toBe("tea-slot-0x04-one-steep-v1");
    await act(async () => { await editor.result.current.writeTeaProbe({id: () => "t2"}); });
    expect(acquire).toHaveBeenNthCalledWith(3,
        {deviceId: "one", serial: "serial"}, {restart: false, requireKnownNormal: true});
    expect(sent[6][11]).toBe(0x04);
    expect(editor.result.current.record.experimentHistory).toEqual([archived]);
    expect(editor.result.current.attempt).toMatchObject({operation: "probe", status: "success"});
    await act(async () => {
        expect(editor.result.current.observeTeaProbe("t1", {
            at: 2, display: "Wrong", heldSeconds: null, drainedAsTea: null, note: ""
        })).toBe(false);
    });
    expect(editor.result.current.error).toMatch(/different machine or trial/);
    expect(new SlotDatabase(sql).read("one").experimentHistory).toEqual([archived]);
    await act(async () => { await editor.result.current.restoreTeaOriginal({id: () => "r2"}); });
    const v2 = editor.result.current.record.experiment!;
    expect(nextTeaProbeCandidate(editor.result.current.record)).toBe("tea-slot-reference-abc-v1");
    await act(async () => { await editor.result.current.writeTeaProbe({id: () => "t3"}); });
    expect(sent.slice(-3).map(frame => frame[11])).toEqual([0x02, 0x04, 0x04]);
    expect(editor.result.current.record.experimentHistory).toEqual([archived, v2]);
    const report = {at: 3, display: "Steep 20", heldSeconds: 20, drainedAsTea: true, note: "B"};
    await act(async () => { expect(editor.result.current.observeTeaProbe("t3", report, 1)).toBe(true); });
    expect(new SlotDatabase(sql).read("one").experiment?.slotObservations)
        .toEqual([null, report, null]);
    await act(async () => { expect(editor.result.current.observeTeaProbe("t3", report)).toBe(false); });
    await act(async () => { await editor.result.current.restoreTeaOriginal({id: () => "r3"}); });
    const framesBefore = sent.length;
    await act(async () => { await editor.result.current.writeTeaProbe({id: () => "t4"}); });
    expect(editor.result.current.attempt).toMatchObject({operation: "probe", status: "error"});
    expect(editor.result.current.error).toMatch(/new trial is not allowed/);
    expect(sent).toHaveLength(framesBefore);
    expect(editor.result.current.record.experimentHistory).toEqual([archived, v2]);
});

it("saves observations through the durable store, allows offline evidence and rejects stale trials/serials", async () => {
    const sql = createTestDatabase();
    const store = new SlotDatabase(sql);
    for (const i of [0, 1, 2] as const) store.assign("one", i, snapshotRecipe(coffee()));
    await writeTeaSlotProbe(store, {deviceId: "one", serial: "serial"}, {
        available: true, acquire: async () => ({
            sendAndConfirm: async () => {}, confirmSaved: async () => {}, release: () => {}
        })
    }, {id: () => "trial"});
    const observation = {at: 100, display: "A OFF", heldSeconds: null, drainedAsTea: null, note: "Not run"};
    const editor = await renderHook<ReturnType<typeof useEasyModeSlots>, {serial: string | null}>(
        ({serial}) => useEasyModeSlots({deviceId: "one", serial}, undefined, store),
        {initialProps: {serial: null}}
    );
    await act(async () => {
        expect(editor.result.current.observeTeaProbe("trial", observation)).toBe(true);
    });
    expect(new SlotDatabase(sql).read("one").experiment?.observation).toEqual(observation);
    await act(async () => {
        expect(editor.result.current.observeTeaProbe("old-trial", {...observation, note: "Wrong"})).toBe(false);
    });
    expect(editor.result.current.error).toMatch(/different machine or trial/);
    await editor.rerender({serial: "other"});
    await act(async () => {
        expect(editor.result.current.observeTeaProbe("trial", observation)).toBe(false);
    });
    expect(editor.result.current.error).toMatch(/different machine or trial/);
    await editor.rerender({serial: "serial"});
    const observe = jest.spyOn(store, "observe").mockImplementationOnce(() => { throw new Error("disk full"); });
    await act(async () => {
        expect(editor.result.current.observeTeaProbe("trial", observation)).toBe(false);
    });
    expect(editor.result.current.error).toBe("disk full");
    observe.mockRestore();
});

it("does not send after failed probe preparation and retains the explicit failure", async () => {
    const store = new SlotDatabase(createTestDatabase());
    const send = jest.fn(async () => {});
    const editor = await renderHook(() => useEasyModeSlots({deviceId: "one", serial: "serial"}, {
        available: true, acquire: async () => ({
            sendAndConfirm: send, confirmSaved: async () => {}, release: () => {}
        })
    }, store));
    await act(async () => { await editor.result.current.writeTeaProbe(); });
    expect(editor.result.current.error).toMatch(/complete A\/B\/C/);
    expect(editor.result.current.attempt).toMatchObject({operation: "probe", status: "error"});
    expect(send).not.toHaveBeenCalled();
    expect(store.read("one").journal).toBeNull();
    expect(store.read("one").experiment).toBeUndefined();
});

it("tracks saving and durable success after the journal clears, resetting only on events", async () => {
        const store = new SlotDatabase(createTestDatabase());
        for (const index of [0, 1, 2] as const) store.assign("one", index, snapshotRecipe(coffee()));
        let saved!: () => void;
        const port = {
            available: true,
            acquire: async () => ({
                sendAndConfirm: async () => {},
                confirmSaved: () => new Promise<void>(resolve => { saved = resolve; }),
                release: () => {}
            })
        };
        const editor = await renderHook(() => useEasyModeSlots(
            {deviceId: "one", serial: "serial"}, port, store
        ));
        let writing!: Promise<void>;
        await act(async () => { writing = editor.result.current.write(); });
        expect(editor.result.current.operation).toBe("write");
        expect(editor.result.current.attempt).toMatchObject({
            deviceId: "one", serial: "serial", operation: "write", status: "saving"
        });
        await act(async () => { saved(); await writing; });
        expect(editor.result.current.record.journal).toBeNull();
        expect(editor.result.current.attempt?.status).toBe("success");
        expect(editor.result.current.running).toBe(false);
        await act(async () => { editor.result.current.resetAttempt(); });
        expect(editor.result.current.attempt).toBeNull();
        await act(async () => { editor.result.current.assign(0, coffee()); });
        expect(editor.result.current.operation).toBeNull();
    });

    it("deliberately opts into uncertain finish and records cancellation as cancelled, never success", async () => {
        const store = new SlotDatabase(createTestDatabase());
        const slot = snapshotRecipe(coffee());
        store.begin("one", {
            id: "attempt", serial: null, slots: [slot, slot, slot], frames: prepareSet([slot, slot, slot]),
            acknowledged: 0, inFlight: null, error: null
        });
        store.dispatching("one", "attempt", 0);
        store.acknowledge("one", "attempt", 0);
        store.dispatching("one", "attempt", 1);
        const acquire = jest.fn(async () => ({
            sendAndConfirm: async () => {}, confirmSaved: async () => {}, release: () => {}
        }));
        const editor = await renderHook(() => useEasyModeSlots(
            {deviceId: "one", serial: null}, {available: true, acquire}, store
        ));
        await act(async () => { await editor.result.current.recover(false); });
        expect(acquire).toHaveBeenCalledWith(
            {deviceId: "one", serial: null}, {restart: false, finishUncertain: true}
        );
        expect(editor.result.current.attempt?.status).toBe("success");
        await act(async () => {
            store.begin("one", {
                id: "cancel", serial: null, slots: [slot, slot, slot], frames: prepareSet([slot, slot, slot]),
                acknowledged: 0, inFlight: null, error: null
            });
        });
        acquire.mockImplementation(async () => ({
            restartFromBeginning: true,
            sendAndConfirm: async () => {}, confirmSaved: async () => {}, release: () => {}
        }));
        await act(async () => { await editor.result.current.cancel(); });
        expect(editor.result.current.attempt).toMatchObject({operation: "cancel", status: "cancelled"});
    });

    it("binds operation status and asynchronous failures to device and serial, not the current render", async () => {
        const store = new SlotDatabase(createTestDatabase());
        for (const index of [0, 1, 2] as const) store.assign("one", index, snapshotRecipe(coffee()));
        let reject!: (error: Error) => void;
        const acquire = () => new Promise<SlotLease>((_resolve, fail) => { reject = fail; });
        const editor = await renderHook<ReturnType<typeof useEasyModeSlots>, {deviceId: string; serial: string}>(({deviceId, serial}) => useEasyModeSlots(
            {deviceId, serial}, {available: true, acquire}, store
        ), {initialProps: {deviceId: "one", serial: "serial"}});
        let writing!: Promise<void>;
        await act(async () => { writing = editor.result.current.write(); });
        expect(editor.result.current.attempt?.status).toBe("writing");
        await editor.rerender({deviceId: "two", serial: "serial"});
        expect(editor.result.current.attempt).toBeNull();
        expect(editor.result.current.running).toBe(false);
        await act(async () => { reject(new Error("Link lost")); await writing; });
        expect(editor.result.current.error).toBeNull();
        await editor.rerender({deviceId: "one", serial: "another"});
        expect(editor.result.current.attempt).toBeNull();
        expect(editor.result.current.error).toBeNull();
        await editor.rerender({deviceId: "one", serial: "serial"});
        expect(editor.result.current.attempt?.status).toBe("error");
        expect(editor.result.current.error).toBe("Link lost");
    });
