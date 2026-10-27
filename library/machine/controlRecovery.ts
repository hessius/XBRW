import type {ControlRecovery} from "./controlModel";
import {ControlOperationError} from "./errors";

/** Synchronous and phone-local; never part of a portable backup. */
export interface ControlRecoveryStorage {
    read(): string;
    write(value: string): void;
}

export type ControlTerminalProof = ControlRecovery & {qualifiedTerminal: boolean};
export type ControlRecoverySnapshot = Readonly<{
    marker: Readonly<ControlRecovery> | null;
    error: ControlOperationError | null;
}>;

export function parseControlRecovery(value: string): ControlRecovery | null {
    if (value === "") return null;
    try {
        const row = JSON.parse(value);
        if (row === null || typeof row !== "object" || Array.isArray(row)
            || Object.keys(row).sort().join(",") !== "deviceId,serial,tool,version"
            || row.version !== 1 || typeof row.deviceId !== "string"
            || row.deviceId.trim() === "" || row.deviceId.trim() !== row.deviceId
            || (row.serial !== null && typeof row.serial !== "string")
            || (row.tool !== "grind" && row.tool !== "pour")) throw new Error();
        return {version: 1, deviceId: row.deviceId, serial: row.serial, tool: row.tool};
    } catch {
        throw new ControlOperationError("The machine control recovery marker is invalid. Machine use is blocked.");
    }
}

function storageError(error: unknown): ControlOperationError {
    return new ControlOperationError(
        `Could not persist machine control recovery: ${error instanceof Error ? error.message : "storage failed"}. Machine use is blocked.`
    );
}

export class ControlRecoveryStore {
    private current: ControlRecoverySnapshot;
    private listeners = new Set<() => void>();

    constructor(private readonly storage: ControlRecoveryStorage) {
        try {
            const marker = parseControlRecovery(storage.read());
            this.current = Object.freeze({marker: marker && Object.freeze(marker), error: null});
        } catch (error) {
            this.current = Object.freeze({
                marker: null,
                error: error instanceof ControlOperationError ? error : storageError(error)
            });
        }
    }

    get snapshot(): ControlRecoverySnapshot { return this.current; }

    get blocker(): ControlOperationError | null {
        return this.current.error ?? (this.current.marker === null ? null
            : new ControlOperationError("An uncertain machine control operation needs recovery before using the machine."));
    }

    subscribe(listener: () => void): () => void {
        this.listeners.add(listener);
        return () => { this.listeners.delete(listener); };
    }

    /** Must complete before the controller dispatches anything that could start a motor or water. */
    reserve(marker: ControlRecovery): void {
        if (this.blocker !== null) throw this.blocker;
        const valid = parseControlRecovery(JSON.stringify(marker));
        if (valid === null) throw new ControlOperationError("A recovery marker is required.");
        this.persist(valid);
    }

    /** Qualification of the terminal observation belongs to the future, qualified controller. */
    clear(proof: ControlTerminalProof): void {
        const marker = this.current.marker;
        if (marker === null || proof.qualifiedTerminal !== true || proof.version !== 1
            || marker.deviceId !== proof.deviceId || marker.serial !== proof.serial || marker.tool !== proof.tool) {
            throw new ControlOperationError("Matching qualified terminal proof is required to clear control recovery.");
        }
        this.persist(null);
    }

    private persist(marker: ControlRecovery | null): void {
        try {
            this.storage.write(marker === null ? "" : JSON.stringify(marker));
        } catch (error) {
            // A throwing write may have reached disk. Retain the conservative
            // marker in memory too, including when a clear failed.
            this.current = Object.freeze({
                marker: marker === null ? this.current.marker : Object.freeze({...marker}),
                error: storageError(error)
            });
            this.listeners.forEach((listener) => listener());
            throw this.current.error;
        }
        this.current = Object.freeze({marker: marker && Object.freeze({...marker}), error: null});
        this.listeners.forEach((listener) => listener());
    }
}
