import type Machine from "./Machine";
import type {ControlSession} from "./Machine";
import {lookupControlCapabilities} from "./controlCapabilities";
import {
    type ControlIdentity, type ControlSnapshot, type GrindRequest, type PourRequest, type ToolId,
    type Pattern, type SettingId, type SettingValues,
    validateGrindRequest, validatePourRequest, validateSetting
} from "./controlModel";
import type {ControlCommand, ControlFeedback, ControlQualification, ControlTokens} from "./controlProtocol";

export type MachineControlsOptions = {qualifications?: readonly ControlQualification[]};
let nextSession = 0;
const initial: ControlSnapshot = {
    identity: null, tool: null, phase: "closed", error: null, cupGrams: null, dispensedMl: null,
    grindRequest: null, pourRequest: null, temperatureC: null, pattern: null,
    pendingTemperatureC: null, pendingPattern: null, settings: null, applyingSetting: null
};
type Waiter = {
    tokens: ControlTokens;
    receive: (value: ControlFeedback["value"]) => void;
    reject: (error: Error) => void;
};
function failure(error: unknown): Error {
    return error instanceof Error ? error : new Error("Machine control failed.");
}

function matchesProposal(command: ControlCommand, value: ControlFeedback["value"]): boolean {
    if (command.kind === "temperature") return value.kind === "temperature" && value.celsius === command.celsius;
    if (command.kind === "pattern") return value.kind === "pattern" && value.pattern === command.pattern;
    if (command.kind === "setting") return value.kind === "settings" && value.readings[command.id] === command.value;
    return true;
}

function capture({profile: p, protocol}: ControlQualification): ControlQualification {
    const number = (rule: {min: number; max: number; step: number}) => Object.freeze({...rule});
    return Object.freeze({
        profile: Object.freeze({
            ...p, models: Object.freeze([...p.models]), firmwares: Object.freeze([...p.firmwares]),
            serials: Object.freeze([...p.serials]),
            grind: p.grind && Object.freeze({grindSize: number(p.grind.grindSize), rpm: number(p.grind.rpm)}),
            pour: p.pour && Object.freeze({
                temperatureC: number(p.pour.temperatureC), flowMlPerSecond: number(p.pour.flowMlPerSecond),
                volumeMl: p.pour.volumeMl && number(p.pour.volumeMl),
                patterns: Object.freeze([...p.pour.patterns]), modes: Object.freeze([...p.pour.modes])
            }),
            settings: Object.freeze({
                temperatureUnit: p.settings.temperatureUnit && Object.freeze([...p.settings.temperatureUnit]),
                weightUnit: p.settings.weightUnit && Object.freeze([...p.settings.weightUnit]),
                waterSource: p.settings.waterSource && Object.freeze([...p.settings.waterSource]),
                brightness: p.settings.brightness && number(p.settings.brightness),
                pourRadius: p.settings.pourRadius && number(p.settings.pourRadius),
                vibrationAmplitude: p.settings.vibrationAmplitude && number(p.settings.vibrationAmplitude)
            })
        }),
        protocol: Object.freeze({
            plan: protocol.plan.bind(protocol), decode: protocol.decode.bind(protocol),
            actualWaterSource: protocol.actualWaterSource.bind(protocol), telemetryFreshMs: protocol.telemetryFreshMs
        })
    });
}

/** One shared owner, above route lifetimes. Unsubscribing a view never releases it. */
export default class MachineControls {
    private snapshot: ControlSnapshot = Object.freeze({...initial});
    private listeners = new Set<() => void>();
    private lease: ControlSession | null = null;
    private qualification: ControlQualification | null = null;
    private session = 0;
    private transaction = 0;
    private waiter: Waiter | null = null;
    private run: ControlTokens | null = null;
    private off: (() => void)[] = [];
    private writeTail: Promise<void> = Promise.resolve();
    private epoch = 0;
    private stopping: Promise<void> | null = null;
    private opening: Promise<ControlFeedback["value"]> | null = null;
    private recovering = false;
    private recoveryOnly = false;
    private contextInvalid = false;
    private clearing = false;
    private liveTail: Promise<void> = Promise.resolve();
    private telemetry: ControlTokens | null = null;
    private freshness = new Map<"cupGrams" | "dispensedMl", ReturnType<typeof setTimeout>>();
    private readonly qualifications: readonly ControlQualification[];

