/**
 * How a scan decides it has heard enough, against a scripted radio.
 *
 * The rest of the scan is a native radio and is not tested here, for the
 * reason `Transport.test.ts` gives. The timing rules on top of it are a
 * contract: stop at the machine wanted, wait a short while for it when only a
 * lower machine has answered, otherwise listen out the window, and leave no
 * timer behind.
 */
import BleManager, {type BleDiscoverPeripheralEvent} from "react-native-ble-manager";

import {SAVED_MACHINE_SETTLE_MS} from "@/constants/machine";
import {scanVerdict} from "@/library/machine/savedMachines";
import {BleTransport, type FoundMachine} from "@/library/machine/Transport";

let discover: ((peripheral: BleDiscoverPeripheralEvent) => void) | null = null;

jest.mock("react-native-ble-manager", () => ({
    __esModule: true,
    BleState: {
        Unknown: "unknown", Resetting: "resetting", Unsupported: "unsupported",
        Unauthorized: "unauthorized", On: "on", Off: "off",
        TurningOn: "turning_on", TurningOff: "turning_off"
    },
    default: {
        start: jest.fn().mockResolvedValue(undefined),
        checkState: jest.fn().mockResolvedValue("on"),
        scan: jest.fn().mockResolvedValue(undefined),
        stopScan: jest.fn().mockResolvedValue(undefined),
        onDiscoverPeripheral: jest.fn(),
        onDidUpdateState: jest.fn(() => ({remove: jest.fn()}))
    }
}));

const PRIORITY = ["home", "work", "cafe"];

function hear(id: string): void {
    discover?.({id, name: "XBLOOM", rssi: -60, advertising: {}} as BleDiscoverPeripheralEvent);
}

/** Start a scan and wait until the radio is listening. */
async function listening(seconds = 10): Promise<{result: Promise<FoundMachine[]>; done: () => boolean}> {
    let finished = false;
    const result = new BleTransport()
        .scan(seconds, (found) => scanVerdict(found, PRIORITY))
        .then((found) => { finished = true; return found; });
    await jest.advanceTimersByTimeAsync(0);
    return {result, done: () => finished};
}

beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    discover = null;
    (BleManager.onDiscoverPeripheral as jest.Mock).mockImplementation((callback) => {
        discover = callback;
        return {remove: jest.fn()};
    });
});

afterEach(() => {
    jest.useRealTimers();
});

it("stops the moment the default is heard", async () => {
    const scan = await listening();

    hear("cafe");
    hear("home");
    await jest.advanceTimersByTimeAsync(0);

    expect(scan.done()).toBe(true);
    expect((await scan.result).map((found) => found.id)).toEqual(["cafe", "home"]);
    expect(BleManager.stopScan).toHaveBeenCalled();
});

it("waits the settle time for the default when only a lower machine has answered", async () => {
    const scan = await listening();

    hear("work");
    await jest.advanceTimersByTimeAsync(SAVED_MACHINE_SETTLE_MS - 1);
    expect(scan.done()).toBe(false);
    await jest.advanceTimersByTimeAsync(1);

    expect(scan.done()).toBe(true);
    expect((await scan.result).map((found) => found.id)).toEqual(["work"]);
});

it("does not restart the settle time for each lower machine heard", async () => {
    const scan = await listening();

    hear("cafe");
    await jest.advanceTimersByTimeAsync(SAVED_MACHINE_SETTLE_MS - 500);
    hear("work");
    await jest.advanceTimersByTimeAsync(500);

    expect(scan.done()).toBe(true);
});

it("listens out the whole window when nothing saved answers", async () => {
    const scan = await listening(10);

    hear("someone-elses");
    await jest.advanceTimersByTimeAsync(10_000 - 1);
    expect(scan.done()).toBe(false);
    await jest.advanceTimersByTimeAsync(1);

    expect(scan.done()).toBe(true);
    expect((await scan.result).map((found) => found.id)).toEqual(["someone-elses"]);
});

it("clears the settle timer when the default ends the scan first", async () => {
    const scan = await listening();

    hear("work");
    hear("home");
    await scan.result;

    // Only the window's own timer is left, which the race in `scan` has
    // always left to run out harmlessly. The settle timer is gone.
    expect(jest.getTimerCount()).toBe(1);
});

it("keeps the signal strength it heard each machine at", async () => {
    const scan = await listening();

    hear("home");

    expect((await scan.result)[0].rssi).toBe(-60);
});
