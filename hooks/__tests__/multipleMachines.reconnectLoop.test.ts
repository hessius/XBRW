/**
 * One connection per selection, on a machine whose firmware sends the short
 * info frame.
 *
 * Reported 2026-10-19 on a second saved Studio (firmware V12.0D.210): the app
 * connected to it again and again, beeping each time, the serial never stuck
 * and the brew screen sat on "Waking up machine". The machine's 55-byte info
 * payload was parsed as a plain event, so `info` stayed null: every BREW was
 * refused as `noVitals`, and `useBrew` dropped the link and connected again.
 */
import {act, renderHook} from "@testing-library/react-native";

import {useBrew} from "@/hooks/useBrew";
import {
    __resetSharedMachine,
    chooseMachine,
    holdLinkAcrossAppState
} from "@/hooks/useMachine";
import {useSavedMachines} from "@/hooks/useSavedMachines";
import {sharedSettings} from "@/hooks/useSetting";
import {FakeTransport, olderFirmwareInfoFrame} from "@/library/machine/__tests__/FakeTransport";
import Machine from "@/library/machine/Machine";
import {modelFromSerial} from "@/library/machine/machineModel";
import {loadSavedMachines, recordSerial} from "@/library/machine/savedMachineSettings";
import {serialiseSavedMachines, type SavedMachine} from "@/library/machine/savedMachines";
import {DEFAULTS, type Settings} from "@/library/Settings";
import {coffee} from "@/library/slots/__tests__/fixtures";

jest.mock("@/components/XbrwToast", () => ({notify: jest.fn()}));
jest.mock("@/hooks/useSetting", () =>
    require("@/test-utils/settingsMock").settingsMock());
jest.mock("@/library/machine/Transport", () => ({
    ...jest.requireActual("@/library/machine/Transport"),
    ensureBluetoothPermission: async () => ({granted: true})
}));

const granted = async () => ({granted: true} as const);
const instant = {wait: async () => {}};

function entry(id: string, label: string, serial = ""): SavedMachine {
    return {id, label, model: "studio", modelString: "", advertisedName: "", serial};
}

function settings(): Settings {
    return sharedSettings() as unknown as Settings;
}

/** Home is saved first with its serial known; Work, just added, has none yet. */
beforeEach(() => {
    __resetSharedMachine();
    const store = settings();
    for (const key of ["machineDeviceId", "machineModel", "machineModelString",
                       "machineName", "savedMachines", "machineAutoStart"] as const) {
        store.set(key, DEFAULTS[key]);
    }
    store.set("savedMachines", serialiseSavedMachines([
        entry("HOME", "Home", "J15A02A45H051"), entry("WORK", "Work")
    ]));
    store.set("machineDeviceId", "WORK");
});

/** Work, answering every info request with the short frame. */
function work() {
    const transport = new FakeTransport();
    transport.devices = [{id: "HOME", name: "XBLOOM"}, {id: "WORK", name: "XBLOOM 48G023"}];
    transport.infoReply = olderFirmwareInfoFrame();
    const connects = jest.spyOn(transport, "connect");
    const disconnects = jest.spyOn(transport, "disconnect");
    const machine = new Machine(transport, {frameGapMs: 0, infoWaitMs: 5});
    return {transport, machine, connects, disconnects};
}

it("takes the info frame after connect without dropping or reopening the link", async () => {
    const {transport, machine, connects, disconnects} = work();
    await chooseMachine(machine, settings(), "WORK", granted, instant);

    // The machine repeats itself while connected; none of it moves the link.
    for (let i = 0; i < 3; i++) transport.emit(olderFirmwareInfoFrame());
    await act(async () => {});

    expect(machine.info?.serial).toBe("J15A01D48G023");
    expect(connects).toHaveBeenCalledTimes(1);
    expect(disconnects).not.toHaveBeenCalled();
    expect(transport.connectedTo).toBe("WORK");
});

it("brews on the second machine over the one link it already has", async () => {
    const {transport, machine, connects, disconnects} = work();
    const {result} = await renderHook(() => useBrew(machine));

    await act(async () => { await result.current.brew(coffee()); });

    expect(result.current.error).toBeNull();
    expect(connects).toHaveBeenCalledTimes(1);
    expect(disconnects).not.toHaveBeenCalled();
    expect(transport.connectedTo).toBe("WORK");
});

it("saves the machine record while connected without touching the link", async () => {
    const {transport, machine, connects, disconnects} = work();
    await chooseMachine(machine, settings(), "WORK", granted, instant);
    const {result} = await renderHook(() => useSavedMachines());

    await act(async () => {
        result.current.rename("WORK", "Office");
        result.current.setColour("WORK", 2);
        result.current.setModel("WORK", "studio");
    });
    // The serial again, as every later connect reports it: nothing differs,
    // so nothing is written.
    const set = jest.spyOn(settings(), "set");
    recordSerial(settings(), "WORK", "J15A01D48G023");
    expect(set).not.toHaveBeenCalled();
    set.mockRestore();

    expect(connects).toHaveBeenCalledTimes(1);
    expect(disconnects).not.toHaveBeenCalled();
    expect(transport.connectedTo).toBe("WORK");
    expect(loadSavedMachines(settings()).find((saved) => saved.id === "WORK")?.label).toBe("Office");
});

it("keeps the serial on the second machine, not the first, and its model then needs no choice", async () => {
    const {machine} = work();
    await chooseMachine(machine, settings(), "WORK", granted, instant);

    const [home, office] = loadSavedMachines(settings());
    expect(office.id).toBe("WORK");
    expect(office.serial).toBe("J15A01D48G023");
    expect(home.serial).toBe("J15A02A45H051");
    // What the detail sheet checks before it drops the Studio/Original choice.
    expect(modelFromSerial(office.serial)).toBe(office.model);
});

it("lets go of the link only for an explicit switch or the app going away", async () => {
    const {transport, machine, connects, disconnects} = work();
    await chooseMachine(machine, settings(), "WORK", granted, instant);
    // Asking how it is doing, as Settings and the home panel do on connect.
    await machine.askHowItIsDoing();
    transport.emit(olderFirmwareInfoFrame());
    expect(disconnects).not.toHaveBeenCalled();

    await chooseMachine(machine, settings(), "HOME", granted, instant);
    expect(disconnects).toHaveBeenCalledTimes(1);
    expect(connects).toHaveBeenCalledTimes(2);
    expect(transport.connectedTo).toBe("HOME");

    const handlers = new Set<(state: string) => void>();
    const stop = holdLinkAcrossAppState(machine, async () => {}, {
        appState: {
            currentState: "active",
            addEventListener: (_type, handler) => {
                handlers.add(handler);
                return {remove: () => handlers.delete(handler)};
            }
        }
    });
    handlers.forEach((handler) => handler("background"));
    await act(async () => {});
    stop();

    expect(disconnects).toHaveBeenCalledTimes(2);
    expect(connects).toHaveBeenCalledTimes(2);
});
