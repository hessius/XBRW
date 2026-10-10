import {SLOT_COMPLETION_MS, SLOT_DISPATCH_MS, SLOT_RECEIPT_MS} from "@/constants/machine";
import type Machine from "@/library/machine/Machine";
import type {SlotSession} from "@/library/machine/Machine";
import {MACHINE_STATE} from "@/library/machine/protocol";
import type {SlotDatabase} from "@/library/slots/SlotDatabase";
import type {SlotIndex} from "@/library/slots/slotModel";
import {sameBytes} from "@/library/slots/slotModel";
import type {SlotIdentity, SlotLease, SlotPort} from "@/library/slots/slotWriter";
import {SlotCommandRefused} from "@/library/slots/slotWriter";

class MachineSlotLease implements SlotLease {
    readonly restartFromBeginning: boolean;
    private failure: Error | null = null;
    private outstanding: SlotIndex | null = null;
    private received = false;
    private saved = false;
    private next: number;
    private released = false;
    private waiters = new Set<() => void>();
    private off: (() => void)[] = [];

    constructor(
        machine: Machine, private store: SlotDatabase, private identity: SlotIdentity,
        private session: SlotSession
    ) {
        this.restartFromBeginning = session.restartFromBeginning;
        this.next = this.restartFromBeginning ? 0 : store.read(identity.deviceId).journal?.acknowledged ?? 0;
        this.off.push(session.onInvalidated((error) => {
            this.failure = error;
            this.wake();
        }));
        this.off.push(machine.onNotification((parsed) => {
            if (this.failure !== null || this.released) return;
            if (parsed.kind === "receipt" && parsed.code === 11510) {
                if (parsed.status !== 0xC2) {
                    this.fail(this.outstanding !== null && !this.received
                        ? new SlotCommandRefused()
                        : new Error("The machine sent an unexpected reply. The write was not confirmed."));
                } else if (this.outstanding === null || this.received) {
                    this.fail(new Error("The machine sent an unexpected reply. The write was not confirmed."));
                } else {
                    this.received = true;
                    this.wake();
                }
            }
            if (parsed.kind === "status" && parsed.state === MACHINE_STATE.SLOTS_SAVED) {
                if (this.saved || !(this.next === 3
                    || (this.outstanding === 2 && this.received))) {
                    this.fail(new Error("The machine did not confirm the write in order. Please check its display."));
                } else {
                    this.saved = true;
                    this.wake();
                }
            }
        }));
    }

    private wake(): void { this.waiters.forEach((wake) => wake()); }

    private fail(error: Error): void {
        if (this.failure !== null) return;
        this.failure = error;
        this.session.invalidate(error);
        this.wake();
    }

    private check(): void {
        if (this.failure !== null) throw this.failure;
        if (this.released) throw new Error("The Easy Mode attempt has been released.");
        this.session.check();
    }

    assertCurrent(): void { this.check(); }

    validateFrames(frames: readonly (readonly number[])[]): void {
        this.check();
        this.session.validateFrames(frames);
    }

    private bounded(task: Promise<void> | (() => boolean), ms: number, message: string): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            const finish = (error?: Error) => {
                clearTimeout(timer);
                this.waiters.delete(wake);
                if (error !== undefined) reject(error);
                else resolve();
            };
            const wake = () => {
                if (this.failure !== null) finish(this.failure);
                else if (typeof task === "function" && task()) finish();
            };
            const timer = setTimeout(() => {
                const error = new Error(message);
                this.fail(error);
                finish(error);
            }, ms);
            timer.unref?.();
            this.waiters.add(wake);
            if (typeof task !== "function") {
                task.then(() => finish(this.failure ?? undefined), (error: unknown) => {
                    const failure = error instanceof Error ? error : new Error(String(error));
                    this.fail(failure);
                    finish(failure);
                });
            }
            wake();
        });
    }

    async sendAndConfirm(frame: Uint8Array, index: SlotIndex): Promise<void> {
        this.check();
        const journal = this.store.read(this.identity.deviceId).journal;
        if (index !== this.next || this.outstanding !== null || journal === null
            || journal.inFlight !== index || journal.acknowledged !== index
            || !sameBytes(Array.from(frame), journal.frames[index])) {
            const error = new Error("The Easy Mode frame does not match its durable dispatch boundary.");
            this.fail(error);
            throw error;
        }
        this.received = false;
        await this.bounded(this.session.send(frame.slice(), () => {
            this.check();
            this.outstanding = index;
        }), SLOT_DISPATCH_MS, "The write stopped before the machine confirmed it. Check the machine before retrying.");
        this.check();
        await this.bounded(() => this.received, SLOT_RECEIPT_MS,
            "The machine did not confirm this slot. Check its display before retrying.");
        this.check();
        this.outstanding = null;
        this.next = index + 1;
    }

    async confirmSaved(): Promise<void> {
        this.check();
        if (this.next !== 3 || this.outstanding !== null) {
            throw new Error("All three Easy Mode receipts are required before storage completion.");
        }
        await this.bounded(() => this.saved, SLOT_COMPLETION_MS,
            "The machine did not confirm that the slots were saved. Check its display before retrying.");
        this.check();
    }

    release(safe: boolean): void {
        if (this.released) return;
        this.session.release(safe);
        if (this.failure === null) {
            this.failure = new Error("The Easy Mode attempt has been released.");
            this.wake();
        }
        this.released = true;
        this.off.forEach((off) => off());
        this.off = [];
    }
}

export function installMachineSlotPort(machine: Machine, store: SlotDatabase): SlotPort {
    machine.installSlotDatabase(store);
    return {
        available: true,
        acquire: async (identity, options) => {
            // Synchronous exclusion and identity checks: never wait for a brew.
            const bound = Object.freeze({...identity});
            const session = machine.acquireSlotSession(bound, options);
            return new MachineSlotLease(machine, store, bound, session);
        }
    };
}
