import {act, renderHook} from "@testing-library/react-native";

import {
    addMachine,
    chooseMachine,
    exclusiveScan,
    findUnsavedMachines,
    openLink,
    settingsStore,
    surveyMachines,
    latestSurvey,
    useMachine,
    __resetSharedMachine
} from "@/hooks/useMachine";
import {FakeTransport, machineInfoFrame} from "@/library/machine/__tests__/FakeTransport";
import Machine from "@/library/machine/Machine";
import {ControlOperationError, NoSavedMachineError} from "@/library/machine/errors";
import {forgetSavedMachine, loadSavedMachines} from "@/library/machine/savedMachineSettings";
import {serialiseSavedMachines, type SavedMachine} from "@/library/machine/savedMachines";
import {Settings, type SettingsStorage} from "@/library/Settings";
import {ControlRecoveryStore} from "@/library/machine/controlRecovery";

// `library/machine/Transport` (imported by the hook) builds a BleManager
// singleton at module load, which throws under Jest. These tests inject a
// fake transport and never touch the real radio.
jest.mock("react-native-ble-manager", () => ({__esModule: true, default: {}}));

const granted = async () => ({granted: true} as const);
const instant = {wait: async () => {}};

function memory(seed: Record<string, unknown>): Settings {
    const map = new Map(Object.entries(seed).map(([key, value]) => [key, JSON.stringify(value)]));
    const storage: SettingsStorage = {
        read:  (key) => map.get(key) ?? null,
        write: (key, value) => { map.set(key, value); }
    };
    return new Settings(storage);
}

function entry(id: string, overrides: Partial<SavedMachine> = {}): SavedMachine {
    return {
        id, label: id, model: "studio", modelString: "", advertisedName: "", serial: "",
        ...overrides
    };
}

/** Five saved machines. `bar-2` is an Original; the rest are Studios. */
function cafe(): Settings {
    return memory({
        machineDeviceId: "bar-1",
        machineModel: "studio",
        savedMachines: serialiseSavedMachines([
            entry("bar-1"), entry("bar-2", {model: "original"}), entry("window"),
            entry("back"), entry("spare")
        ])
    });
}

function heard(...ids: string[]) {
    return ids.map((id) => ({id, name: "XBLOOM"}));
}

function rig(settings: Settings, devices: {id: string; name: string}[]) {
    const transport = new FakeTransport();
    transport.devices = devices;
    const machine = new Machine(transport, {frameGapMs: 0});
    return {transport, machine, store: settingsStore(settings)};
}

beforeEach(() => __resetSharedMachine());

it("pins reconnects to the recovery device without a scan or fallback to a saved candidate", async () => {
    const settings = cafe();
    const {transport, machine, store} = rig(settings, heard("bar-1", "bar-2"));
    machine.installControlRecovery(new ControlRecoveryStore({
        read: () => JSON.stringify({version: 1, deviceId: "missing", serial: null, tool: "grind"}),
        write: () => {}
    }));
    transport.refuseIds = ["missing"];
    await expect(openLink(machine, store, granted, {...instant, delays: [0]})).rejects.toThrow();
    expect(transport.scans).toHaveLength(0);
    expect(transport.connectedTo).toBeNull();
    transport.refuseIds = [];
    await openLink(machine, store, granted, {...instant, delays: [0]});
    expect(transport.connectedTo).toBe("missing");
    expect(transport.scans).toHaveLength(0);
});

it("does not scan or connect at all when recovery storage is malformed", async () => {
    const {transport, machine, store} = rig(cafe(), heard("bar-1", "bar-2"));
    machine.installControlRecovery(new ControlRecoveryStore({read: () => "?", write: () => {}}));
    await expect(openLink(machine, store, granted, instant)).rejects.toBeInstanceOf(ControlOperationError);
    expect(transport.connectedTo).toBeNull();
    expect(transport.scans).toHaveLength(0);
    expect(transport.sent).toEqual([]);
});

describe("one machine saved", () => {
    it("connects straight to it, with no scan, as it always has", async () => {
        const settings = memory({machineDeviceId: "HOME"});
        const {transport, machine, store} = rig(settings, heard("OTHER", "HOME"));

        await openLink(machine, store, granted, instant);

        expect(transport.connectedTo).toBe("HOME");
        expect(transport.scans).toHaveLength(0);
    });
});

