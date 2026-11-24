import type MachineControls from "./MachineControls";
import type {ControlIdentity, ControlSnapshot, GrindRequest, PourRequest} from "./controlModel";

export const MAX_SCALE_SAMPLES = 12;

export type ControlDraftState = Readonly<{
    identityKey: string | null;
    grind: GrindRequest | null;
    pour: PourRequest | null;
    scaleIdentityKey: string | null;
    scaleSamples: readonly number[];
}>;

const EMPTY_SAMPLES: readonly number[] = Object.freeze([]);
const INITIAL_STATE: ControlDraftState = Object.freeze({
    identityKey: null,
    grind: null,
    pour: null,
    scaleIdentityKey: null,
    scaleSamples: EMPTY_SAMPLES
});

function keyFor(identity: ControlIdentity | null): string | null {
    if (!identity) return null;
    return `${identity.deviceId}\0${identity.serial ?? ""}`;
}

export class ControlDraftStore {
    private state: ControlDraftState = INITIAL_STATE;
    private listeners = new Set<() => void>();
    private hasLastCup = false;
    private lastCupRaw: number | null = null;

    constructor(controls: MachineControls) {
        this.syncSnapshot(controls.getSnapshot());
        controls.subscribe(() => {
            this.syncSnapshot(controls.getSnapshot());
        });
    }

    getSnapshot = (): ControlDraftState => this.state;

    subscribe = (listener: () => void): (() => void) => {
        this.listeners.add(listener);
        return () => { this.listeners.delete(listener); };
    };

    private commit(next: ControlDraftState): void {
        if (next === this.state) return;
        this.state = next;
        this.listeners.forEach(listener => listener());
    }

    setGrind(identity: ControlIdentity, request: GrindRequest): void {
        const identityKey = keyFor(identity);
        const same = this.state.identityKey === identityKey;
        const captured = Object.freeze({...request});
        this.commit(Object.freeze({
            identityKey,
            grind: captured,
            pour: same ? this.state.pour : null,
            scaleIdentityKey: this.state.scaleIdentityKey,
            scaleSamples: this.state.scaleSamples
        }));
    }

    setPour(identity: ControlIdentity, request: PourRequest): void {
        const identityKey = keyFor(identity);
        const same = this.state.identityKey === identityKey;
        const captured = Object.freeze({...request});
        this.commit(Object.freeze({
            identityKey,
            grind: same ? this.state.grind : null,
            pour: captured,
            scaleIdentityKey: this.state.scaleIdentityKey,
            scaleSamples: this.state.scaleSamples
        }));
    }

    private syncSnapshot(snapshot: ControlSnapshot): void {
        const snapKey = keyFor(snapshot.identity);
        let next = this.state;

        // Clear cached drafts if the active machine identity changed to a different device/serial.
        if (snapKey !== null && next.identityKey !== null && snapKey !== next.identityKey) {
            next = {
                ...next,
                identityKey: null,
                grind: null,
                pour: null
            };
        }

        const scaleActive = snapshot.tool === "scale" && snapshot.phase !== "closed";
        if (!scaleActive || snapshot.cupGrams === null || !Number.isFinite(snapshot.cupGrams)) {
            this.hasLastCup = false;
            this.lastCupRaw = null;
            if (next.scaleSamples.length > 0 || next.scaleIdentityKey !== null) {
                next = {
                    ...next,
                    scaleIdentityKey: null,
                    scaleSamples: EMPTY_SAMPLES
                };
            }
        } else if (!this.hasLastCup || snapshot.cupGrams !== this.lastCupRaw || snapKey !== next.scaleIdentityKey) {
            this.hasLastCup = true;
            this.lastCupRaw = snapshot.cupGrams;
            const rounded = Math.round(snapshot.cupGrams * 10) / 10;
            const normalized = rounded === 0 ? 0 : rounded;
            const base = snapKey === next.scaleIdentityKey ? next.scaleSamples : EMPTY_SAMPLES;
            const updated = Object.freeze([...base.slice(-(MAX_SCALE_SAMPLES - 1)), normalized]);
            next = {
                ...next,
                scaleIdentityKey: snapKey,
                scaleSamples: updated
            };
        }

        if (next !== this.state) {
            this.commit(Object.freeze(next));
        }
    }
}

const stores = new WeakMap<MachineControls, ControlDraftStore>();

export function draftStoreFor(controls: MachineControls): ControlDraftStore {
    let store = stores.get(controls);
    if (!store) {
        store = new ControlDraftStore(controls);
        stores.set(controls, store);
    }
    return store;
}
