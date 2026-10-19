import {SLOT_COMPLETION_MS, SLOT_DISPATCH_MS, SLOT_RECEIPT_MS} from "@/constants/machine";
import type Machine from "@/library/machine/Machine";
import type {SlotSession} from "@/library/machine/Machine";
import {buildType1, MACHINE_STATE} from "@/library/machine/protocol";
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
    private recovering = false;
    private recoveryReceived = false;
    private recoveryNormal = false;
    private next: number;
    private released = false;
    private waiters = new Set<() => void>();
    private off: (() => void)[] = [];

    constructor(
        private machine: Machine, private store: SlotDatabase, private identity: SlotIdentity,
        private session: SlotSession
    ) {
        this.restartFromBeginning = session.restartFromBeginning;
        const journal = store.read(identity.deviceId).journal;
        // Explicit finish starts at the durable receipt, including observe-only at three.
        this.next = this.restartFromBeginning ? 0 : journal?.acknowledged ?? 0;
        this.off.push(session.onInvalidated((error) => {
            this.failure = error;
            this.wake();
        }));
        this.off.push(machine.onNotification((parsed) => {
            if (this.failure !== null || this.released) return;
            if (parsed.kind === "receipt" && parsed.code === 40526 && this.recovering) {
                if (parsed.status !== 0xC2) {
                    this.fail(new Error("The machine refused command 40526. The incomplete write is still retained."));
                } else if (this.recoveryReceived) {
                    this.fail(new Error("The machine sent a duplicate recovery reply. Check its display."));
                } else {
                    this.recoveryReceived = true;
                    this.wake();
                }
            }
            if (this.recovering && parsed.kind === "status") {
                this.recoveryNormal = this.machine.slotStateIsNormal;
                this.wake();
            }
            if (!this.recovering && parsed.kind === "receipt" && parsed.code === 11510) {
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
            if (!this.recovering && parsed.kind === "status" && parsed.state === MACHINE_STATE.SLOTS_SAVED) {
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

    isKnownNormal(): boolean {
        this.check();
        return this.machine.slotStateIsNormal;
    }

    async confirmRecovered(): Promise<void> {
        this.check();
        if (!this.recovering || !this.recoveryReceived) throw new Error("Recovery has not been acknowledged.");
        await this.bounded(() => this.recoveryNormal && this.machine.slotStateIsNormal,
            SLOT_COMPLETION_MS, "The machine has not returned to normal. Retry or wait for its saving screen to clear.");
        this.check();
    }

    validateFrames(frames: readonly (readonly number[])[]): void {
        this.check();
        this.session.validateFrames(frames);
        const longTea = frames.some(frame => {
            if ((frame[11] & 0x0E) !== 0x0C) return false;
            for (let at = 13; at < 13 + frame[12]; at += 8) {
                const seconds = ((256 - frame[at + 4]) & 255) + (frame[at + 5] >>> 5) * 60;
                if (seconds > 120) return true;
            }
            return false;
        });
        if (longTea) {
            const version = /^V(\d+)\.(\d+)D\.(\d+)$/.exec(this.machine.info?.firmware ?? "");
            const supported = version !== null && (Number(version[1]) > 12
                || (Number(version[1]) === 12 && (Number(version[2]) > 0 || Number(version[3]) >= 400)));
            if (!supported) {
                throw new Error("Tea steeps longer than 120 seconds need machine firmware V12.0D.400 or newer.");
            }
        }
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

    async sendRecoveryCommand(): Promise<{stateBefore: number | null; stateAfter: number | null}> {
        this.check();
        const record = this.store.read(this.identity.deviceId);
        if (this.recovering || this.outstanding !== null || record.journal === null
            || record.journal.acknowledged !== this.next) {
            throw new Error("Recovery requires the current incomplete slot write.");
        }
        if (this.machine.state !== MACHINE_STATE.SAVING_SLOTS) {
            throw new Error("Wait for a known saving or normal machine state before recovery.");
        }
        const stateBefore = this.machine.state;
        await this.bounded(this.session.send(buildType1(40526), () => {
            this.check();
            if (this.machine.state !== MACHINE_STATE.SAVING_SLOTS) {
                throw new Error("Wait for a known saving or normal machine state before recovery.");
            }
            this.recovering = true;
        }), SLOT_DISPATCH_MS, "Command 40526 did not finish sending. Reconnect before another operation.");
        this.check();
        await this.bounded(() => this.recoveryReceived, SLOT_RECEIPT_MS,
            "No reply to command 40526. The incomplete write is still retained.");
        this.check();
        return {stateBefore, stateAfter: this.machine.state};
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
