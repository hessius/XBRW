/**
 * Failures that are about the phone's radio, not about the machine.
 *
 * Kept in a module of its own so that `Machine` and its tests can tell the two
 * apart without importing `Transport`, which pulls in the native Bluetooth
 * module and cannot be loaded under Jest.
 */
export class RadioUnavailableError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "RadioUnavailableError";
    }
}

/**
 * The radio is there, but this phone will not let the app use it.
 *
 * Separate from `RadioUnavailableError` because the remedy is different and,
 * on Android, there are two remedies. Refuse the system dialog twice and it
 * never appears again; after that the only way back is the app's own page in
 * Settings. `canOpenSettings` is what lets the UI offer that route instead of
 * asking again for something that can no longer be asked for.
 */
export class BluetoothPermissionError extends Error {
    readonly canOpenSettings: boolean;

    constructor(message: string, canOpenSettings: boolean) {
        super(message);
        this.name = "BluetoothPermissionError";
        this.canOpenSettings = canOpenSettings;
    }
}

export class SlotOperationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "SlotOperationError";
    }
}

/**
 * The brew connected, but not to the machine the screen named.
 *
 * With several machines saved, a connect picks by scan, and in a room where
 * the machine on screen is out of range it can land on another. A recipe must
 * not follow it there: the cup is under the machine the screen named, and the
 * dose would land in front of nobody. Nothing has been sent when this is thrown, and it
 * is not retried, because a retry would land in the same place.
 */
export class WrongMachineError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "WrongMachineError";
    }
}

/**
 * Several machines are saved, a scan listened for all of them, and none answered.
 *
 * Its own class because it is a finished answer rather than a flaky one. A
 * single remembered machine is connected to directly, and connecting to the
 * J15 fails often enough that retrying is the cure. A scan that heard nothing
 * for ten seconds has already listened for every saved machine at once, and
 * asking the same empty room again, as the brew path's relink would, only
 * doubles the wait before somebody is told.
 */
export class NoSavedMachineError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "NoSavedMachineError";
    }
}
