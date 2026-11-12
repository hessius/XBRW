import {buildType1, parseNotification, type MachineInfo} from "./protocol";
import type {
    ControlCommand,
    ControlFeedback,
    ControlQualification,
    ControlTokens,
    ControlProtocol,
    ControlExchange
} from "./controlProtocol";
import type {SettingId, SettingReadings, SettingValues} from "./controlModel";
import {studioQualifiedProfile} from "./controlCapabilities";

export class StudioControlProtocol implements ControlProtocol {
    private activeTokens: ControlTokens | null = null;

    actualWaterSource(info: MachineInfo | null): "tank" | "tap" | null {
        if (!info) return null;
        return info.waterFeed === "tap" ? "tap" : "tank";
    }

    plan(command: ControlCommand, tokens: ControlTokens): ControlExchange {
        this.activeTokens = tokens;
        if (command.kind === "inspect") {
            return {
                frame: null,
                refreshInfo: true,
                deadlineMs: 4000
            };
        }
        if (command.kind === "setting") {
            return {
                frame: this.encodeSetting(command.id, command.value),
                refreshInfo: true,
                deadlineMs: 4000
            };
        }
        throw new Error(`Unsupported control command: ${command.kind}`);
    }

    private encodeSetting(id: SettingId, value: SettingValues[SettingId]): Uint8Array {
        switch (id) {
            case "temperatureUnit":
                // 0 = Fahrenheit, 1 = Celsius
                return buildType1(8010, [value === "C" ? 1 : 0]);
            case "weightUnit":
                // 0 = ml, 1 = g, 2 = oz
                return buildType1(8005, [value === "ml" ? 0 : value === "g" ? 1 : 2]);
            case "brightness":
                return buildType1(8103, [value as number]);
            case "waterSource":
                // 0 = tank, 1 = tap
                return buildType1(4508, [value === "tap" ? 1 : 0]);
            case "pourRadius":
            case "vibrationAmplitude":
                throw new Error("Mechanical calibration write is unconfirmed and not supported on this machine.");
        }
    }

    decode(frame: Uint8Array): ControlFeedback | null {
        if (!this.activeTokens) return null;
        const parsed = parseNotification(frame);
        if (parsed.kind === "info") {
            const temp = parsed.settingsRaw?.temperatureUnit;
            const weight = parsed.settingsRaw?.weightUnit;
            const readings: SettingReadings = {
                temperatureUnit: temp === 1 ? "C" : temp === 0 ? "F" : null,
                weightUnit: weight === 1 ? "g" : weight === 2 ? "oz" : weight === 0 ? "ml" : null,
                brightness: parsed.settingsRaw?.brightness ?? null,
                waterSource: parsed.waterFeed,
                pourRadius: parsed.settingsRaw?.pourRadius ?? null,
                vibrationAmplitude: parsed.settingsRaw?.vibrationAmplitude ?? null
            };
            return {
                ...this.activeTokens,
                value: {
                    kind: "settings",
                    readings
                }
            };
        }
        return null;
    }
}

export const productionQualifications: readonly ControlQualification[] = Object.freeze([
    Object.freeze({
        profile: studioQualifiedProfile,
        protocol: new StudioControlProtocol()
    })
]);
