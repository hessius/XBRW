import {act, renderHook} from "@testing-library/react-native";

import {useMachinePicker} from "@/hooks/useMachinePicker";
import {sharedSettings} from "@/hooks/useSetting";
import {FakeTransport} from "@/library/machine/__tests__/FakeTransport";
import Machine from "@/library/machine/Machine";
import {serialiseSavedMachines} from "@/library/machine/savedMachines";
import {coffee} from "@/library/slots/__tests__/fixtures";

const mockShared = jest.fn();
const mockSurvey = jest.fn(async () => []);

jest.mock("react-native-ble-manager", () => ({__esModule: true, default: {}}));
jest.mock("@/components/XbrwToast", () => ({notify: jest.fn()}));
jest.mock("@/hooks/useSetting", () =>
    jest.requireActual("@/test-utils/settingsMock").settingsMock());
jest.mock("@/hooks/useMachine", () => ({
    ...jest.requireActual("@/hooks/useMachine"),
    sharedMachine: () => mockShared(),
    latestSurvey: () => null,
    surveyMachines: () => mockSurvey()
}));

let machine: Machine;
let transport: FakeTransport;

beforeEach(() => {
    transport = new FakeTransport();
    machine = new Machine(transport, {frameGapMs: 0});
    mockShared.mockReset().mockReturnValue(machine);
    mockSurvey.mockClear();
    const settings = sharedSettings();
    settings.set("machineDeviceId", "HOME");
    settings.set("savedMachines", serialiseSavedMachines(["HOME", "WORK"].map(id => ({
        id, label: id, model: "studio", modelString: "", advertisedName: "", serial: ""
    }))));
});

it("does not construct Bluetooth while drawing a closed picker", async () => {
    await renderHook(() => useMachinePicker());

    expect(mockShared).not.toHaveBeenCalled();
});

it("updates connection status if the link drops while the picker is open", async () => {
    await machine.connect("HOME");
    const {result} = await renderHook(() => useMachinePicker());
    await act(async () => { result.current.show(); });
    expect(result.current.connected).toBe(true);

    await act(async () => { transport.drop(); });

    expect(result.current.connected).toBe(false);
});

it("locks the open picker when a brew starts", async () => {
    await machine.connect("HOME");
    const {result} = await renderHook(() => useMachinePicker());
    await act(async () => { result.current.show(); });
    expect(result.current.blocker).toBeNull();

    await act(async () => { await machine.brew(coffee()); });

    expect(result.current.blocker).toMatch(/A brew is running/);
});

it("unlocks rescan after the brew ends without reopening the picker", async () => {
    await machine.connect("HOME");
    await machine.brew(coffee());
    const {result} = await renderHook(() => useMachinePicker());
    await act(async () => { result.current.show(); });
    expect(mockSurvey).not.toHaveBeenCalled();

    await act(async () => { await machine.cancelBrew(); });

    expect(result.current.blocker).toBeNull();
    await act(async () => { result.current.rescan(); });
    expect(mockSurvey).toHaveBeenCalledTimes(1);
});
