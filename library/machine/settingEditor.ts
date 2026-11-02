import type {ControlIdentity, SettingEditorState, SettingId, SettingReadings, SettingValues} from "@/library/machine/controlModel";
import type MachineControls from "@/library/machine/MachineControls";

export const MACHINE_SETTING_GROUPS = [
    {title: "Machine settings", ids: ["temperatureUnit", "weightUnit", "brightness", "waterSource"]},
    {title: "Tuning", ids: ["pourRadius", "vibrationAmplitude"]}
] as const;

export const MACHINE_SETTING_TITLES: Record<SettingId, string> = {
    temperatureUnit: "Temperature unit", weightUnit: "Weight unit", brightness: "Brightness",
    waterSource: "Water source", pourRadius: "Pour radius", vibrationAmplitude: "Vibration amplitude"
};

export function isSettingId(value: unknown): value is SettingId {
    return typeof value === "string" && Object.hasOwn(MACHINE_SETTING_TITLES, value);
}

export function emptySettingEditor(id: SettingId): SettingEditorState {
    switch (id) {
        case "temperatureUnit": return {id, proposal: null};
        case "weightUnit": return {id, proposal: null};
        case "brightness": return {id, proposal: null};
        case "waterSource": return {id, proposal: null};
        case "pourRadius": return {id, proposal: null};
        case "vibrationAmplitude": return {id, proposal: null};
    }
}

/** Numeric editing starts only from a real reading, never a guessed first rung. */
export function proposeReading(id: SettingId, readings: SettingReadings): SettingEditorState {
    switch (id) {
        case "temperatureUnit": return {id, proposal: readings.temperatureUnit};
        case "weightUnit": return {id, proposal: readings.weightUnit};
        case "brightness": return {id, proposal: readings.brightness};
        case "waterSource": return {id, proposal: readings.waterSource};
        case "pourRadius": return {id, proposal: readings.pourRadius};
        case "vibrationAmplitude": return {id, proposal: readings.vibrationAmplitude};
    }
}

export function settingValueLabel(value: SettingValues[SettingId] | null): string {
    if (value === null) return "Unavailable";
    if (value === "tank") return "Tank";
    if (value === "tap") return "Plumbed supply";
    if (value === "C" || value === "F") return `°${value}`;
    return String(value);
}

export async function applySettingProposal(
    controls: MachineControls, identity: ControlIdentity, draft: SettingEditorState
): Promise<void> {
    // Narrow the discriminant before dispatch; key/value correlations survive
    // the UI boundary without converting between setting kinds.
    switch (draft.id) {
        case "temperatureUnit":
            if (draft.proposal !== null) return controls.applySetting(identity, draft.id, draft.proposal);
            break;
        case "weightUnit":
            if (draft.proposal !== null) return controls.applySetting(identity, draft.id, draft.proposal);
            break;
        case "brightness":
            if (draft.proposal !== null) return controls.applySetting(identity, draft.id, draft.proposal);
            break;
        case "waterSource":
            if (draft.proposal !== null) return controls.applySetting(identity, draft.id, draft.proposal);
            break;
        case "pourRadius":
            if (draft.proposal !== null) return controls.applySetting(identity, draft.id, draft.proposal);
            break;
        case "vibrationAmplitude":
            if (draft.proposal !== null) return controls.applySetting(identity, draft.id, draft.proposal);
            break;
    }
    throw new Error("Choose a proposal before applying.");
}