    constructor(private readonly machine: Machine, options: MachineControlsOptions = {}) {
        this.qualifications = Object.freeze((options.qualifications ?? []).map(capture));
    }

    getSnapshot = (): ControlSnapshot => this.snapshot;
    subscribe = (listener: () => void): (() => void) => {
        this.listeners.add(listener);
        return () => { this.listeners.delete(listener); };
    };

    private update(patch: Partial<ControlSnapshot>): void {
        if (Object.entries(patch).every(([key, value]) => this.snapshot[key as keyof ControlSnapshot] === value)) return;
        this.snapshot = Object.freeze({...this.snapshot, ...patch});
        this.listeners.forEach((listener) => listener());
    }

    private select(): ControlQualification {
        const info = this.machine.info;
        const selected = lookupControlCapabilities({
            model: info?.model ?? null, firmware: info?.firmware ?? null, serial: info?.serial ?? null
        }, this.qualifications.map((q) => q.profile));
        if (!selected.available) throw new Error(`Controls unavailable: ${selected.reason}`);
        const qualification = this.qualifications.find((q) => q.profile === selected.profile)!;
        return qualification;
    }

    private attach(
        callerIdentity: ControlIdentity, purpose: ToolId | "setting" | "recovery", replacement?: ControlSession
    ): void {
        const identity = Object.freeze({...callerIdentity});
        if (replacement) this.lease = replacement;
        this.qualification = this.select();
        const protocol = this.qualification.protocol;
        const ms = protocol.telemetryFreshMs;
        if (ms !== undefined && (!Number.isFinite(ms) || ms <= 0)) throw new Error("Invalid qualified telemetry freshness.");
        const lease = replacement ?? this.machine.acquireControlSession(identity, purpose);
        this.lease = lease;
        this.contextInvalid = false;
        const session = this.session = ++nextSession;
        const invalidate = (error: Error) => {
            this.contextInvalid = true;
            this.uncertain(error);
        };
        this.off.push(lease.onInvalidated(invalidate));
        this.off.push(this.machine.onLink(() => {
            if (this.lease !== lease || this.contextInvalid || this.clearing) return;
            try {
                lease.check();
                if (this.select() !== this.qualification) throw new Error("The qualified machine identity changed.");
            } catch (error) {
                invalidate(failure(error));
            }
        }));
        this.off.push(this.machine.onFrame((direction, frame, parsed) => {
            if (direction !== "received" || this.lease !== lease || this.session !== session || this.contextInvalid) return;
            try {
                lease.check();
                // Frame logging precedes Machine's info update. Reject an
                // identity-changing info frame before decoding its proof.
                if (parsed.kind === "info" && (parsed.serial.trim() !== identity.serial
                    || !this.qualification!.profile.models.includes(parsed.model)
                    || !this.qualification!.profile.firmwares.includes(parsed.firmware))) {
                    invalidate(new Error("The qualified machine identity changed."));
                    return;
                }
                const event = protocol.decode(frame);
                if (!event || event.session !== this.session) return;
                if (event.value.kind === "cup" || event.value.kind === "dispensed") {
                    this.sample(event);
                    return;
                }
                if (this.run?.transaction === event.transaction && event.value.kind === "terminal") {
                    this.terminal();
                    return;
                }
                if (this.run?.transaction === event.transaction
                    && ["ready", "closed", "refused"].includes(event.value.kind)) {
                    this.uncertain(new Error("Contradictory operation feedback requires terminal proof."));
                    return;
                }
                if (this.waiter?.tokens.transaction === event.transaction) this.waiter.receive(event.value);
            } catch (error) {
                this.uncertain(failure(error));
            }
        }));
    }

    private uncertain(error: Error): void {
        this.waiter?.reject(error);
        this.clearFreshness();
        this.update({phase: "unknown", error: error.message, cupGrams: null, dispensedMl: null});
    }

