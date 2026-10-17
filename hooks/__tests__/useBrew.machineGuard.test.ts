/**
 * The brew goes to the machine the screen named, or nowhere.
 *
 * With several machines saved, BREW's lazy connect picks by scan. The rule is
 * that the machine on screen wins when it is in range, and the guard in
 * `useBrew.attempt` is the hard backstop: if the link lands anywhere else,
 * nothing is sent.
 */
import {act, renderHook} from "@testing-library/react-native";

import {useBrew} from "@/hooks/useBrew";
import {__resetSharedMachine} from "@/hooks/useMachine";
import {sharedSettings} from "@/hooks/useSetting";
import {FakeTransport} from "@/library/machine/__tests__/FakeTransport";
import Machine from "@/library/machine/Machine";
import {serialiseSavedMachines, type SavedMachine} from "@/library/machine/savedMachines";
import {DEFAULTS} from "@/library/Settings";
import {coffee} from "@/library/slots/__tests__/fixtures";

jest.mock("@/components/XbrwToast", () => ({notify: jest.fn()}));
jest.mock("@/hooks/useSetting", () =>
    require("@/test-utils/settingsMock").settingsMock());
// The real permission check reaches for the native module.
jest.mock("@/library/machine/Transport", () => ({
    ...jest.requireActual("@/library/machine/Transport"),
    ensureBluetoothPermission: async () => ({granted: true})
}));

function entry(id: string, label: string): SavedMachine {
    return {id, label, model: "studio", modelString: "", advertisedName: "", serial: ""};
}


/** The recipe command; anything else written is the connect sequence. */
const BREW_COMMANDS_SEEN = (transport: FakeTransport, connectOnly: number[]) =>
    transport.sent.filter((code) => !connectOnly.includes(code));

async function connectOnlyFrames(): Promise<number[]> {
    const transport = new FakeTransport();
    transport.devices = [{id: "X", name: "XBLOOM"}];
    await new Machine(transport, {frameGapMs: 0}).connect("X");
    return [...new Set(transport.sent)];
}

beforeEach(() => {
    __resetSharedMachine();
    const settings = sharedSettings();
    for (const key of ["machineDeviceId", "machineModel", "machineModelString",
                       "machineName", "savedMachines", "machineAutoStart"] as const) {
        settings.set(key, DEFAULTS[key]);
    }
    // Home is the default; the screen names Work.
    settings.set("savedMachines", serialiseSavedMachines([entry("HOME", "Home"), entry("WORK", "Work")]));
    settings.set("machineDeviceId", "WORK");
});

it("goes to the machine on screen when it is in range, though it ranks below another that is too", async () => {
    const connectOnly = await connectOnlyFrames();
    const transport = new FakeTransport();
    transport.devices = [{id: "HOME", name: "XBLOOM"}, {id: "WORK", name: "XBLOOM"}];
    const machine = new Machine(transport, {frameGapMs: 0});
    const {result} = await renderHook(() => useBrew(machine));

    await act(async () => { await result.current.brew(coffee()); });

    expect(transport.connectedTo).toBe("WORK");
    expect(result.current.error).toBeNull();
    // The recipe went, to Work.
    expect(BREW_COMMANDS_SEEN(transport, connectOnly).length).toBeGreaterThan(0);
});

it("refuses to send, and says why, when the connect lands on a machine the screen did not name", async () => {
    const connectOnly = await connectOnlyFrames();
    const transport = new FakeTransport();
    // Work, the machine on screen, is out of range; Home is heard.
    transport.devices = [{id: "HOME", name: "XBLOOM"}];
    const machine = new Machine(transport, {frameGapMs: 0});
    const {result} = await renderHook(() => useBrew(machine));

    await act(async () => { await result.current.brew(coffee()); });

    expect(result.current.error).toBe(
        "Found Home, not Work, so nothing was sent. Check Work is on and nearby, or pick Home, then press BREW again."
    );
    // Nothing past the connect sequence was written: no recipe.
    expect(BREW_COMMANDS_SEEN(transport, connectOnly)).toEqual([]);
    // Not retried: one scan, one link.
    expect(transport.scans).toHaveLength(1);
    // The screen goes on naming Work, and the link to Home is let go.
    expect(sharedSettings().get("machineDeviceId")).toBe("WORK");
    expect(transport.connectedTo).toBeNull();
});

describe("one machine saved", () => {
    beforeEach(() => {
        sharedSettings().set("savedMachines", serialiseSavedMachines([
            {...entry("HOME", "Home"), serial: "J15HOME00001"}
        ]));
        sharedSettings().set("machineDeviceId", "HOME");
    });

    it("refuses a stranger's machine found by the stale-id rescan, by its serial", async () => {
        const connectOnly = await connectOnlyFrames();
        const transport = new FakeTransport();
        // Home's id has gone stale; the rescan hears somebody else's xBloom,
        // whose serial (the fake's) is not Home's.
        transport.refuseIds = ["HOME"];
        transport.devices = [{id: "STRANGER", name: "XBLOOM"}];
        const machine = new Machine(transport, {frameGapMs: 0});
        const {result} = await renderHook(() => useBrew(machine));

        await act(async () => { await result.current.brew(coffee()); });

        expect(result.current.error).toBe(
            "This xBloom is not your saved machine (serial ending 0001), so nothing was sent. "
            + "Check yours is on and nearby, then press BREW again."
        );
        expect(BREW_COMMANDS_SEEN(transport, connectOnly)).toEqual([]);
        // The saved machine still names Home, with Home's serial.
        expect(sharedSettings().get("machineDeviceId")).toBe("HOME");
        expect(sharedSettings().get("savedMachines")).toContain("J15HOME00001");
        expect(sharedSettings().get("savedMachines")).not.toContain("STRANGER");
    });

    it("still brews when the rescan finds the same machine under a new id", async () => {
        sharedSettings().set("savedMachines", serialiseSavedMachines([
            {...entry("HOME", "Home"), serial: "J15ABC123456"}
        ]));
        const connectOnly = await connectOnlyFrames();
        const transport = new FakeTransport();
        transport.refuseIds = ["HOME"];
        transport.devices = [{id: "HOME-NEW-ID", name: "XBLOOM"}];
        const machine = new Machine(transport, {frameGapMs: 0});
        const {result} = await renderHook(() => useBrew(machine));

        await act(async () => { await result.current.brew(coffee()); });

        expect(result.current.error).toBeNull();
        expect(BREW_COMMANDS_SEEN(transport, connectOnly).length).toBeGreaterThan(0);
        expect(sharedSettings().get("machineDeviceId")).toBe("HOME-NEW-ID");
    });
});
