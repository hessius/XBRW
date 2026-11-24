import type Machine from "./Machine";
import {isActiveBrewPhase} from "./Machine";
import type {ControlSession} from "./Machine";
import {lookupControlCapabilities, resolveControlModel} from "./controlCapabilities";
import {
    type ControlIdentity, type ControlSnapshot, type GrindRequest, type PourRequest, type ToolId,
    type Pattern, type SettingId, type SettingReadings, type SettingValues, type GrindPolicy, type PourPolicy, type SettingPolicy,
    validateGrindRequest, validatePourRequest, validateSetting
} from "./controlModel";
import type {ControlCommand, ControlFeedback, ControlQualification, ControlTokens} from "./controlProtocol";
import {createProductionQualifications} from "./productionQualifications";

export type MachineControlsOptions = {
    qualifications?: readonly ControlQualification[];
    reconnect?: (target: string, check: () => void) => Promise<void>;
};
export type MachineToolSupport = Readonly<{
    grind: GrindPolicy | null;
    pour: PourPolicy | null;
    scale: boolean;
    liveTemperature: boolean;
    livePattern: boolean;
    bound: boolean;
    unavailable: string | null;
    stopUnavailable: string | null;
    recoverable: boolean;
    reconnectable: boolean;
}>;
export type MachineSettingsSupport = Readonly<{
    policy: SettingPolicy;
    unavailable: string | null;
    reason: "offline" | "identity-mismatch" | "unqualified" | "unsupported" | "owned" | null;
    reading: "current" | "last-known" | "unavailable";
    readingReason: "offline" | "identity-mismatch" | "unqualified" | "unsupported" | "owned"
        | "missing-readback" | "stale-readback" | null;
    recoverable: boolean;
    reconnectable: boolean;
}>;
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
            plan: protocol.plan.bind(protocol),
            prepare: protocol.prepare?.bind(protocol),
            decode: protocol.decode.bind(protocol),
            decodeInfoSettings: protocol.decodeInfoSettings?.bind(protocol),
            actualWaterSource: protocol.actualWaterSource.bind(protocol),
            syncWaterState: protocol.syncWaterState?.bind(protocol),
            idleToolForState: protocol.idleToolForState?.bind(protocol),
            telemetryFreshMs: protocol.telemetryFreshMs,
            confirmTargetStopFromCupPlateau: protocol.confirmTargetStopFromCupPlateau
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
    private linkOff: (() => void) | null = null;
    private writeTail: Promise<void> = Promise.resolve();
    private epoch = 0;
    private stopping: Promise<void> | null = null;
    private opening: Promise<ControlFeedback["value"]> | null = null;
    private closing: Promise<void> | null = null;
    private leavingSession = false;
    private preflight: {
        key: string;
        promise: Promise<void>;
        signals?: Set<AbortSignal | undefined>;
        watchSignal?: (signal?: AbortSignal) => void;
        aborted?: () => boolean;
    } | null = null;
    private recovering = false;
    private reconnecting: Promise<void> | null = null;
    private recoveryOnly = false;
    private contextInvalid = false;
    private clearing = false;
    private liveTail: Promise<void> = Promise.resolve();
    private telemetry: ControlTokens | null = null;
    private freshness = new Map<"cupGrams" | "dispensedMl", ReturnType<typeof setTimeout>>();
    private pourCupTracker: {
        targetMl: number;
        lastGrams: number | null;
        lastAt: number;
        gainedGrams: number;
        peakGain: number;
        cupRemoved: boolean;
        timer: ReturnType<typeof setTimeout> | null;
    } | null = null;
    private readonly qualifications: readonly ControlQualification[];
    private disposed = false;
    private deadlines = new Set<ReturnType<typeof setTimeout>>();
    private supportCache = new Map<string, MachineToolSupport>();
    private settingsSupportCache = new Map<string, MachineSettingsSupport>();
    private settingsInfo: Machine["info"] = null;

    constructor(private readonly machine: Machine, private readonly options: MachineControlsOptions = {}) {
        this.qualifications = Object.freeze((options.qualifications ?? createProductionQualifications()).map(capture));
        this.linkOff = this.machine.onLink(() => { this.syncInfoSettings(); });
        this.syncInfoSettings();
    }

    getSnapshot = (): ControlSnapshot => this.snapshot;
    subscribe = (listener: () => void): (() => void) => {
        if (this.disposed) return () => {};
        this.listeners.add(listener);
        return () => { this.listeners.delete(listener); };
    };

    /** Read-only context subscription; a view never acquires or releases a lease. */
    subscribeToolSupport = (listener: () => void): (() => void) => {
        const off = [this.subscribe(listener), this.machine.onLink(listener), this.machine.onPhase(listener)];
        return () => off.forEach(unsubscribe => unsubscribe());
    };

    /** Returns the connected machine's reported 40521 grind dial only when its exact identity matches. */
    dialGrindSizeFor(identity: ControlIdentity): number | null {
        const actual = this.machine.slotIdentity;
        if (!this.machine.isConnected() || !identity.serial || !actual
            || actual.deviceId !== identity.deviceId || actual.serial !== identity.serial) {
            return null;
        }
        return this.machine.readDial();
    }

    /** Read-only description; never infers settings support from a tool. */
    describeSettings(identity: ControlIdentity, id: SettingId): MachineSettingsSupport {
        const actual = this.machine.slotIdentity;
        const own = this.snapshot.identity?.deviceId === identity.deviceId
            && this.snapshot.identity.serial === identity.serial && this.snapshot.tool === null;
        let qualification: ControlQualification | null = null;
        let reason: MachineSettingsSupport["reason"] = null;
        let unavailable: string | null = null;
        try {
            if (!actual) {
                reason = "offline";
                throw new Error("Machine offline. Connect this named machine from Machines.");
            }
            if (!identity.serial || actual.deviceId !== identity.deviceId || actual.serial !== identity.serial) {
                reason = "identity-mismatch";
                throw new Error("The connected machine does not match the saved device and serial.");
            }
            reason = "unqualified";
            qualification = this.select();
            if (!qualification.profile.settings[id]) {
                reason = "unsupported";
                throw new Error("This setting has no qualified policy for this machine and firmware.");
            }
            reason = "owned";
            if (this.snapshot.phase !== "closed" && !own) throw new Error("Another control session owns the connection.");
            if (isActiveBrewPhase(this.machine.phase) || this.machine.phase.name === "lostContact") {
                throw new Error("Finish the brew before reading or changing machine settings.");
            }
            if (this.snapshot.phase === "closed") this.machine.assertCanForgetDevice(identity.deviceId);
            reason = null;
        } catch (error) {
            unavailable = failure(error).message;
        }
        let hasReading = false;
        const value = this.snapshot.settings?.[id];
        if (own && value != null && this.qualification) {
            try {
                validateSetting(id, value, this.qualification.profile.settings);
                hasReading = true;
            } catch { /* An unsupported or unqualified value is never an actual reading. */ }
        }
        const reading = !hasReading ? "unavailable"
            : reason === null && qualification === this.qualification && !this.contextInvalid
                && this.settingsInfo !== null && this.settingsInfo === this.machine.info && this.snapshot.phase === "closed"
                ? "current" : "last-known";
        const support: MachineSettingsSupport = Object.freeze({
            policy: qualification?.profile.settings ?? Object.freeze({}),
            reason, unavailable,
            reading,
            readingReason: reading === "current" ? null : reason
                ?? (reading === "unavailable" ? "missing-readback" : "stale-readback"),
            recoverable: own && reason === null && this.snapshot.phase === "unknown",
            reconnectable: this.canReconnect(identity, null)
        });
        const key = JSON.stringify([identity, id]);
        const previous = this.settingsSupportCache.get(key);
        if (previous && JSON.stringify(previous) === JSON.stringify(support)) return previous;
        this.settingsSupportCache.set(key, support);
        return support;
    }

    private isClosingSameIdentity(identity: ControlIdentity): boolean {
        return this.leavingSession
            && this.snapshot.phase === "leaving"
            && this.snapshot.identity?.deviceId === identity.deviceId
            && this.snapshot.identity.serial === identity.serial;
    }

    /** Uses precisely the immutable qualifications captured by this owner. */
    describeTool(identity: ControlIdentity, tool: ToolId): MachineToolSupport {
        let unavailable: string | null = null;
        let qualification: ControlQualification | null = null;
        let toolQualified = false;
        let bound = false;
        const actual = this.machine.slotIdentity;
        const own = this.snapshot.identity?.deviceId === identity.deviceId
            && this.snapshot.identity.serial === identity.serial && this.snapshot.tool === tool;
        try {
            if (actual && actual.deviceId === identity.deviceId && actual.serial === null && this.machine.info === null) {
                throw new Error("The connected machine has not reported its readings yet. Refresh readings to verify its serial.");
            }
            if (!identity.serial || !actual || actual.deviceId !== identity.deviceId || actual.serial !== identity.serial) {
                throw new Error("Connect the named machine with its exact saved serial before using this tool.");
            }
            qualification = this.select();
            const profile = qualification.profile;
            if ((tool === "grind" && !profile.grind) || (tool === "pour" && !profile.pour)
                || (tool === "scale" && profile.scale !== true)) {
                throw new Error("This tool is not qualified for this machine and firmware.");
            }
            toolQualified = true;
            if (own && this.lease && !this.contextInvalid && qualification === this.qualification) {
                this.lease.check();
                bound = true;
            }
            if (this.snapshot.phase !== "closed" && !own && !this.isClosingSameIdentity(identity)) {
                throw new Error("Another machine control session owns the connection.");
            }
            if (isActiveBrewPhase(this.machine.phase) || this.machine.phase.name === "lostContact") {
                throw new Error("A brew owns the connection. Finish or stop the brew first.");
            }
            if (this.snapshot.phase === "closed") {
                this.machine.assertCanForgetDevice(identity.deviceId);
            }
        } catch (error) {
            unavailable = failure(error).message;
        }
        const marker = this.machine.controlRecovery?.marker;
        const recoveryMatches = marker
            ? marker.deviceId === identity.deviceId && marker.serial === identity.serial && marker.tool === tool
            : own;
        const support: MachineToolSupport = Object.freeze({
            grind: qualification?.profile.grind ?? null,
            pour: qualification?.profile.pour ?? null,
            scale: qualification?.profile.scale === true,
            liveTemperature: toolQualified && tool === "pour" && qualification?.profile.liveTemperature === true,
            livePattern: toolQualified && tool === "pour" && qualification?.profile.livePattern === true,
            bound,
            unavailable,
            // Stop does not use Start's normal-state or water preflight.
            stopUnavailable: this.snapshot.phase === "unknown" && marker == null
                ? "No moving operation is reserved. Reconcile this machine before continuing."
                : !bound ? "Reconnect and reconcile the exact named machine before stopping." : null,
            recoverable: !this.disposed && toolQualified && recoveryMatches
                && actual?.deviceId === identity.deviceId && actual.serial === identity.serial
                && ["closed", "unknown"].includes(this.snapshot.phase),
            reconnectable: this.canReconnect(identity, tool)
        });
        const key = JSON.stringify([identity.deviceId, identity.serial, tool]);
        const previous = this.supportCache.get(key);
        if (previous && JSON.stringify(previous) === JSON.stringify(support)) return previous;
        this.supportCache.set(key, support);
        return support;
    }

    private sanitizeReadings(
        readings: Readonly<SettingReadings>,
        qualification: ControlQualification,
        identity: ControlIdentity,
        mergeWithCurrent: boolean
    ): SettingReadings {
        const clean: SettingReadings = {
            temperatureUnit: null,
            weightUnit: null,
            brightness: null,
            waterSource: null,
            pourRadius: null,
            vibrationAmplitude: null
        };
        const sameLink = mergeWithCurrent
            && this.settingsInfo !== null
            && this.snapshot.identity?.deviceId === identity.deviceId
            && this.snapshot.identity.serial === identity.serial;
        for (const id of Object.keys(clean) as SettingId[]) {
            const candidate = readings[id] ?? (sameLink ? this.snapshot.settings?.[id] ?? null : null);
            if (candidate == null) continue;
            try {
                validateSetting(id, candidate, qualification.profile.settings);
                (clean as Record<SettingId, SettingValues[SettingId] | null>)[id] = candidate;
            } catch { /* Reject out-of-policy fields rather than exposing invalid readings. */ }
        }
        return Object.freeze(clean);
    }

    /** Passively populates settings already carried in the connected 40521 info frame without dispatching BLE commands. */
    private buildPassiveInfoPatch(): Partial<ControlSnapshot> | null {
        if (this.disposed) return null;
        const actual = this.machine.slotIdentity;
        const info = this.machine.info;
        if (!actual || !actual.serial || !info) return null;
        let qualification: ControlQualification;
        try {
            qualification = this.select();
        } catch {
            return null;
        }
        const decodeInfo = qualification.protocol.decodeInfoSettings;
        if (!decodeInfo) return null;
        const raw = decodeInfo(info);
        if (!raw) return null;
        const identity = Object.freeze({deviceId: actual.deviceId, serial: actual.serial});
        const clean = this.sanitizeReadings(raw, qualification, identity, true);
        this.qualification = qualification;
        this.settingsInfo = info;
        return {identity, settings: clean};
    }

    private syncInfoSettings(): void {
        if (this.disposed || this.snapshot.phase !== "closed") return;
        const actual = this.machine.slotIdentity;
        const info = this.machine.info;
        if (!actual || !actual.serial || !info) return;
        if (this.settingsInfo === info
            && this.snapshot.identity?.deviceId === actual.deviceId
            && this.snapshot.identity.serial === actual.serial
            && this.snapshot.settings !== null) {
            return;
        }
        const patch = this.buildPassiveInfoPatch();
        if (!patch) return;
        this.update({...initial, ...patch});
    }

    private closeSessionToRestoredSettings(): void {
        const patch = this.buildPassiveInfoPatch();
        this.update(patch ? {...initial, ...patch} : {...initial});
    }

    /**
     * Permanent shared-owner teardown, never route cleanup. Detaching cannot
     * prove a motor stopped: keep the lease and durable recovery reservation.
     */
    dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        this.contextInvalid = true;
        ++this.epoch;
        this.waiter?.reject(new Error("The shared control owner was reset."));
        this.deadlines.forEach(clearTimeout);
        this.deadlines.clear();
        this.clearPourPlateau();
        this.clearFreshness();
        this.linkOff?.();
        this.linkOff = null;
        this.off.splice(0).forEach(off => off());
        this.listeners.clear();
        if (this.snapshot.phase !== "closed") {
            this.update({phase: "unknown", error: "The shared control owner was reset.", cupGrams: null, dispensedMl: null});
        }
    }

    private update(patch: Partial<ControlSnapshot>): void {
        if (this.disposed && patch.phase !== "unknown") return;
        if (Object.entries(patch).every(([key, value]) => this.snapshot[key as keyof ControlSnapshot] === value)) return;
        this.snapshot = Object.freeze({...this.snapshot, ...patch});
        this.listeners.forEach((listener) => listener());
    }

    private select(): ControlQualification {
        if (this.disposed) throw new Error("The shared control owner was reset.");
        const info = this.machine.info;
        const selected = lookupControlCapabilities({
            model: info?.model ?? null,
            firmware: info?.firmware ?? null,
            serial: info?.serial ?? null
        }, this.qualifications.map((q) => q.profile));
        if (!selected.available) throw new Error(`Controls unavailable: ${selected.reason}`);
        const qualification = this.qualifications.find((q) => q.profile === selected.profile)!;
        return qualification;
    }

    private attach(
        callerIdentity: ControlIdentity, purpose: ToolId | "setting" | "recovery" | "exit", replacement?: ControlSession
    ): void {
        const identity = Object.freeze({...callerIdentity});
        if (replacement) this.lease = replacement;
        this.qualification = this.select();
        const protocol = this.qualification.protocol;
        protocol.syncWaterState?.(this.machine.info, this.machine.tankWaterPresent);
        const ms = protocol.telemetryFreshMs;
        if (ms !== undefined && (!Number.isFinite(ms) || ms <= 0)) throw new Error("Invalid qualified telemetry freshness.");
        const lease = replacement ?? this.machine.acquireControlSession(identity, purpose);
        this.lease = lease;
        this.contextInvalid = false;
        const session = this.session = ++nextSession;
        const invalidate = (error: Error) => {
            this.contextInvalid = true;
            if (purpose === "exit") {
                this.waiter?.reject(error);
                return;
            }
            this.uncertain(error);
        };
        this.off.push(lease.onInvalidated(invalidate));
        this.off.push(this.machine.onLink(() => {
            if (this.lease !== lease || this.contextInvalid || this.clearing) return;
            protocol.syncWaterState?.(this.machine.info, this.machine.tankWaterPresent);
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
                if (parsed.kind === "info") {
                    const parsedModel = resolveControlModel(parsed.model, parsed.serial);
                    const modelMatches = parsedModel !== null && this.qualification!.profile.models.some(
                        (m) => m.trim().toLowerCase() === parsedModel.toLowerCase()
                    );
                    if (parsed.serial.trim() !== identity.serial
                        || !modelMatches
                        || !this.qualification!.profile.firmwares.includes(parsed.firmware.trim())) {
                        invalidate(new Error("The qualified machine identity changed."));
                        return;
                    }
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
                if (purpose === "exit") invalidate(failure(error));
                else this.uncertain(failure(error));
            }
        }));
    }

    private uncertain(error: Error): void {
        this.waiter?.reject(error);
        this.clearPourPlateau();
        this.clearFreshness();
        this.update({phase: "unknown", error: error.message, cupGrams: null, dispensedMl: null});
    }

    private release(): void {
        if (this.disposed) return;
        this.qualification?.protocol.syncWaterState?.(null, null);
        this.clearPourPlateau();
        this.clearFreshness();
        this.off.splice(0).forEach((off) => off());
        const lease = this.lease;
        this.lease = null;
        lease?.release();
    }

    private terminal(): void {
        if (this.disposed) return;
        const {identity, tool} = this.snapshot;
        if (!identity || (tool !== "grind" && tool !== "pour")) throw new Error("No matching moving operation.");
        this.clearPourPlateau();
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
            this.closeSessionToRestoredSettings();
        } else this.update({phase: "ready", error: null, pendingTemperatureC: null, pendingPattern: null});
    }

    private clearPourPlateau(): void {
        if (this.pourCupTracker?.timer) clearTimeout(this.pourCupTracker.timer);
        this.pourCupTracker = null;
    }

    private armPourPlateauTimer(): void {
        const tracker = this.pourCupTracker;
        if (!tracker) return;
        if (tracker.timer) clearTimeout(tracker.timer);
        tracker.timer = setTimeout(() => {
            if (this.pourCupTracker !== tracker) return;
            tracker.timer = null;
            if (this.disposed || this.stopping || this.snapshot.phase !== "running"
                || this.snapshot.tool !== "pour" || this.snapshot.pourRequest?.mode !== "target") {
                return;
            }
            void this.stop().catch(() => {});
        }, 2500);
        tracker.timer.unref?.();
    }

    private trackPourCup(grams: number): void {
        const tracker = this.pourCupTracker;
        if (!tracker || this.snapshot.phase !== "running" || this.snapshot.tool !== "pour") return;
        const now = Date.now();
        if (tracker.lastGrams === null) {
            tracker.lastGrams = grams;
            tracker.lastAt = now;
            return;
        }
        const delta = grams - tracker.lastGrams;
        const dtSec = Math.max(0.05, (now - tracker.lastAt) / 1000);
        tracker.lastGrams = grams;
        tracker.lastAt = now;
        // Sudden large steps reflect cup placement or removal on the scale, not spout flow.
        if (Math.abs(delta) > Math.max(10, dtSec * 8)) {
            if (delta < -10) {
                if (tracker.timer) {
                    clearTimeout(tracker.timer);
                    tracker.timer = null;
                }
                tracker.cupRemoved = true;
            } else if (delta > 10 && tracker.cupRemoved) {
                tracker.cupRemoved = false;
                if (tracker.gainedGrams >= Math.max(1, tracker.targetMl - 2)) this.armPourPlateauTimer();
            }
            return;
        }
        if (tracker.cupRemoved) return;
        tracker.gainedGrams = Math.max(0, tracker.gainedGrams + delta);
        const threshold = Math.max(1, tracker.targetMl - 2);
        if (tracker.gainedGrams > tracker.peakGain + 0.35) {
            tracker.peakGain = tracker.gainedGrams;
            tracker.cupRemoved = false;
            if (tracker.gainedGrams >= threshold) this.armPourPlateauTimer();
        } else if (!tracker.cupRemoved && tracker.gainedGrams >= threshold && tracker.timer === null) {
            this.armPourPlateauTimer();
        }
    }

    private sample(event: ControlFeedback): void {
        const {value} = event;
        if (value.kind === "cup") {
            if ((event.transaction !== this.telemetry?.transaction && event.transaction !== this.run?.transaction)
                || !Number.isFinite(value.grams)) return;
            this.update({cupGrams: value.grams});
            this.expire("cupGrams");
            if (event.transaction === this.run?.transaction) this.trackPourCup(value.grams);
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
        const protocol = this.qualification.protocol;
        if (command.kind === "pour") protocol.actualWaterSource(this.machine.info, this.machine.infoAt);
        const plan = (protocol.prepare ?? protocol.plan).call(protocol, command, tokens);
        if (!Number.isFinite(plan.deadlineMs) || plan.deadlineMs <= 0) throw new Error("A qualified deadline is required.");
        if (command.kind === "inspect" && command.recovery && (plan.frame !== null || !plan.refreshInfo)) {
            throw new Error("Read-only or recovery inspection must use leased info only.");
        }
        if (command.kind === "inspect" && command.readOnly && !plan.inertRead && (plan.frame !== null || !plan.refreshInfo)) {
            throw new Error("Read-only or recovery inspection must use leased info only.");
        }
        let timer: ReturnType<typeof setTimeout>;
        let armed = false;
        let dispatched = false;
        let cancelled = false;
        // A resolved response can still be contradicted before native settlement.
        let transactionFailure: Error | null = null;
        let cancelExchange!: (error: Error) => void;
        const cancellation = new Promise<never>((_, reject) => { cancelExchange = reject; });
        const timeout = new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new Error("Qualified control response missing.")), plan.deadlineMs);
            this.deadlines.add(timer);
        });
        const response = new Promise<ControlFeedback["value"]>((resolve, reject) => {
            const fail = (error: Error) => {
                transactionFailure ??= error;
                cancelExchange(error);
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
                let armedProtocol = false;
                const armOnce = () => {
                    if (armedProtocol) return;
                    armedProtocol = true;
                    plan.arm?.();
                };
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
                    const nextArmed = !plan.refreshInfo || Boolean(plan.inertRead);
                    if (nextArmed) armOnce();
                    if (command.kind === "grind" || command.kind === "pour") this.run = tokens;
                    if (command.kind === "enter") this.telemetry = tokens;
                    dispatched = true;
                    armed = nextArmed;
                };
                if (plan.frame !== null) {
                    if (command.kind === "stop") await lease.sendStop(plan.frame, dispatch, checkCurrent);
                    else await lease.send(plan.frame, dispatch, checkCurrent);
                }
                checkCurrent();
                if (plan.refreshInfo) {
                    const answered = await lease.refreshInfo(() => {
                        checkCurrent();
                        armOnce();
                        if (!dispatched && command.kind === "enter") this.telemetry = tokens;
                        dispatched = true;
                        armed = true;
                    }, checkCurrent);
                    if (!answered) throw new Error("Qualified info refresh did not succeed.");
                }
            });
            this.writeTail = sending.then(() => {}, () => {});
            const [, result] = await Promise.race([Promise.all([sending, response]), timeout, cancellation]);
            if (transactionFailure) throw transactionFailure;
            return result;
        } finally {
            cancelled = true;
            clearTimeout(timer!);
            this.deadlines.delete(timer!);
            if (this.waiter?.tokens === tokens) this.waiter = null;
        }
    }

    private async exitIdleToolBeforeOpen(identity: ControlIdentity, idleTool: ToolId): Promise<void> {
        const lease = this.machine.acquireIdleExitSession(identity);
        this.attach(identity, "exit", lease);
        try {
            await this.exchange({kind: "exit", tool: idleTool}, "closed");
        } finally {
            this.release();
            this.contextInvalid = false;
            await this.writeTail;
        }
    }

    async open(
        identity: ControlIdentity,
        tool: ToolId,
        signal?: AbortSignal,
        options?: {recheckFault?: boolean}
    ): Promise<void> {
        if (this.disposed) throw new Error("The shared control owner was reset.");
        if (signal?.aborted) throw new Error("Control open cancelled before attachment.");
        const key = `${identity.deviceId}\0${identity.serial ?? ""}\0${tool}`;
        while (this.preflight) {
            if (this.preflight.key === key) {
                if (signal?.aborted) throw new Error("Control open cancelled before attachment.");
                if (!this.preflight.aborted?.()) {
                    this.preflight.signals?.add(signal);
                    this.preflight.watchSignal?.(signal);
                    await this.preflight.promise;
                    if (signal?.aborted) throw new Error("Control open cancelled before attachment.");
                    return;
                }
                // Wait for an already-aborted preflight to unwind so the caller gets a fresh un-aborted run.
                await this.preflight.promise.catch(() => {});
                if (this.disposed) throw new Error("The shared control owner was reset.");
                if (signal?.aborted) throw new Error("Control open cancelled before attachment.");
                continue;
            }
            throw new Error("A control session is already owned.");
        }
        const current = this.snapshot;
        const closingSameMachine = this.isClosingSameIdentity(identity);
        if (current.phase !== "closed" && !closingSameMachine) {
            if (current.identity?.deviceId === identity.deviceId && current.identity.serial === identity.serial
                && current.tool === tool && current.phase !== "leaving" && current.phase !== "applying") {
                if (current.phase === "entering" && this.opening) await this.opening;
                return;
            }
            throw new Error("A control session is already owned.");
        }
        const {profile} = this.select();
        if ((tool === "grind" && !profile.grind) || (tool === "pour" && !profile.pour)) throw new Error("Tool unsupported.");
        const actual = this.machine.slotIdentity;
        if (!actual || actual.deviceId !== identity.deviceId || actual.serial !== identity.serial) {
            throw new Error("The connected peripheral and reported serial must match the control identity.");
        }

        const signals = new Set<AbortSignal | undefined>([signal]);
        const preflightCancelled = () => signals.size > 0 && Array.from(signals).every((entry) => entry?.aborted === true);
        let pourAbort: AbortController | null = null;
        const syncPreflightAbort = () => {
            if (pourAbort && preflightCancelled()) pourAbort.abort();
        };
        const watchedSignals: AbortSignal[] = [];
        const watchSignal = (entry?: AbortSignal) => {
            if (!entry) return;
            if (entry.aborted) {
                syncPreflightAbort();
                return;
            }
            entry.addEventListener("abort", syncPreflightAbort, {once: true});
            watchedSignals.push(entry);
        };
        watchSignal(signal);
        let preflight: {
            key: string;
            promise: Promise<void>;
            signals?: Set<AbortSignal | undefined>;
            watchSignal?: (signal?: AbortSignal) => void;
            aborted?: () => boolean;
        } | undefined;
        const task = (async () => {
            try {
                if (this.closing) await this.closing;
                if (preflightCancelled()) throw new Error("Control open cancelled before attachment.");
                if (this.disposed) throw new Error("The shared control owner was reset.");
                const infoBefore = this.machine.info;
                await this.machine.ensureFreshControlState(
                    options?.recheckFault ? {recheckFault: true} : undefined
                );
                if (preflightCancelled()) throw new Error("Control open cancelled before attachment.");
                if (this.disposed) throw new Error("The shared control owner was reset.");
                if (this.snapshot.phase !== "closed") throw new Error("A control session is already owned.");
                const idleTool = !this.machine.slotStateIsNormal
                    && this.machine.state !== null
                    && this.machine.controlRecovery?.marker == null
                    ? this.select().protocol.idleToolForState?.(
                        this.machine.state,
                        this.machine.controlStateConfirmed
                    ) ?? null
                    : null;
                if (idleTool !== null) {
                    await this.exitIdleToolBeforeOpen(identity, idleTool);
                    if (preflightCancelled()) throw new Error("Control open cancelled before attachment.");
                    if (this.disposed) throw new Error("The shared control owner was reset.");
                    if (this.snapshot.phase !== "closed") throw new Error("A control session is already owned.");
                    await this.machine.ensureFreshControlState(
                        options?.recheckFault ? {recheckFault: true} : undefined
                    );
                    if (preflightCancelled()) throw new Error("Control open cancelled before attachment.");
                    if (this.disposed) throw new Error("The shared control owner was reset.");
                    if (this.snapshot.phase !== "closed") throw new Error("A control session is already owned.");
                }
                if (tool === "pour") {
                    pourAbort = new AbortController();
                    if (preflightCancelled()) pourAbort.abort();
                    await this.machine.ensurePourWaterForControl(pourAbort.signal, this.machine.info !== infoBefore);
                    pourAbort = null;
                    if (preflightCancelled()) throw new Error("Control open cancelled before attachment.");
                    if (this.disposed) throw new Error("The shared control owner was reset.");
                    if (this.snapshot.phase !== "closed") throw new Error("A control session is already owned.");
                }
                const {profile: latestProfile} = this.select();
                if ((tool === "grind" && !latestProfile.grind) || (tool === "pour" && !latestProfile.pour)) {
                    throw new Error("Tool unsupported.");
                }
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
            } finally {
                pourAbort = null;
                for (const entry of watchedSignals) entry.removeEventListener("abort", syncPreflightAbort);
                if (this.preflight === preflight) this.preflight = null;
            }
        })();
        preflight = {
            key,
            promise: task,
            signals,
            watchSignal,
            aborted: () => pourAbort !== null && pourAbort.signal.aborted
        };
        this.preflight = preflight;
        await task;
        if (signal?.aborted) throw new Error("Control open cancelled before attachment.");
    }

    /** True only while the active BLE connection matches `identity` and this owner is live. */
    isIdentityConnected(identity: ControlIdentity): boolean {
        const actual = this.machine.slotIdentity;
        return !this.disposed && this.machine.isConnected() && actual !== null
            && actual.deviceId === identity.deviceId && actual.serial === identity.serial;
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
        this.clearPourPlateau();
        if (this.qualification!.protocol.confirmTargetStopFromCupPlateau && captured.mode === "target") {
            this.pourCupTracker = {
                targetMl: captured.volumeMl, lastGrams: null, lastAt: 0, gainedGrams: 0, peakGain: 0,
                cupRemoved: false, timer: null
            };
        }
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
        this.clearPourPlateau();
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
        this.clearPourPlateau();
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

    /** Explicit setting read under the shared exclusive lease, never an Apply. */
    async readSettings(identity: ControlIdentity, id: SettingId): Promise<void> {
        const support = this.describeSettings(identity, id);
        if (support.unavailable) throw new Error(support.unavailable);
        await this.runSettingLeaseTransaction(identity, id, () => {
            const latestSupport = this.describeSettings(identity, id);
            if (latestSupport.unavailable) throw new Error(latestSupport.unavailable);
        }, async () => {
            const result = await this.exchange({kind: "inspect", tool: null, settingId: id, readOnly: true}, "settings");
            if (result.kind !== "settings" || result.readings[id] === null) throw new Error("Qualified current setting unavailable.");
            validateSetting(id, result.readings[id], this.qualification!.profile.settings);
            return result.readings;
        });
    }

    private async runSettingLeaseTransaction(
        identity: ControlIdentity,
        id: SettingId,
        revalidate: () => void,
        execute: () => Promise<SettingReadings>
    ): Promise<void> {
        if (this.snapshot.phase !== "closed" || this.preflight !== null) {
            throw new Error("Settings require a closed control session.");
        }
        const preflight = {
            key: `setting\0${identity.deviceId}\0${identity.serial ?? ""}\0${id}`,
            promise: (async () => {
                await this.machine.ensureFreshControlState();
                if (this.disposed) throw new Error("The shared control owner was reset.");
                if (this.snapshot.phase !== "closed") throw new Error("Settings require a closed control session.");
                revalidate();
                const priorSettings = this.settingsInfo === this.machine.info
                    && this.snapshot.identity?.deviceId === identity.deviceId
                    && this.snapshot.identity.serial === identity.serial
                    ? this.snapshot.settings : null;
                this.attach(identity, "setting");
                this.recoveryOnly = false;
                this.update({...initial, identity: Object.freeze({...identity}), phase: "applying", applyingSetting: id,
                    settings: priorSettings});
                try {
                    const readings = await execute();
                    const clean = this.sanitizeReadings(readings, this.qualification!, identity, true);
                    this.settingsInfo = this.machine.info;
                    this.release();
                    this.update({phase: "closed", applyingSetting: null, error: null, settings: clean});
                } catch (error) {
                    this.uncertain(failure(error));
                    throw error;
                }
            })()
        };
        this.preflight = preflight;
        try {
            await preflight.promise;
        } finally {
            if (this.preflight === preflight) this.preflight = null;
        }
    }

    async applySetting<K extends SettingId>(identity: ControlIdentity, id: K, value: SettingValues[K]): Promise<void> {
        const qualification = this.select();
        validateSetting(id, value, qualification.profile.settings);
        await this.runSettingLeaseTransaction(identity, id, () => {
            const latestQualification = this.select();
            validateSetting(id, value, latestQualification.profile.settings);
        }, async () => {
            const current = await this.exchange({kind: "inspect", tool: null, settingId: id}, "settings");
            if (current.kind !== "settings" || current.readings[id] === null) throw new Error("Qualified current setting unavailable.");
            validateSetting(id, current.readings[id], this.qualification!.profile.settings);
            this.update({settings: this.sanitizeReadings(current.readings, this.qualification!, identity, true)});
            // TS cannot retain the correlation between a generic key and its
            // value when constructing the mapped command union.
            const command = {kind: "setting", id, value} as Extract<ControlCommand, {kind: "setting"}>;
            const result = await this.exchange(command, "settings");
            if (result.kind !== "settings" || result.readings[id] !== value) throw new Error("Setting readback does not match the proposal.");
            return result.readings;
        });
    }

    private canReconnect(identity: ControlIdentity, tool: ToolId | null): boolean {
        const owner = this.snapshot.identity;
        const marker = this.machine.controlRecovery?.marker;
        const reservationMatches = marker == null
            || marker.deviceId === identity.deviceId && marker.serial === identity.serial && marker.tool === tool;
        return !this.disposed && this.options.reconnect !== undefined && this.lease !== null
            && this.qualification !== null && this.snapshot.phase === "unknown" && this.snapshot.tool === tool
            && identity.serial !== null && owner?.deviceId === identity.deviceId && owner.serial === identity.serial
            && reservationMatches && this.machine.controlRecovery?.error === null && !this.machine.isConnected();
    }

    /** Reconnect the retained owner to inspect only; null denotes its settings lease. */
    reconnectTool(identity: ControlIdentity, tool: ToolId | null): Promise<void> {
        const owner = this.snapshot.identity;
        const marker = this.machine.controlRecovery?.marker;
        const epoch = this.epoch;
        const lease = this.lease;
        const qualification = this.qualification;
        const setting = this.snapshot.applyingSetting;
        const check = () => {
            if (this.disposed || this.epoch !== epoch || this.snapshot.identity !== owner
                || this.snapshot.phase !== "unknown" || this.snapshot.tool !== tool
                || !lease || this.lease !== lease || !qualification || this.qualification !== qualification
                || this.snapshot.applyingSetting !== setting
                || !identity.serial || owner?.deviceId !== identity.deviceId || owner.serial !== identity.serial
                || (marker != null && (marker.deviceId !== identity.deviceId
                    || marker.serial !== identity.serial || marker.tool !== tool))
                || this.machine.controlRecovery?.marker !== marker || this.machine.controlRecovery?.error !== null) {
                throw new Error("Reconnect requires the exact retained tool owner and unchanged recovery state.");
            }
        };
        try {
            check();
            if (this.reconnecting) return this.reconnecting;
            if (!this.canReconnect(identity, tool) || !this.options.reconnect) {
                throw new Error("Owned tool reconnect is unavailable.");
            }
        } catch (error) {
            return Promise.reject(error);
        }
        const reconnect = this.options.reconnect;
        const operation = async () => {
            try {
                // Native writes may outlive their cancelled response promises.
                await this.writeTail;
                check();
                await reconnect(identity.deviceId, check);
                check();
                const actual = this.machine.slotIdentity;
                if (actual?.deviceId !== identity.deviceId || actual.serial !== identity.serial) {
                    throw new Error("Reconnect requires the exact connected device and saved serial.");
                }
                if (this.select() !== qualification) throw new Error("The qualified machine identity changed.");
                await this.recover();
            } finally {
                this.reconnecting = null;
            }
        };
        this.reconnecting = operation();
        return this.reconnecting;
    }

    /** Never re-enters a tool. A moving recovery remains Stop-only until proof. */
    async recover(): Promise<void> {
        if (this.recovering || this.stopping || this.preflight !== null
            || !["closed", "unknown"].includes(this.snapshot.phase)) {
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
            this.update({identity: !marker && this.snapshot.identity ? this.snapshot.identity
                    : Object.freeze({deviceId: identity.deviceId, serial: identity.serial}),
                tool: marker?.tool ?? this.snapshot.tool, phase: "unknown"});
            const settings = !marker && this.snapshot.applyingSetting !== null;
            const result = await this.exchange({kind: "inspect", tool: this.snapshot.tool, recovery: true},
                marker ? ["terminal", "active"] : settings ? "settings" : ["terminal", "closed", "active"]);
            if (result.kind === "active") {
                if (!marker) throw new Error("Unexpected active nonmoving control. Reconciliation required.");
                this.update({phase: "unknown", error: "The recovered operation is active. Stop is required."});
            } else if (marker) {
                if (result.kind !== "terminal") throw new Error("Qualified terminal proof is required for moving recovery.");
                this.terminal();
            } else {
                const id = this.snapshot.applyingSetting;
                if (settings && (result.kind !== "settings" || id === null || result.readings[id] === null)) {
                    throw new Error("Qualified current setting unavailable.");
                }
                if (result.kind === "settings" && id !== null) {
                    validateSetting(id, result.readings[id]!, this.qualification!.profile.settings);
                    this.settingsInfo = this.machine.info;
                }
                const settingsIdentity = settings ? this.snapshot.identity : null;
                const nextSettings = result.kind === "settings" && settingsIdentity
                    ? this.sanitizeReadings(result.readings, this.qualification!, settingsIdentity, true)
                    : null;
                this.release();
                if (settings) {
                    this.update({...initial, identity: settingsIdentity, settings: nextSettings});
                } else {
                    this.closeSessionToRestoredSettings();
                }
            }
        } catch (error) {
            this.uncertain(failure(error));
            throw error;
        } finally {
            this.recovering = false;
        }
    }

    async close(): Promise<void> {
        if (this.closing) return this.closing;
        if (this.snapshot.phase === "closed") return;
        if (this.snapshot.phase !== "ready") throw new Error("Cannot close an uncertain or active control.");
        this.leavingSession = true;
        this.update({phase: "leaving"});
        let operation: Promise<void> | undefined;
        operation = (async () => {
            try {
                await this.exchange({kind: "exit", tool: this.snapshot.tool}, "closed");
                this.release();
                this.closeSessionToRestoredSettings();
            } catch (error) {
                this.uncertain(failure(error));
                throw error;
            } finally {
                this.leavingSession = false;
                if (this.closing === operation) this.closing = null;
            }
        })();
        this.closing = operation;
        return operation;
    }

    /** Initiates idle BLE tool exit without keeping callers blocked on navigation; surfaces errors honestly on snapshot. */
    closeInBackground(): Promise<void> {
        if (this.closing) return this.closing.catch(() => {});
        if (this.snapshot.phase === "closed") return Promise.resolve();
        if (this.snapshot.phase !== "ready") {
            return Promise.reject(new Error("Cannot close an uncertain or active control."));
        }
        return this.close().catch(() => {});
    }
}