    private release(): void {
        this.clearFreshness();
        this.off.splice(0).forEach((off) => off());
        const lease = this.lease;
        this.lease = null;
        lease?.release();
    }

    private terminal(): void {
        const {identity, tool} = this.snapshot;
        if (!identity || (tool !== "grind" && tool !== "pour")) throw new Error("No matching moving operation.");
        this.clearing = true;
        try {
            this.lease!.clearRecovery({version: 1, ...identity, tool, qualifiedTerminal: true});
        } finally {
            this.clearing = false;
        }
        ++this.epoch;
        this.waiter?.reject(new Error("Control transaction cancelled by terminal proof."));
        this.run = null;
        if (this.recoveryOnly) {
            this.release();
            this.update({...initial});
        } else this.update({phase: "ready", error: null, pendingTemperatureC: null, pendingPattern: null});
    }

    private sample(event: ControlFeedback): void {
        const {value} = event;
        if (value.kind === "cup") {
            if ((event.transaction !== this.telemetry?.transaction && event.transaction !== this.run?.transaction)
                || !Number.isFinite(value.grams)) return;
            this.update({cupGrams: value.grams});
            this.expire("cupGrams");
        } else if (value.kind === "dispensed") {
            if (event.transaction !== this.run?.transaction || !Number.isFinite(value.ml) || value.ml < 0) return;
            this.update({dispensedMl: value.ml});
            this.expire("dispensedMl");
        }
    }

    private expire(field: "cupGrams" | "dispensedMl"): void {
        clearTimeout(this.freshness.get(field));
        const ms = this.qualification?.protocol.telemetryFreshMs;
        if (ms === undefined) return;
        this.freshness.set(field, setTimeout(() => {
            this.freshness.delete(field);
            this.update({[field]: null});
        }, ms));
    }

    private clearFreshness(): void {
        this.freshness.forEach(clearTimeout);
        this.freshness.clear();
    }

