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
    grind: GrindPolicy | null;
    pour: PourPolicy | null;
    settings: SettingPolicy;
};

export type ControlCapabilitySelection =
    | {available: true; profile: ControlCapabilityProfile}
    | {available: false; reason: "identity-unavailable" | "unqualified" | "ambiguous-profile"};

// Task 1 has not qualified any standalone controls. Test-injected profiles
// exercise selection and validation only, not device safety or encodings.
const qualifiedProfiles: readonly ControlCapabilityProfile[] = [];

export function lookupControlCapabilities(
    reported: ControlReportedIdentity,
    profiles: readonly ControlCapabilityProfile[] = qualifiedProfiles
): ControlCapabilitySelection {
    const {model, firmware, serial} = reported;
    if (!model?.trim() || !firmware?.trim() || !serial?.trim()) {
        return {available: false, reason: "identity-unavailable"};
    }
    const matches = profiles.filter((profile) =>
        profile.models.includes(model) && profile.firmwares.includes(firmware) && profile.serials.includes(serial)
    );
    if (matches.length === 0) return {available: false, reason: "unqualified"};
    if (matches.length !== 1) return {available: false, reason: "ambiguous-profile"};
    return {available: true, profile: matches[0]};
}
