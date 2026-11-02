import {ControlRecoveryStore, parseControlRecovery} from "@/library/machine/controlRecovery";
import {ControlOperationError} from "@/library/machine/errors";
import {Settings, SqliteSettingsStorage} from "@/library/Settings";
import {appDatabase} from "@/library/appDatabase";

jest.mock("expo-sqlite", () => ({
    openDatabaseSync: () => jest.requireActual("@/test-utils/sqlite").createTestDatabase()
}));

const marker = {version: 1, deviceId: "one", serial: null, tool: "grind"} as const;

it("accepts only an empty value or an exact valid recovery marker", () => {
    expect(parseControlRecovery("")).toBeNull();
    expect(parseControlRecovery(JSON.stringify(marker))).toEqual(marker);
    for (const value of [
        " ", "broken", "null", "[]",
        JSON.stringify({...marker, version: 2}),
        JSON.stringify({...marker, deviceId: " "}),
        JSON.stringify({...marker, deviceId: " one"}),
        JSON.stringify({...marker, serial: 1}),
        JSON.stringify({...marker, tool: "scale"}),
        JSON.stringify({...marker, extra: true}),
    ]) expect(() => parseControlRecovery(value)).toThrow(ControlOperationError);
});

it("restores reservations synchronously and exposes malformed nonempty storage as blocked", () => {
    const restored = new ControlRecoveryStore({read: () => JSON.stringify(marker), write: () => {}});
    expect(restored.snapshot).toEqual({marker, error: null});
    const invalid = new ControlRecoveryStore({read: () => "{", write: () => {}});
    expect(invalid.snapshot.marker).toBeNull();
    expect(invalid.snapshot.error).toBeInstanceOf(ControlOperationError);
    expect(invalid.blocker).toBeInstanceOf(ControlOperationError);
});

it("persists before reserving, and only clears with matching qualified terminal proof", () => {
    let value = "";
    const store = new ControlRecoveryStore({read: () => value, write: (next) => { value = next; }});
    const changes = jest.fn();
    store.subscribe(changes);
    store.reserve(marker);
    expect(JSON.parse(value)).toEqual(marker);
    expect(() => store.clear({...marker, qualifiedTerminal: false})).toThrow(ControlOperationError);
    expect(() => store.clear({...marker, deviceId: "other", qualifiedTerminal: true})).toThrow(ControlOperationError);
    expect(store.snapshot.marker).toEqual(marker);
    store.clear({...marker, qualifiedTerminal: true});
    expect(value).toBe("");
    expect(store.blocker).toBeNull();
    expect(changes).toHaveBeenCalledTimes(2);
});

it("retains a visible exclusion on failed reserve or clear, including an ambiguous storage write", () => {
    let fail = true;
    let value = "";
    const store = new ControlRecoveryStore({
        read: () => value,
        write: (next) => { if (fail) throw new Error("disk full"); value = next; }
    });

    expect(() => store.reserve(marker)).toThrow(ControlOperationError);
    expect(store.blocker).toBeInstanceOf(ControlOperationError);
    expect(store.snapshot.marker).toEqual(marker);
    fail = false;
    store.clear({...marker, qualifiedTerminal: true});
    store.reserve(marker);
    fail = true;
    expect(() => store.clear({...marker, qualifiedTerminal: true})).toThrow(ControlOperationError);
    expect(store.snapshot.marker).toEqual(marker);
    expect(store.snapshot.error?.message).toContain("disk full");
    expect(JSON.parse(value)).toEqual(marker);
});

it("survives a real SQLite settings restart, and never treats corrupt nonempty storage as idle", () => {
    const settings = new Settings(new SqliteSettingsStorage());
    const port = {
        read: () => settings.get("machineControlRecovery"),
        write: (value: string) => settings.set("machineControlRecovery", value)
    };
    new ControlRecoveryStore(port).reserve(marker);
    const restartedSettings = new Settings(new SqliteSettingsStorage());
    expect(new ControlRecoveryStore({
        read: () => restartedSettings.get("machineControlRecovery"), write: port.write
    }).snapshot.marker).toEqual(marker);
    for (const raw of ["{", "7", "null", "{}"]) {
        appDatabase().runSync("UPDATE settings SET value = ? WHERE key = ?;",
            [raw, "machineControlRecovery"]);
        expect(new ControlRecoveryStore(port).blocker).toBeInstanceOf(ControlOperationError);
    }
});
