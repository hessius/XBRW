import {Settings, type SettingsStorage} from "@/library/Settings";
import {
    activateSavedMachine,
    addAndActivateMachine,
    forgetSavedMachine,
    loadSavedMachines,
    recordSerial,
    rememberMachine,
    saveSavedMachines
} from "@/library/machine/savedMachineSettings";
import {updateSavedMachine, type SavedMachine} from "@/library/machine/savedMachines";

/** A storage backend that keeps everything in memory, and counts writes. */
function fakeStorage(seed: Record<string, unknown> = {}) {
    const map = new Map(Object.entries(seed).map(([key, value]) => [key, JSON.stringify(value)]));
    const writes: string[] = [];
    const storage: SettingsStorage = {
        read:  (key) => map.get(key) ?? null,
        write: (key, value) => {
            writes.push(key);
            map.set(key, value);
        }
    };
    return {storage, writes};
}

function entry(id: string, overrides: Partial<SavedMachine> = {}): SavedMachine {
    return {
        id, label: "", model: "studio", modelString: "", advertisedName: "", serial: "",
        ...overrides
    };
}

/** Somebody who paired one Studio before the list existed. */
function upgradedPhone() {
    const {storage, writes} = fakeStorage({
        machineDeviceId: "HOME", machineModel: "studio",
        machineModelString: "J15", machineName: "XBLOOM HOME"
    });
    return {settings: new Settings(storage), writes};
}

describe("an existing user upgrading", () => {
    it("keeps their machine as the default without anything being written", () => {
        const {settings, writes} = upgradedPhone();
        expect(loadSavedMachines(settings)).toEqual([entry("HOME", {
            modelString: "J15", advertisedName: "XBLOOM HOME"
        })]);
        expect(writes).toEqual([]);
        expect(settings.get("machineDeviceId")).toBe("HOME");
    });

    it("keeps their machine when it comes back under a new identifier", () => {
        // The stale-id rescan the single-machine path has always had.
        const {settings} = upgradedPhone();
        saveSavedMachines(settings, updateSavedMachine(loadSavedMachines(settings), "HOME", {label: "Home"}));
        rememberMachine(settings, "HOME-2");
        expect(loadSavedMachines(settings).map((machine) => [machine.id, machine.label]))
            .toEqual([["HOME-2", "Home"]]);
        expect(settings.get("machineDeviceId")).toBe("HOME-2");
    });
});

describe("pairing the first machine", () => {
    it("saves it with the model the user already chose", () => {
        const {storage} = fakeStorage({machineModel: "original"});
        const settings = new Settings(storage);
        rememberMachine(settings, "FIRST");
        expect(loadSavedMachines(settings)).toEqual([entry("FIRST", {model: "original"})]);
        expect(settings.get("machineDeviceId")).toBe("FIRST");
        expect(settings.get("machineModel")).toBe("original");
    });
});

describe("switching machines", () => {
    function homeAndWork() {
        const {settings} = upgradedPhone();
        addAndActivateMachine(settings, entry("WORK", {label: "Work", model: "original"}));
        return settings;
    }

    it("adds a second machine without renaming the first", () => {
        const settings = homeAndWork();
        expect(loadSavedMachines(settings).map((machine) => machine.id)).toEqual(["HOME", "WORK"]);
    });

    it("switches the model with the machine, both ways", () => {
        const settings = homeAndWork();
        expect(settings.get("machineDeviceId")).toBe("WORK");
        expect(settings.get("machineModel")).toBe("original");
        activateSavedMachine(settings, "HOME");
        expect(settings.get("machineModel")).toBe("studio");
        activateSavedMachine(settings, "WORK");
        expect(settings.get("machineModel")).toBe("original");
    });

    it("carries each machine's readings with it rather than leaving one machine's on another", () => {
        const settings = homeAndWork();
        // WORK is active and has said nothing yet.
        expect(settings.get("machineModelString")).toBe("");
        settings.set("machineModelString", "J15-W");
        activateSavedMachine(settings, "HOME");
        expect(settings.get("machineModelString")).toBe("J15");
        expect(loadSavedMachines(settings)[1].modelString).toBe("J15-W");
    });

    it("keeps a model chosen on the settings row with the machine it was chosen for", () => {
        const settings = homeAndWork();
        activateSavedMachine(settings, "HOME");
        settings.set("machineModel", "original");
        activateSavedMachine(settings, "WORK");
        activateSavedMachine(settings, "HOME");
        expect(settings.get("machineModel")).toBe("original");
    });

    it("pushes an edit to the active machine's model to the setting importers read", () => {
        const settings = homeAndWork();
        saveSavedMachines(settings, updateSavedMachine(loadSavedMachines(settings), "WORK", {model: "studio"}));
        expect(settings.get("machineModel")).toBe("studio");
    });

    it("will not activate a machine that is not saved", () => {
        const settings = homeAndWork();
        expect(activateSavedMachine(settings, "STRANGER")).toBe(false);
        expect(settings.get("machineDeviceId")).toBe("WORK");
    });
});

describe("forgetting", () => {
    it("hands the active machine's place to the new default, model included", () => {
        const {settings} = upgradedPhone();
        addAndActivateMachine(settings, entry("WORK", {model: "original"}));
        activateSavedMachine(settings, "HOME");
        expect(forgetSavedMachine(settings, "HOME")).toBe("WORK");
        expect(loadSavedMachines(settings).map((machine) => machine.id)).toEqual(["WORK"]);
        expect(settings.get("machineDeviceId")).toBe("WORK");
        expect(settings.get("machineModel")).toBe("original");
    });

    it("leaves the active machine alone when another is forgotten", () => {
        const {settings} = upgradedPhone();
        addAndActivateMachine(settings, entry("WORK"));
        activateSavedMachine(settings, "HOME");
        expect(forgetSavedMachine(settings, "WORK")).toBe("HOME");
        expect(loadSavedMachines(settings).map((machine) => machine.id)).toEqual(["HOME"]);
    });

    it("clears everything with the last one, readings too", () => {
        const {settings} = upgradedPhone();
        expect(forgetSavedMachine(settings, "HOME")).toBe("");
        expect(loadSavedMachines(settings)).toEqual([]);
        expect(settings.get("machineDeviceId")).toBe("");
        expect(settings.get("machineModelString")).toBe("");
        expect(settings.get("machineName")).toBe("");
        expect(settings.get("savedMachines")).toBe("");
    });
});

describe("serials", () => {
    it("keeps the serial against the machine it came from", () => {
        const {settings} = upgradedPhone();
        addAndActivateMachine(settings, entry("WORK"));
        recordSerial(settings, "HOME", "J15A01D48H051");
        expect(loadSavedMachines(settings).map((machine) => machine.serial)).toEqual(["J15A01D48H051", ""]);
    });

    it("does not rewrite the list for a serial it already has", () => {
        const {storage, writes} = fakeStorage({machineDeviceId: "HOME"});
        const settings = new Settings(storage);
        recordSerial(settings, "HOME", "S1");
        const after = writes.length;
        recordSerial(settings, "HOME", "S1");
        recordSerial(settings, "HOME", "  ");
        expect(writes.length).toBe(after);
    });
});