    private async exchange(
        command: ControlCommand,
        expected: ControlFeedback["value"]["kind"] | readonly ControlFeedback["value"]["kind"][]
    ): Promise<ControlFeedback["value"]> {
        if (!this.lease || !this.qualification) throw new Error("No control session.");
        if (this.contextInvalid) throw new Error("The control context needs reconciliation.");
        this.lease.check();
        const tokens = Object.freeze({session: this.session, transaction: ++this.transaction});
        const plan = this.qualification.protocol.plan(command, tokens);
        if (!Number.isFinite(plan.deadlineMs) || plan.deadlineMs <= 0) throw new Error("A qualified deadline is required.");
        if (this.recoveryOnly && command.kind === "inspect" && (plan.frame !== null || !plan.refreshInfo)) {
            throw new Error("Recovery inspection must use leased info only.");
        }
        let timer: ReturnType<typeof setTimeout>;
        let armed = false;
        let dispatched = false;
        let cancelled = false;
        // A resolved response can still be contradicted before native settlement.
        let transactionFailure: Error | null = null;
        const timeout = new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new Error("Qualified control response missing.")), plan.deadlineMs);
        });
        const response = new Promise<ControlFeedback["value"]>((resolve, reject) => {
            const fail = (error: Error) => {
                transactionFailure ??= error;
                reject(error);
            };
            this.waiter = {
                tokens, reject: fail,
                receive: (value) => {
                    if (!armed) {
                        if (dispatched && value.kind === "refused") fail(new Error(value.reason));
                        return;
                    }
                    if (!(typeof expected === "string" ? value.kind === expected : expected.includes(value.kind))) {
                        fail(new Error(value.kind === "refused" ? value.reason : "Contradictory control feedback."));
                    } else if (!matchesProposal(command, value)) {
                        fail(new Error("Control readback does not match the proposal."));
                    } else resolve(value);
                }
            };
        });
        // A notification or deadline may reject while the native write is pending.
        void response.catch(() => {});
        try {
            const lease = this.lease;
            const epoch = this.epoch;
            const sending = this.writeTail.then(async () => {
                const checkCurrent = () => {
                    if (transactionFailure) throw transactionFailure;
                    if (cancelled || epoch !== this.epoch || this.contextInvalid) throw new Error("Control transaction cancelled.");
                };
                checkCurrent();
                const dispatch = () => {
                    checkCurrent();
                    if (command.kind === "pour") {
                        lease.assertPourPreflight(this.qualification!.protocol.actualWaterSource(this.machine.info, this.machine.infoAt));
                    }
                    if (command.kind === "grind" || command.kind === "pour") lease.reserve();
                    if (command.kind === "pour") {
                        lease.assertPourPreflight(this.qualification!.protocol.actualWaterSource(this.machine.info, this.machine.infoAt));
                    }
                    checkCurrent();
                    if (command.kind === "grind" || command.kind === "pour") this.run = tokens;
                    if (command.kind === "enter") this.telemetry = tokens;
                    dispatched = true;
                    armed = !plan.refreshInfo;
                };
                if (plan.frame !== null) {
                    if (command.kind === "stop") await lease.sendStop(plan.frame, dispatch, checkCurrent);
                    else await lease.send(plan.frame, dispatch, checkCurrent);
                }
                checkCurrent();
                if (plan.refreshInfo) {
                    const answered = await lease.refreshInfo(() => {
                        checkCurrent();
                        if (!dispatched && command.kind === "enter") this.telemetry = tokens;
                        dispatched = true;
                        armed = true;
                    }, checkCurrent);
                    if (!answered) throw new Error("Qualified info refresh did not succeed.");
                }
            });
            this.writeTail = sending.then(() => {}, () => {});
            const [, result] = await Promise.race([Promise.all([sending, response]), timeout]);
            if (transactionFailure) throw transactionFailure;
            return result;
        } finally {
            cancelled = true;
            clearTimeout(timer!);
            if (this.waiter?.tokens === tokens) this.waiter = null;
        }
    }

    async open(identity: ControlIdentity, tool: ToolId): Promise<void> {
        const current = this.snapshot;
        if (current.phase !== "closed") {
            if (current.identity?.deviceId === identity.deviceId && current.identity.serial === identity.serial
                && current.tool === tool && current.phase !== "leaving" && current.phase !== "applying") {
                if (current.phase === "entering" && this.opening) await this.opening;
                return;
            }
            throw new Error("A control session is already owned.");
        }
        const {profile} = this.select();
        if ((tool === "grind" && !profile.grind) || (tool === "pour" && !profile.pour)) throw new Error("Tool unsupported.");
        this.attach(identity, tool);
        this.recoveryOnly = false;
        this.opening = Promise.resolve().then(() => this.exchange({kind: "enter", tool}, "ready"));
        this.update({...initial, identity: Object.freeze({...identity}), tool, phase: "entering"});
        try {
            await this.opening;
            this.update({phase: "ready"});
        } catch (error) {
            this.uncertain(failure(error));
            throw error;
        } finally {
            this.opening = null;
        }
    }

    async startGrind(request: GrindRequest): Promise<void> {
        if (this.snapshot.phase !== "ready" || this.snapshot.tool !== "grind") throw new Error("Grind is not ready.");
        const captured = Object.freeze({...request});
        validateGrindRequest(captured, this.qualification!.profile.grind);
        const epoch = this.epoch;
        this.update({phase: "starting", grindRequest: captured, dispensedMl: null});
        try {
            if (epoch !== this.epoch) throw new Error("Control transaction cancelled.");
            await this.exchange({kind: "grind", request: captured}, "running");
            if (epoch === this.epoch && this.getSnapshot().phase === "starting") this.update({phase: "running"});
        } catch (error) {
            if (epoch === this.epoch) this.startFailed(failure(error));
            throw error;
        }
    }
    async startPour(request: PourRequest): Promise<void> {
        if (this.snapshot.phase !== "ready" || this.snapshot.tool !== "pour") throw new Error("Pour is not ready.");
        const captured = Object.freeze({...request});
        validatePourRequest(captured, this.qualification!.profile.pour);
        const epoch = this.epoch;
        this.update({phase: "starting", pourRequest: captured, dispensedMl: null});
        try {
            if (epoch !== this.epoch) throw new Error("Control transaction cancelled.");
            await this.exchange({kind: "pour", request: captured}, "running");
            if (epoch === this.epoch && this.getSnapshot().phase === "starting") {
                this.update({phase: "running", temperatureC: captured.temperatureC, pattern: captured.pattern});
            }
        } catch (error) {
            if (epoch === this.epoch) this.startFailed(failure(error));
            throw error;
        }

    }

    private startFailed(error: Error): void {
        if (this.contextInvalid || this.machine.controlRecovery?.marker) this.uncertain(error);
        else {
            this.run = null;
            this.update({phase: "ready", error: error.message});
        }
    }

    stop(): Promise<void> {
        if (this.stopping) return this.stopping;
        const notDispatched = this.snapshot.phase === "starting" && !this.machine.controlRecovery?.marker;
        if (!this.lease || (!notDispatched && !this.machine.controlRecovery?.marker)
            || !["starting", "running", "unknown"].includes(this.snapshot.phase)) {
            return Promise.reject(new Error("No owned moving operation to stop."));
        }
        ++this.epoch;
        this.waiter?.reject(new Error("Control transaction cancelled by Stop."));
        const operation = async () => {
            try {
                if (notDispatched) {
                    await this.writeTail;
                    this.lease!.check();
                    this.update({phase: "ready", error: null});
                    return;
                }
                await this.exchange({kind: "stop", tool: this.snapshot.tool}, "terminal");
                if (this.machine.controlRecovery?.marker) this.terminal();
            } catch (error) {
                if (!this.machine.controlRecovery?.marker && ["ready", "closed"].includes(this.snapshot.phase)) return;
                this.uncertain(failure(error));
                throw error;
            } finally {
                this.stopping = null;
            }
        };
        this.stopping = Promise.resolve().then(operation);
        this.update({phase: "stopping", pendingPattern: null, pendingTemperatureC: null});
        return this.stopping;
    }

    async tare(): Promise<void> {
        if (this.snapshot.phase !== "ready" || this.snapshot.tool !== "scale") throw new Error("Scale is not ready.");
        this.update({phase: "applying", error: null});
        try {
            await this.exchange({kind: "tare"}, "tared");
            this.update({phase: "ready"});
        } catch (error) {
            this.uncertain(failure(error));
            throw error;
        }
    }

    async setTemperature(celsius: number): Promise<void> {
        this.assertLive();
        validatePourRequest({...this.snapshot.pourRequest!, temperatureC: celsius}, this.qualification!.profile.pour);
        this.update({pendingTemperatureC: celsius});
        await this.live({kind: "temperature", celsius});
    }

    async setPattern(pattern: Pattern): Promise<void> {
        this.assertLive();
        validatePourRequest({...this.snapshot.pourRequest!, pattern}, this.qualification!.profile.pour);
        this.update({pendingPattern: pattern});
        await this.live({kind: "pattern", pattern});
    }

    private assertLive(): void {
        if (this.recoveryOnly || this.snapshot.tool !== "pour" || this.snapshot.phase !== "running"
            || !this.snapshot.pourRequest) throw new Error("Live pour controls are unavailable.");
    }

    private live(command: Extract<ControlCommand, {kind: "temperature" | "pattern"}>): Promise<void> {
        const epoch = this.epoch;
        const operation = this.liveTail.then(async () => {
            if (epoch !== this.epoch) throw new Error("Live control cancelled.");
            this.assertLive();
            try {
                const result = await this.exchange(command, command.kind);
                if (epoch !== this.epoch) throw new Error("Live control cancelled.");
                if (command.kind === "temperature" && result.kind === "temperature" && result.celsius === command.celsius) {
                    this.update({temperatureC: result.celsius,
                        pendingTemperatureC: this.snapshot.pendingTemperatureC === result.celsius ? null : this.snapshot.pendingTemperatureC});
                } else if (command.kind === "pattern" && result.kind === "pattern" && result.pattern === command.pattern) {
                    this.update({pattern: result.pattern,
                        pendingPattern: this.snapshot.pendingPattern === result.pattern ? null : this.snapshot.pendingPattern});
                } else throw new Error("Control readback does not match the proposal.");
            } catch (error) {
                if (epoch === this.epoch) this.uncertain(failure(error));
                throw error;
            }
        });
        this.liveTail = operation.then(() => {}, () => {});
        return operation;
    }

    async applySetting<K extends SettingId>(identity: ControlIdentity, id: K, value: SettingValues[K]): Promise<void> {
        if (this.snapshot.phase !== "closed") throw new Error("Settings require a closed control session.");
        const qualification = this.select();
        validateSetting(id, value, qualification.profile.settings);
        this.attach(identity, "setting");
        this.recoveryOnly = false;
        this.update({...initial, identity: Object.freeze({...identity}), phase: "applying", applyingSetting: id});
        try {
            const current = await this.exchange({kind: "inspect", tool: null}, "settings");
            if (current.kind !== "settings" || current.readings[id] === null) throw new Error("Qualified current setting unavailable.");
            this.update({settings: Object.freeze({...current.readings})});
            // TS cannot retain the correlation between a generic key and its
            // value when constructing the mapped command union.
            const command = {kind: "setting", id, value} as Extract<ControlCommand, {kind: "setting"}>;
            const result = await this.exchange(command, "settings");
            if (result.kind !== "settings" || result.readings[id] !== value) throw new Error("Setting readback does not match the proposal.");
            this.release();
            this.update({phase: "closed", applyingSetting: null, error: null, settings: Object.freeze({...result.readings})});
        } catch (error) {
            this.uncertain(failure(error));
            throw error;
        }
    }

    /** Never re-enters a tool. A moving recovery remains Stop-only until proof. */
    async recover(): Promise<void> {
        if (this.recovering || this.stopping || !["closed", "unknown"].includes(this.snapshot.phase)) {
            throw new Error("Control reconciliation is unavailable.");
        }
        const marker = this.machine.controlRecovery?.marker;
        const identity = marker ?? this.snapshot.identity;
        if (!identity) throw new Error("No control identity to reconcile.");
        this.recovering = true;
        ++this.epoch;
        this.waiter?.reject(new Error("Control transaction cancelled for reconciliation."));
        try {
            await this.writeTail;
            this.select();
            const actual = this.machine.slotIdentity;
            if (!actual || actual.deviceId !== identity.deviceId || actual.serial !== identity.serial) {
                throw new Error("Reconciliation requires the exact connected device and serial.");
            }
            this.recoveryOnly = marker != null;
            if (marker || this.contextInvalid || !this.lease) {
                const replacement = this.lease?.reacquireForRecovery();
                this.release();
                this.attach(identity, marker ? "recovery" : this.snapshot.tool ?? "setting", replacement);
            } else this.lease.check();
            this.update({identity: Object.freeze({deviceId: identity.deviceId, serial: identity.serial}),
                tool: marker?.tool ?? this.snapshot.tool, phase: "unknown"});
            const settings = !marker && this.snapshot.applyingSetting !== null;
            const result = await this.exchange({kind: "inspect", tool: this.snapshot.tool, recovery: marker != null},
                marker ? ["terminal", "active"] : settings ? "settings" : ["terminal", "closed", "active"]);
            if (result.kind === "active") {
                if (!marker) throw new Error("Unexpected active nonmoving control. Reconciliation required.");
                this.update({phase: "unknown", error: "The recovered operation is active. Stop is required."});
            } else if (marker) {
                if (result.kind !== "terminal") throw new Error("Qualified terminal proof is required for moving recovery.");
                this.terminal();
            } else {
                this.release();
                this.update({...initial, settings: result.kind === "settings" ? Object.freeze({...result.readings}) : null});
            }
        } catch (error) {
            this.uncertain(failure(error));
            throw error;
        } finally {
            this.recovering = false;
        }
    }

    async close(): Promise<void> {
        if (this.snapshot.phase === "closed") return;
        if (this.snapshot.phase !== "ready") throw new Error("Cannot close an uncertain or active control.");
        this.update({phase: "leaving"});
        try {
            await this.exchange({kind: "exit", tool: this.snapshot.tool}, "closed");
            this.release();
            this.update({...initial});
        } catch (error) {
            this.uncertain(failure(error));
            throw error;
        }
    }
}
