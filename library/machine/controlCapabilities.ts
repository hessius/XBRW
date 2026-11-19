import {GrindPolicy, PourPolicy, SettingPolicy} from "@/library/machine/controlModel";
import {modelFromSerial} from "@/library/machine/machineModel";

/** Read from the connected machine, never a saved model preference. */
export type ControlReportedIdentity = {
    model: string | null;
    firmware: string | null;
    serial: string | null;
};

/** Exact observed scopes only; no unverified serial-prefix or firmware-family inference. */
export type ControlCapabilityProfile = {
    id: string;
    models: readonly string[];
    firmwares: readonly string[];
    serials: readonly string[];
    /** Explicit standalone scale qualification; other tools imply nothing. */
    scale?: boolean;
    /** Explicit live pour mutation qualification; a start pour policy implies neither. */
    liveTemperature?: boolean;
    livePattern?: boolean;
    grind: GrindPolicy | null;
    pour: PourPolicy | null;
    settings: SettingPolicy;
};

export type ControlCapabilitySelection =
    | {available: true; profile: ControlCapabilityProfile}
    | {available: false; reason: "identity-unavailable" | "unqualified" | "ambiguous-profile"};

/**
 * Qualified on xBloom Studio firmware V12.0D.500 (2026-11-02 capture `studio-qualification-latest.json`).
 * Settings: temp unit (0=F/1=C), weight unit (0=ml/1=g/2=oz),
 * brightness (0-15), water source (0=tank/1=tap),
 * pour radius (11506/11507 and 40521 offset 55 when non-zero, 400-1000 step 20),
 * agitation amplitude (11508/11509, 1000-1500 step 100).
 * Standalone scale (8003/8500/8014 + 0x15), grind (8006/3500/3505/8012, size 1-80, rpm 60-120 step 5),
 * and pour (8007/4506/4507/8013 + live 4510/8016, target + continuous vol=0).
 */
export const studioQualifiedProfile: ControlCapabilityProfile = {
    id: "studio-v12.0d.500",
    models: ["Studio", "J15", "X15"],
    firmwares: ["V12.0D.500"],
    serials: ["*"],
    scale: true,
    liveTemperature: true,
    livePattern: true,
    grind: {
        grindSize: {min: 1, max: 80, step: 1},
        rpm: {min: 60, max: 120, step: 5}
    },
    pour: {
        temperatureC: {min: 20, max: 99, step: 1},
        flowMlPerSecond: {min: 1, max: 4, step: 0.1},
        volumeMl: {min: 5, max: 500, step: 5},
        modes: ["target", "continuous"],
        patterns: ["centered", "circular", "spiral"]
    },
    settings: {
        temperatureUnit: ["C", "F"],
        weightUnit: ["g", "oz", "ml"],
        brightness: {min: 0, max: 15, step: 1},
        waterSource: ["tank", "tap"],
        pourRadius: {min: 400, max: 1000, step: 20},
        vibrationAmplitude: {min: 1000, max: 1500, step: 100}
    }
};

const qualifiedProfiles: readonly ControlCapabilityProfile[] = [studioQualifiedProfile];

/**
 * Resolves the reported model from the 40521 info frame, falling back to
 * documented catalogue serial codes (`J15`/`J20`) when 40521 model bytes are empty.
 */
export function resolveControlModel(
    model: string | null | undefined,
    serial: string | null | undefined
): string | null {
    return (model?.trim() || null) ?? (serial ? modelFromSerial(serial) : null);
}

export function lookupControlCapabilities(
    reported: ControlReportedIdentity,
    profiles: readonly ControlCapabilityProfile[] = qualifiedProfiles
): ControlCapabilitySelection {
    const {model, firmware, serial} = reported;
    const resolvedModel = resolveControlModel(model, serial);
    if (!resolvedModel || !firmware?.trim() || !serial?.trim()) {
        return {available: false, reason: "identity-unavailable"};
    }
    const normalizedModel = resolvedModel.trim().toLowerCase();
    const cleanFirmware = firmware.trim();
    const cleanSerial = serial.trim();
    const matches = profiles.filter((profile) =>
        profile.models.some((m) => m.trim().toLowerCase() === normalizedModel)
        && profile.firmwares.includes(cleanFirmware)
        && (profile.serials.includes("*") || profile.serials.includes(cleanSerial))
    );
    if (matches.length === 0) return {available: false, reason: "unqualified"};
    if (matches.length !== 1) return {available: false, reason: "ambiguous-profile"};
    return {available: true, profile: matches[0]};
}