describe("several machines saved, one scan", () => {
    it("with five saved and three nearby, the default not among them, connects to the highest nearby", async () => {
        const settings = cafe();
        const {transport, machine, store} = rig(settings, heard("spare", "window", "unsaved", "bar-2"));

        await openLink(machine, store, granted, instant);

        expect(transport.connectedTo).toBe("bar-2");
        expect(transport.scans).toHaveLength(1);
        // The scan was given the list to judge by, not left to stop at the
        // first xBloom it heard.
        expect(transport.scans[0]).toBeDefined();
        expect(settings.get("machineDeviceId")).toBe("bar-2");
    });

    it("switches the model with the machine it found", async () => {
        const settings = cafe();
        const {transport, machine, store} = rig(settings, heard("bar-2"));
        // An Original reports an Original's serial; a Studio's would set the
        // entry to the Studio, which is its own test in savedMachineSettings.
        transport.infoReply = machineInfoFrame({serial: "J20ABC123456"});

        await openLink(machine, store, granted, instant);

        expect(settings.get("machineModel")).toBe("original");
    });

    it("does not publish a connect's scan as the picker's survey, because it may have stopped early", async () => {
        const settings = cafe();
        const {machine, store} = rig(settings, heard("spare", "window", "bar-2"));

        await openLink(machine, store, granted, instant);

        expect(latestSurvey()).toBeNull();
    });

    it("prefers the machine in use when it is heard, though it ranks below another that is too", async () => {
        const settings = cafe();
        settings.set("machineDeviceId", "window");
        const {transport, machine, store} = rig(settings, heard("bar-1", "bar-2", "window"));

        await openLink(machine, store, granted, instant);

        expect(transport.connectedTo).toBe("window");
    });

    it("falls back to the order when the machine in use is not heard", async () => {
        const settings = cafe();
        settings.set("machineDeviceId", "window");
        const {transport, machine, store} = rig(settings, heard("back", "bar-2"));

        await openLink(machine, store, granted, instant);

        expect(transport.connectedTo).toBe("bar-2");
    });

    it("after losing a brew's link, reconnects to that machine only, though the default is heard", async () => {
        const settings = cafe();
        settings.set("machineDeviceId", "window");
        const {transport, machine, store} = rig(settings, heard("bar-1", "window"));
        machine.phase = {name: "lostContact"};

        await openLink(machine, store, granted, instant);

        expect(transport.connectedTo).toBe("window");
        expect(transport.scans).toHaveLength(0);
    });

    it("connects to the default when it is nearby, whatever else is", async () => {
        const settings = cafe();
        const {transport, machine, store} = rig(settings, heard("spare", "bar-1", "bar-2"));

        await openLink(machine, store, granted, instant);

        expect(transport.connectedTo).toBe("bar-1");
    });

    it("says so, connects to nothing and does not scan again when no saved machine is nearby", async () => {
        const settings = cafe();
        const {transport, machine, store} = rig(settings, heard("someone-elses"));

        await expect(openLink(machine, store, granted, instant)).rejects.toBeInstanceOf(NoSavedMachineError);

        expect(transport.connectedTo).toBeNull();
        expect(transport.scans).toHaveLength(1);
        expect(settings.get("machineDeviceId")).toBe("bar-1");
    });

    it("retries the machine it picked, and never wanders onto another", async () => {
        const settings = cafe();
        const {transport, machine, store} = rig(settings, heard("window", "back"));
        transport.refuseIds = ["window"];

        await expect(openLink(machine, store, granted, instant)).rejects.toThrow();

        expect(transport.connectedTo).toBeNull();
        // One priority scan; no stale-id rescan that could take "back".
        expect(transport.scans).toHaveLength(1);
        expect(settings.get("machineDeviceId")).toBe("bar-1");
    });

    it("keeps the serial the machine reported against it", async () => {
        const settings = cafe();
        const {machine, store} = rig(settings, heard("window"));

        await openLink(machine, store, granted, instant);

        const window = loadSavedMachines(settings).find((saved) => saved.id === "window");
        expect(window?.serial).toBe("J15ABC123456");
    });
});

