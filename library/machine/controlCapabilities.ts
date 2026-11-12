import {GrindPolicy, PourPolicy, SettingPolicy} from "@/library/machine/controlModel";

/** Read from the connected machine, never a saved model preference. */
export type ControlReportedIdentity = {
    model: string | null;
    firmware: string | null;
    serial: string | null;
};

/** Exact observed scopes only; no serial-prefix or firmware-family inference. */
export type ControlCapabilityProfile = {
    id: string;
    models: readonly string[];
    firmwares: readonly string[];
    serials: readonly string[];
    /** Explicit standalone scale qualification; other tools imply nothing. */
    scale?: boolean;
    grind: GrindPolicy | null;
    pour: PourPolicy | null;
    settings: SettingPolicy;
};

export type ControlCapabilitySelection =
    | {available: true; profile: ControlCapabilityProfile}
    | {available: false; reason: "identity-unavailable" | "unqualified" | "ambiguous-profile"};

/**
 * Qualified on xBloom Studio firmware V12.0D.500 (2026-11-02).
 * Settings readback confirmed: temp unit (0=F/1=C), weight unit (0=ml/1=g/2=oz),
 * brightness (0-15, levels: 0/1/8/15), water source (0=tank/1=tap),
 * pour radius read (11506, range 400-1000 step 80),
 * agitation amplitude read (11508, range 1000-1500 step 100).
 * Standalone scale/grind/pour tools and write calibration remain unverified.
 */
export const studioQualifiedProfile: ControlCapabilityProfile = {
    id: "studio-v12.0d.500",
    models: ["Studio", "J15", "X15"],
    firmwares: ["V12.0D.500"],
    serials: ["*"],
    scale: false,
    grind: null,
    pour: null,
    settings: {
        temperatureUnit: ["C", "F"],
        weightUnit: ["g", "oz", "ml"],
        brightness: {min: 0, max: 15, step: 1},
        waterSource: ["tank", "tap"],
        pourRadius: {min: 400, max: 1000, step: 80},
        vibrationAmplitude: {min: 1000, max: 1500, step: 100}
    }
};

const qualifiedProfiles: readonly ControlCapabilityProfile[] = [studioQualifiedProfile];

export function lookupControlCapabilities(
    reported: ControlReportedIdentity,
    profiles: readonly ControlCapabilityProfile[] = qualifiedProfiles
): ControlCapabilitySelection {
    const {model, firmware, serial} = reported;
    if (!model?.trim() || !firmware?.trim() || !serial?.trim()) {
        return {available: false, reason: "identity-unavailable"};
    }
    const matches = profiles.filter((profile) =>
        profile.models.includes(model)
        && profile.firmwares.includes(firmware)
        && (profile.serials.includes("*") || profile.serials.includes(serial))
    );
    if (matches.length === 0) return {available: false, reason: "unqualified"};
    if (matches.length !== 1) return {available: false, reason: "ambiguous-profile"};
    return {available: true, profile: matches[0]};
}
