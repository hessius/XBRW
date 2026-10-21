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
import {__resetSharedMachine, chooseMachine} from "@/hooks/useMachine";
import {sharedSettings} from "@/hooks/useSetting";
import {FakeTransport, machineInfoFrame} from "@/library/machine/__tests__/FakeTransport";
import {status} from "@/library/machine/__tests__/protocolFixtures";
import {NoSavedMachineError, WrongMachineError} from "@/library/machine/errors";
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
    const refused = jest.fn();

    await act(async () => { await result.current.brew(coffee(), undefined, refused); });

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
    expect(refused).toHaveBeenCalledWith(expect.any(WrongMachineError));
});

it("does not relink over a manual selection made during brew discovery", async () => {
    const transport = new FakeTransport();
    const machine = new Machine(transport, {frameGapMs: 0});
    let finishScan: (found: {id: string; name: string}[]) => void = () => {
        throw new Error("The scan has not started");
    };
    const scan = jest.spyOn(machine, "scan").mockImplementationOnce(
        () => new Promise(resolve => { finishScan = resolve; })
    );
    const disconnect = jest.spyOn(machine, "disconnect");
    const {result} = await renderHook(() => useBrew(machine));
    const refused = jest.fn();

    await act(async () => {
        const brewing = result.current.brew(coffee(), undefined, refused);
        for (let index = 0; index < 10; index++) await Promise.resolve();
        expect(scan).toHaveBeenCalledTimes(1);
        await chooseMachine(machine, sharedSettings(), "HOME",
            async () => ({granted: true}), {wait: async () => {}});
        finishScan([{id: "HOME", name: "XBLOOM"}]);
        await brewing;
    });

    expect(transport.connectedTo).toBe("HOME");
    expect(sharedSettings().get("machineDeviceId")).toBe("HOME");
    expect(disconnect).not.toHaveBeenCalled();
    expect(refused).toHaveBeenCalledWith(expect.any(WrongMachineError));
    expect(result.current.error).toMatch(/selection changed/i);
});

it("retires the attempt when none of the saved machines is nearby", async () => {
    const transport = new FakeTransport();
    transport.devices = [{id: "STRANGER", name: "XBLOOM"}];
    const machine = new Machine(transport, {frameGapMs: 0});
    const {result} = await renderHook(() => useBrew(machine));
    const refused = jest.fn();

    await act(async () => { await result.current.brew(coffee(), undefined, refused); });

    expect(refused).toHaveBeenCalledWith(expect.any(NoSavedMachineError));
    expect(transport.connectedTo).toBeNull();
    expect(transport.scans).toHaveLength(1);
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

    it("checks a stranger's serial learned only during brew preflight", async () => {
        const connectOnly = await connectOnlyFrames();
        const transport = new FakeTransport();
        transport.refuseIds = ["HOME"];
        transport.devices = [{id: "STRANGER", name: "XBLOOM"}];
        transport.ignoreInfoRequests = 1;
        const machine = new Machine(transport, {frameGapMs: 0, infoWaitMs: 10});
        const {result} = await renderHook(() => useBrew(machine));
        const refused = jest.fn();

        await act(async () => { await result.current.brew(coffee(), undefined, refused); });

        expect(BREW_COMMANDS_SEEN(transport, connectOnly)).toEqual([]);
        expect(result.current.error).toMatch(/not your saved machine/);
        expect(refused).toHaveBeenCalledWith(expect.any(WrongMachineError));
        expect(transport.connectedTo).toBeNull();
        expect(sharedSettings().get("machineDeviceId")).toBe("HOME");
        expect(sharedSettings().get("savedMachines")).not.toContain("STRANGER");
    });

    it("checks the saved serial before any PRO retry command", async () => {
        const transport = new FakeTransport();
        const machine = new Machine(transport, {frameGapMs: 0});
        await machine.connect("STRANGER");
        transport.written = [];
        const {result} = await renderHook(() => useBrew(machine));
        const refused = jest.fn();

        await act(async () => { await result.current.switchToProAndRetry(coffee(), refused); });

        expect(transport.sent).toEqual([]);
        expect(result.current.error).toMatch(/not your saved machine/);
        expect(refused).toHaveBeenCalledWith(expect.any(WrongMachineError));
        expect(transport.connectedTo).toBeNull();
        expect(sharedSettings().get("machineDeviceId")).toBe("HOME");
    });

    it.each([null, status(0x0F)])(
        "verifies a late serial before clearing an earlier brew failure (home reply %j)",
        async (homeReply) => {
            const connectOnly = await connectOnlyFrames();
            const transport = new FakeTransport();
            transport.refuseIds = ["HOME"];
            transport.devices = [{id: "STRANGER", name: "XBLOOM"}];
            transport.ignoreInfoRequests = 1;
            transport.homeReply = homeReply;
            const machine = new Machine(transport, {frameGapMs: 0, infoWaitMs: 10});
            machine.phase = {name: "failed", reason: "noBeans"};
            const {result} = await renderHook(() => useBrew(machine));
            const refused = jest.fn();

            await act(async () => { await result.current.brew(coffee(), undefined, refused); });

            expect(BREW_COMMANDS_SEEN(transport, connectOnly)).toEqual([]);
            expect(refused).toHaveBeenCalledWith(expect.any(WrongMachineError));
            expect(result.current.error).toMatch(/not your saved machine/);
            expect(transport.connectedTo).toBeNull();
            expect(sharedSettings().get("machineDeviceId")).toBe("HOME");
        }
    );

    it("still clears an earlier failure after fresh vitals confirm the saved machine", async () => {
        const transport = new FakeTransport();
        transport.refuseIds = ["HOME"];
        transport.devices = [{id: "HOME-NEW-ID", name: "XBLOOM"}];
        transport.ignoreInfoRequests = 1;
        transport.infoReply = machineInfoFrame({serial: "J15HOME00001"});
        const machine = new Machine(transport, {frameGapMs: 0, infoWaitMs: 10});
        machine.phase = {name: "failed", reason: "noBeans"};
        const {result} = await renderHook(() => useBrew(machine));

        await act(async () => { await result.current.brew(coffee()); });

        expect(result.current.error).toBeNull();
        expect(transport.sent.filter(code => code === 40519)).toHaveLength(1);
        expect(transport.sent.indexOf(40519)).toBeLessThan(transport.sent.indexOf(8001));
        expect(transport.connectedTo).toBe("HOME-NEW-ID");
    });

    it("does not clear an earlier failure when the new link never supplies vitals", async () => {
        const transport = new FakeTransport();
        transport.infoReply = null;
        const machine = new Machine(transport, {frameGapMs: 0, infoWaitMs: 10});
        machine.phase = {name: "failed", reason: "noBeans"};
        const {result} = await renderHook(() => useBrew(machine));

        await act(async () => { await result.current.brew(coffee()); });

        expect(transport.sent).not.toContain(40519);
        expect(transport.sent).not.toContain(8022);
        expect(transport.sent).not.toContain(8002);
        expect(machine.phase).toMatchObject({name: "failed", reason: "blocked", block: "noVitals"});
        expect(result.current.error).toMatch(/has not said/);
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