describe("switching by hand", () => {
    it("does not resurrect an inactive machine forgotten while discovery was waiting", async () => {
        const settings = cafe();
        settings.set("machineDeviceId", "window");
        const {transport, machine, store} = rig(settings, heard("bar-1"));
        let finishScan: (found: {id: string; name: string}[]) => void = () => {
            throw new Error("The scan has not started");
        };
        const scan = jest.spyOn(machine, "scan").mockImplementationOnce(
            () => new Promise(resolve => { finishScan = resolve; })
        );
        const connecting = openLink(machine, store, granted, instant)
            .catch((error: unknown) => error);
        for (let index = 0; index < 10; index++) await Promise.resolve();
        expect(scan).toHaveBeenCalledTimes(1);

        forgetSavedMachine(settings, "bar-1");
        finishScan(heard("bar-1"));

        expect(await connecting).toBeInstanceOf(Error);
        expect(transport.connectedTo).toBeNull();
        expect(settings.get("machineDeviceId")).toBe("window");
        expect(loadSavedMachines(settings).some(saved => saved.id === "bar-1")).toBe(false);
    });

    it("keeps a manual choice made while an earlier connection is still scanning", async () => {
        const settings = cafe();
        const {transport, machine, store} = rig(settings, heard("window", "back"));
        let finishScan: (found: {id: string; name: string}[]) => void = () => {
            throw new Error("The scan has not started");
        };
        const scan = jest.spyOn(machine, "scan").mockImplementationOnce(
            () => new Promise(resolve => { finishScan = resolve; })
        );
        const connecting = openLink(machine, store, granted, instant)
            .catch((error: unknown) => error);
        for (let index = 0; index < 10; index++) await Promise.resolve();
        expect(scan).toHaveBeenCalledTimes(1);

        await chooseMachine(machine, settings, "back", granted, instant);
        finishScan(heard("window"));

        expect(await connecting).toBeInstanceOf(Error);
        expect(transport.connectedTo).toBe("back");
        expect(settings.get("machineDeviceId")).toBe("back");
    });

    it("drops the current link and connects to the one picked, model and all", async () => {
        const settings = cafe();
        const {transport, machine, store} = rig(settings, heard("bar-1", "bar-2"));
        await openLink(machine, store, granted, instant);
        expect(transport.connectedTo).toBe("bar-1");
        transport.infoReply = machineInfoFrame({serial: "J20ABC123456"});

        await chooseMachine(machine, settings, "bar-2", granted, instant);

        expect(transport.connectedTo).toBe("bar-2");
        expect(settings.get("machineDeviceId")).toBe("bar-2");
        expect(settings.get("machineModel")).toBe("original");
    });

    it("connects to the selected machine when a different machine is actually linked", async () => {
        const settings = cafe();
        const {transport, machine} = rig(settings, heard("bar-1", "bar-2"));
        await machine.connect("bar-2");
        expect(settings.get("machineDeviceId")).toBe("bar-1");
        expect(machine.linkedDeviceId).toBe("bar-2");

        await chooseMachine(machine, settings, "bar-1", granted, instant);

        expect(transport.connectedTo).toBe("bar-1");
        expect(machine.linkedDeviceId).toBe("bar-1");
        expect(settings.get("machineDeviceId")).toBe("bar-1");
    });

    it("leaves an already linked selected machine connected without another handshake", async () => {
        const settings = cafe();
        const {transport, machine, store} = rig(settings, heard("bar-1"));
        await openLink(machine, store, granted, instant);
        const disconnect = jest.spyOn(machine, "disconnect");
        const sent = [...transport.sent];

        await chooseMachine(machine, settings, "bar-1", granted, instant);

        expect(disconnect).not.toHaveBeenCalled();
        expect(transport.sent).toEqual(sent);
        expect(machine.linkedDeviceId).toBe("bar-1");
    });

    it("sends exactly what an ordinary connect sends, and no recipe", async () => {
        const plain = rig(memory({machineDeviceId: "bar-2"}), heard("bar-2"));
        await openLink(plain.machine, plain.store, granted, instant);

        const settings = cafe();
        const {transport, machine} = rig(settings, heard("bar-2"));
        await chooseMachine(machine, settings, "bar-2", granted, instant);

        expect(transport.sent).toEqual(plain.transport.sent);
    });

    it("goes back to the picked machine, not the default, when the link is restored", async () => {
        const settings = cafe();
        const {transport, machine, store} = rig(settings, heard("bar-1", "window"));
        await chooseMachine(machine, settings, "window", granted, instant);
        transport.drop();

        await openLink(machine, store, granted, instant);

        expect(transport.connectedTo).toBe("window");
        expect(transport.scans).toHaveLength(0);
    });

    it("refuses while a brew is running, and leaves the link and the setting alone", async () => {
        const settings = cafe();
        const {transport, machine, store} = rig(settings, heard("bar-1", "bar-2"));
        await openLink(machine, store, granted, instant);
        machine.phase = {name: "pouring", pour: 1, pours: 3};

        await expect(chooseMachine(machine, settings, "bar-2", granted, instant))
            .rejects.toThrow("A brew is running");

        expect(transport.connectedTo).toBe("bar-1");
        expect(settings.get("machineDeviceId")).toBe("bar-1");
    });

    it("refuses while the link is lost mid-brew, because the machine may still be brewing", async () => {
        const settings = cafe();
        const {machine} = rig(settings, heard("bar-2"));
        machine.phase = {name: "lostContact"};

        await expect(chooseMachine(machine, settings, "bar-2", granted, instant))
            .rejects.toThrow("A brew is running");
    });

    it("will not switch to a machine that is not saved", async () => {
        const settings = cafe();
        const {transport, machine} = rig(settings, heard("stranger"));

        await expect(chooseMachine(machine, settings, "stranger", granted, instant)).rejects.toThrow();

        expect(transport.connectedTo).toBeNull();
    });
});

