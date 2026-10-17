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

    expect(result.current.error)
        .toBe("Connected to Home, not Work. Check the machine shown, then press BREW again.");
    // Nothing past the connect sequence was written: no recipe.
    expect(BREW_COMMANDS_SEEN(transport, connectOnly)).toEqual([]);
    // Not retried: one scan, one link.
    expect(transport.scans).toHaveLength(1);
});
