export type ToolId = "grind" | "scale" | "pour";
export type ControlIdentity = {deviceId: string; serial: string | null};
export type Pattern = "centered" | "circular" | "spiral";
export type PourRequest = {
    temperatureC: number;
    flowMlPerSecond: number;
    pattern: Pattern;
} & ({mode: "target"; volumeMl: number} | {mode: "continuous"});
export type GrindRequest = {grindSize: number; rpm: number};
export type SettingValues = {
    temperatureUnit: "C" | "F";
    weightUnit: "g" | "oz" | "ml";
    brightness: number;
    waterSource: "tank" | "tap";
    pourRadius: number;
    vibrationAmplitude: number;
};
export type SettingId = keyof SettingValues;
export type SettingReadings = {[K in SettingId]: SettingValues[K] | null};
export type ControlPhase =
    | "closed" | "entering" | "ready" | "starting" | "running" | "stopping"
    | "leaving" | "applying" | "unknown";
export type ControlSnapshot = {
    identity: ControlIdentity | null;
    tool: ToolId | null;
    phase: ControlPhase;
    error: string | null;
    cupGrams: number | null;
    dispensedMl: number | null;
    grindRequest: GrindRequest | null;
    pourRequest: PourRequest | null;
    temperatureC: number | null;
    pattern: Pattern | null;
    pendingTemperatureC: number | null;
    pendingPattern: Pattern | null;
    settings: SettingReadings | null;
    applyingSetting: SettingId | null;
};
export type ControlRecovery = {
    version: 1;
    deviceId: string;
    serial: string | null;
    tool: "grind" | "pour";
};

/** A qualified inclusive ladder anchored at min, never an inferred card limit. */
export type NumericPolicy = {min: number; max: number; step: number};
/** A display unit requires the same evidence as the numeric ladder. */
export type NumericSettingPolicy = NumericPolicy & {unit?: string};
export type GrindPolicy = {grindSize: NumericPolicy; rpm: NumericPolicy};
export type PourPolicy = {
    temperatureC: NumericPolicy;
    flowMlPerSecond: NumericPolicy;
    volumeMl: NumericPolicy | null;
    patterns: readonly Pattern[];
    modes: readonly PourRequest["mode"][];
};
/** Omitted settings are unsupported, not defaults waiting to be filled. */
export type SettingPolicy = {
    [K in SettingId]?: SettingValues[K] extends number ? NumericSettingPolicy : readonly SettingValues[K][];
};
export type SettingEditorState = {
    [K in SettingId]: {id: K; proposal: SettingValues[K] | null}
}[SettingId];

export class ControlValidationError extends Error {
    constructor(
        public readonly field: string,
        public readonly code: "unsupported" | "invalid-value" | "invalid-policy"
    ) {
        super(`Control input ${field}: ${code}`);
        this.name = "ControlValidationError";
    }
}

function validateNumber(field: string, value: number, policy: NumericPolicy | null | undefined): void {
    if (!policy) throw new ControlValidationError(field, "unsupported");
    const {min, max, step} = policy;
    if (![min, max, step].every(Number.isFinite) || min > max || step <= 0) {
        throw new ControlValidationError(field, "invalid-policy");
    }
    const steps = (value - min) / step;
    const nearestIndex = Math.round(steps);
    const nearestValue = min + nearestIndex * step;
    // Compare in value space so cancellation at a nonzero origin does not
    // reject decimal rungs. Bound tolerance absolutely and relative to a step.
    const tolerance = Math.min(
        1e-9, step * 1e-9,
        Number.EPSILON * 8 * Math.max(1, Math.abs(value), Math.abs(min), Math.abs(nearestValue))
    );
    if (!Number.isFinite(value) || value < min || value > max
        || !Number.isSafeInteger(nearestIndex) || !Number.isFinite(nearestValue)
        || Math.abs(value - nearestValue) > tolerance) {
        throw new ControlValidationError(field, "invalid-value");
    }
}

export function validateGrindRequest(request: GrindRequest, policy: GrindPolicy | null): void {
    if (!policy) throw new ControlValidationError("grind", "unsupported");
    validateNumber("grindSize", request.grindSize, policy.grindSize);
    validateNumber("rpm", request.rpm, policy.rpm);
}

export function validatePourRequest(request: PourRequest, policy: PourPolicy | null): void {
    if (!policy) throw new ControlValidationError("pour", "unsupported");
    validateNumber("temperatureC", request.temperatureC, policy.temperatureC);
    if (!Number.isInteger(request.temperatureC)) {
        throw new ControlValidationError("temperatureC", "invalid-value");
    }
    validateNumber("flowMlPerSecond", request.flowMlPerSecond, policy.flowMlPerSecond);
    if (!["centered", "circular", "spiral"].includes(request.pattern)
        || !policy.patterns.includes(request.pattern)) {
        throw new ControlValidationError("pattern", "invalid-value");
    }
    if (!["target", "continuous"].includes(request.mode) || !policy.modes.includes(request.mode)) {
        throw new ControlValidationError("mode", "invalid-value");
    }
    if (request.mode === "target") validateNumber("volumeMl", request.volumeMl, policy.volumeMl);
}

export function validateSetting<K extends SettingId>(id: K, value: SettingValues[K], policy: SettingPolicy): void {
    const rule = policy[id];
    if (!rule) throw new ControlValidationError(id, "unsupported");
    if ("min" in rule) {
        validateNumber(id, value as number, rule);
    } else if (!(rule as readonly unknown[]).includes(value)) {
        throw new ControlValidationError(id, "invalid-value");
    }
}