describe("adding a machine", () => {
    it("offers only machines not saved yet, and picks none of them by itself", async () => {
        const settings = cafe();
        const {transport, machine} = rig(settings, heard("bar-1", "new-a", "new-b"));

        const found = await findUnsavedMachines(machine, settings, granted);

        expect(found.map((machineFound) => machineFound.id)).toEqual(["new-a", "new-b"]);
        expect(transport.connectedTo).toBeNull();
    });

    it("adds the one picked at the end of the order without renaming the one already saved", async () => {
        const settings = memory({machineDeviceId: "HOME", savedMachines: serialiseSavedMachines([
            entry("HOME", {label: "Home"})
        ])});
        const {transport, machine} = rig(settings, heard("HOME", "WORK"));

        await addMachine(machine, settings, "WORK", granted, instant);

        expect(transport.connectedTo).toBe("WORK");
        expect(loadSavedMachines(settings).map((saved) => [saved.id, saved.label]))
            .toEqual([["HOME", "Home"], ["WORK", ""]]);
        expect(settings.get("machineDeviceId")).toBe("WORK");
    });

    it("will not add a machine twice", async () => {
        const settings = cafe();
        const {machine} = rig(settings, heard("bar-1"));

        await expect(addMachine(machine, settings, "bar-1", granted, instant))
            .rejects.toThrow("already saved");
    });
});

describe("one scanner", () => {
    it("runs scans one after another, never two at once", async () => {
        let running = 0;
        let most = 0;
        const releases: (() => void)[] = [];
        const radio = {
            scan: () => new Promise<{id: string; name: string}[]>((resolve) => {
                running++;
                most = Math.max(most, running);
                releases.push(() => { running--; resolve([]); });
            })
        };

        const first = exclusiveScan(radio);
        const second = exclusiveScan(radio);
        for (let index = 0; index < 5; index++) await Promise.resolve();
        expect(releases).toHaveLength(1);
        releases[0]();
        await first;
        for (let index = 0; index < 5; index++) await Promise.resolve();
        expect(releases).toHaveLength(2);
        releases[1]();
        await second;

        expect(most).toBe(1);
    });

    it("lets the next scan run after one fails", async () => {
        let calls = 0;
        const radio = {
            scan: async () => {
                calls++;
                if (calls === 1) throw new Error("Bluetooth is off");
                return [];
            }
        };

        await expect(exclusiveScan(radio)).rejects.toThrow("Bluetooth is off");
        await expect(exclusiveScan(radio)).resolves.toEqual([]);
    });
});

describe("looking around for the picker", () => {
    it("hears every machine and connects to none", async () => {
        const settings = cafe();
        const {transport, machine} = rig(settings, heard("bar-2", "window", "back"));

        const found = await surveyMachines(machine);

        expect(found.map((machineFound) => machineFound.id)).toEqual(["bar-2", "window", "back"]);
        expect(transport.connectedTo).toBeNull();
        expect(transport.written).toEqual([]);
        expect(latestSurvey()?.heard.map((machineFound) => machineFound.id))
            .toEqual(["bar-2", "window", "back"]);
        void settings;
    });
});

describe("forgetting while a brew owns the link", () => {
    it("refuses to forget the machine in use mid-brew, and keeps the list as it was", async () => {
        const settings = cafe();
        const {machine} = rig(settings, heard("bar-1"));
        machine.phase = {name: "lostContact"};
        const {result} = await renderHook(() => useMachine(machine, {settings, ...instant}));

        let forgotten = true;
        await act(async () => { forgotten = await result.current.forgetMachine("bar-1"); });

        expect(forgotten).toBe(false);
        expect(settings.get("machineDeviceId")).toBe("bar-1");
        expect(loadSavedMachines(settings)).toHaveLength(5);
        expect(result.current.error).toMatch(/A brew is running/);
    });
});
