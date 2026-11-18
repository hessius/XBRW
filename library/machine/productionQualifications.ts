import {buildType1, buildType2, parseNotification, type MachineInfo} from "./protocol";
import type {
    ControlCommand,
    ControlFeedback,
    ControlQualification,
    ControlTokens,
    ControlProtocol,
    ControlExchange
} from "./controlProtocol";
import type {Pattern, SettingId, SettingReadings, SettingValues, ToolId} from "./controlModel";
import {studioQualifiedProfile} from "./controlCapabilities";

const PATTERN_CODE: Record<Pattern, number> = {
    centered: 0,
    circular: 1,
    spiral: 2
};

const CODE_PATTERN: Record<number, Pattern> = {
    0: "centered",
    1: "circular",
    2: "spiral"
};

const EMPTY_SETTINGS: SettingReadings = {
    temperatureUnit: null,
    weightUnit: null,
    brightness: null,
    waterSource: null,
    pourRadius: null,
    vibrationAmplitude: null
};

function settingsWith(patch: Partial<SettingReadings>): SettingReadings {
    return {...EMPTY_SETTINGS, ...patch};
}

function floatBitsToInt32(value: number): number {
    const buffer = new ArrayBuffer(4);
    const view = new DataView(buffer);
    view.setFloat32(0, value, true);
    return view.getInt32(0, true);
}

function uint32Bytes(value: number): Uint8Array {
    const out = new Uint8Array(4);
    new DataView(out.buffer).setUint32(0, value >>> 0, true);
    return out;
}

function framePayload(frame: Uint8Array): Uint8Array {
    return frame.length > 12 ? frame.subarray(10, frame.length - 2) : new Uint8Array(0);
}

function readUint32(payload: Uint8Array): number | null {
    if (payload.byteLength < 4) return null;
    return new DataView(payload.buffer, payload.byteOffset, 4).getUint32(0, true);
}

function readFloat32(payload: Uint8Array): number | null {
    if (payload.byteLength < 4) return null;
    const value = new DataView(payload.buffer, payload.byteOffset, 4).getFloat32(0, true);
    return Number.isFinite(value) ? value : null;
}

export class StudioControlProtocol implements ControlProtocol {
    readonly telemetryFreshMs = 3000;
    readonly confirmTargetStopFromCupPlateau = true;
    private pending: {command: ControlCommand; tokens: ControlTokens} | null = null;
    private enterTokens: ControlTokens | null = null;
    private runTokens: ControlTokens | null = null;
    private activeTool: ToolId | null = null;
    private movingStarted = false;
    private waterDispensedObserved = false;

    actualWaterSource(info: MachineInfo | null): "tank" | "tap" | null {
        if (!info) return null;
        return info.waterFeed === "tap" ? "tap" : "tank";
    }

    decodeInfoSettings(info: MachineInfo): SettingReadings {
        const temp = info.settingsRaw?.temperatureUnit;
        const weight = info.settingsRaw?.weightUnit;
        const rawRadius = info.settingsRaw?.pourRadius;
        const rawVibration = info.settingsRaw?.vibrationAmplitude;
        return {
            temperatureUnit: temp === 1 ? "C" : temp === 0 ? "F" : null,
            weightUnit: weight === 1 ? "g" : weight === 2 ? "oz" : weight === 0 ? "ml" : null,
            brightness: info.settingsRaw?.brightness ?? null,
            waterSource: info.waterFeed,
            // 0 in 40521 offset 55/59 means not reported in the info blob on V12.0D.500 (e.g. J15A01B5AF231).
            pourRadius: rawRadius != null && rawRadius > 0 ? rawRadius : null,
            vibrationAmplitude: rawVibration != null && rawVibration > 0 ? rawVibration : null
        };
    }

    plan(command: ControlCommand, tokens: ControlTokens): ControlExchange {
        if (command.kind === "enter") {
            const frame = this.encodeEnter(command.tool);
            this.pending = {command, tokens};
            this.activeTool = command.tool;
            this.enterTokens = tokens;
            this.runTokens = null;
            this.movingStarted = false;
            this.waterDispensedObserved = false;
            return {frame, deadlineMs: 10000};
        }
        if (command.kind === "exit") {
            const frame = this.encodeExit(command.tool);
            this.pending = {command, tokens};
            this.enterTokens = null;
            this.runTokens = null;
            this.movingStarted = false;
            this.waterDispensedObserved = false;
            return {frame, deadlineMs: 10000};
        }
        if (command.kind === "stop") {
            const tool = command.tool ?? this.activeTool;
            if (tool !== "grind" && tool !== "pour") throw new Error("Unsupported stop target.");
            this.pending = {command, tokens};
            return {frame: buildType1(tool === "grind" ? 3505 : 4507), deadlineMs: 10000};
        }
        if (command.kind === "tare") {
            this.pending = {command, tokens};
            return {frame: buildType1(8500), deadlineMs: 10000};
        }
        if (command.kind === "grind") {
            this.pending = {command, tokens};
            this.movingStarted = true;
            return {
                frame: buildType1(3500, [
                    1000,
                    Math.round(command.request.grindSize),
                    Math.round(command.request.rpm)
                ]),
                deadlineMs: 10000
            };
        }
        if (command.kind === "pour") {
            const {request} = command;
            const volumeMl = request.mode === "target" ? Math.round(request.volumeMl) : 0;
            this.pending = {command, tokens};
            this.movingStarted = true;
            this.waterDispensedObserved = false;
            return {
                frame: buildType1(4506, [
                    Math.round(request.temperatureC * 10),
                    PATTERN_CODE[request.pattern],
                    volumeMl,
                    floatBitsToInt32(request.flowMlPerSecond * 10)
                ]),
                deadlineMs: 10000
            };
        }
        if (command.kind === "temperature") {
            this.pending = {command, tokens};
            return {
                frame: buildType1(4510, [Math.round(command.celsius * 10)]),
                deadlineMs: 10000
            };
        }
        if (command.kind === "pattern") {
            this.pending = {command, tokens};
            return {
                frame: buildType1(8016, [PATTERN_CODE[command.pattern]]),
                deadlineMs: 10000
            };
        }
        if (command.kind === "inspect") {
            if (!command.recovery && command.tool === null) {
                if (command.settingId === "vibrationAmplitude") {
                    this.pending = {command, tokens};
                    return {
                        frame: buildType2(11508, new Uint8Array(0)),
                        refreshInfo: false,
                        inertRead: true,
                        deadlineMs: 10000
                    };
                }
                if (command.settingId === "pourRadius") {
                    this.pending = {command, tokens};
                    return {
                        frame: buildType2(11506, new Uint8Array(0)),
                        refreshInfo: true,
                        inertRead: true,
                        deadlineMs: 12000
                    };
                }
            }
            this.pending = {command, tokens};
            return {
                frame: null,
                refreshInfo: true,
                deadlineMs: 12000
            };
        }
        if (command.kind === "setting") {
            const frame = this.encodeSetting(command.id, command.value);
            const tuning = command.id === "pourRadius" || command.id === "vibrationAmplitude";
            this.pending = {command, tokens};
            return {
                frame,
                refreshInfo: !tuning,
                deadlineMs: tuning ? 10000 : 12000
            };
        }
        throw new Error(`Unsupported control command: ${String((command as {kind: unknown}).kind)}`);
    }

    private encodeEnter(tool: ToolId | null): Uint8Array {
        switch (tool) {
            case "scale":
                return buildType1(8003);
            case "grind":
                return buildType1(8006, [60, 80]);
            case "pour":
                return buildType1(8007, [1, floatBitsToInt32(250.0)]);
            default:
                throw new Error(`Unsupported tool entry: ${String(tool)}`);
        }
    }

    private encodeExit(tool: ToolId | null): Uint8Array {
        switch (tool) {
            case "scale":
                return buildType1(8014);
            case "grind":
                return buildType1(8012);
            case "pour":
                return buildType1(8013);
            default:
                throw new Error(`Unsupported tool exit: ${String(tool)}`);
        }
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
                return buildType2(11507, uint32Bytes(value as number));
            case "vibrationAmplitude":
                return buildType2(11509, uint32Bytes(value as number));
        }
    }

    decode(frame: Uint8Array): ControlFeedback | null {
        const parsed = parseNotification(frame);
        if (parsed.kind === "unknown") return null;

        if (parsed.kind === "cupWeight") {
            if (this.runTokens && this.activeTool === "pour") {
                return {...this.runTokens, value: {kind: "cup", grams: parsed.grams}};
            }
            if (this.enterTokens && this.activeTool === "scale") {
                return {...this.enterTokens, value: {kind: "cup", grams: parsed.grams}};
            }
            return null;
        }
        if (parsed.kind === "waterWeight") {
            if (this.runTokens && this.activeTool === "pour") {
                if (parsed.grams > 0) this.waterDispensedObserved = true;
                if (this.waterDispensedObserved) {
                    return {...this.runTokens, value: {kind: "dispensed", ml: parsed.grams}};
                }
            }
            return null;
        }

        const pending = this.pending;
        if (pending) {
            const matched = this.matchPending(pending.command, pending.tokens, parsed, frame);
            if (matched) {
                this.pending = null;
                return matched;
            }
        }

        // Unsolicited natural completion while a moving tool is active.
        if (this.runTokens && this.pending?.command.kind !== "grind" && this.pending?.command.kind !== "pour") {
            const grindDone = this.activeTool === "grind" && (
                (parsed.kind === "event" && (parsed.code === 40507 || parsed.code === 3505 || parsed.code === 9004))
                || (parsed.kind === "status" && (parsed.state === 0x02 || parsed.state === 0x01 || parsed.state === 0x41))
            );
            const pourDone = this.activeTool === "pour" && (
                (parsed.kind === "event" && (parsed.code === 4507 || parsed.code === 40511 || parsed.code === 9006))
                || (parsed.kind === "status" && (parsed.state === 0x03 || parsed.state === 0x01 || parsed.state === 0x41))
            );
            if (grindDone || pourDone) {
                const tokens = this.runTokens;
                this.runTokens = null;
                this.movingStarted = false;
                this.waterDispensedObserved = false;
                return {...tokens, value: {kind: "terminal"}};
            }
        }

        return null;
    }

    private matchPending(
        command: ControlCommand,
        tokens: ControlTokens,
        parsed: ReturnType<typeof parseNotification>,
        frame: Uint8Array
    ): ControlFeedback | null {
        const payload = framePayload(frame);

        switch (command.kind) {
            case "enter": {
                if (command.tool === "scale" && ((parsed.kind === "event" && parsed.code === 8003)
                    || (parsed.kind === "status" && (parsed.state === 0x04 || parsed.state === 0x05)))) {
                    return {...tokens, value: {kind: "ready"}};
                }
                if (command.tool === "grind" && ((parsed.kind === "event" && parsed.code === 8006)
                    || (parsed.kind === "status" && parsed.state === 0x02))) {
                    return {...tokens, value: {kind: "ready"}};
                }
                if (command.tool === "pour" && ((parsed.kind === "event" && parsed.code === 8007)
                    || (parsed.kind === "status" && parsed.state === 0x03))) {
                    return {...tokens, value: {kind: "ready"}};
                }
                return null;
            }
            case "exit": {
                const exitCode = command.tool === "scale" ? 8014 : command.tool === "grind" ? 8012 : 8013;
                if ((parsed.kind === "event" && parsed.code === exitCode)
                    || (parsed.kind === "status" && (parsed.state === 0x01 || parsed.state === 0x41))) {
                    this.activeTool = null;
                    this.enterTokens = null;
                    this.runTokens = null;
                    this.movingStarted = false;
                    return {...tokens, value: {kind: "closed"}};
                }
                return null;
            }
            case "tare":
                return parsed.kind === "event" && parsed.code === 8500
                    ? {...tokens, value: {kind: "tared"}}
                    : null;
            case "grind":
                if ((parsed.kind === "event" && parsed.code === 3500)
                    || (parsed.kind === "status" && parsed.state === 0x22)) {
                    this.runTokens = tokens;
                    return {...tokens, value: {kind: "running"}};
                }
                return null;
            case "pour":
                if ((parsed.kind === "event" && parsed.code === 4506)
                    || (parsed.kind === "status" && parsed.state === 0x23)) {
                    this.runTokens = tokens;
                    return {...tokens, value: {kind: "running"}};
                }
                return null;
            case "temperature": {
                if (parsed.kind !== "event" || parsed.code !== 4510) return null;
                if (payload.byteLength === 0) {
                    return {...tokens, value: {kind: "temperature", celsius: command.celsius}};
                }
                if (payload.byteLength < 4) return null;
                const targetTenths = Math.round(command.celsius * 10);
                const f32 = readFloat32(payload);
                const u32 = readUint32(payload);
                if ((f32 !== null && Math.round(f32) === targetTenths) || u32 === targetTenths) {
                    return {...tokens, value: {kind: "temperature", celsius: command.celsius}};
                }
                if (f32 !== null && f32 >= 100 && f32 <= 1500) {
                    return {...tokens, value: {kind: "temperature", celsius: Math.round(f32 / 10)}};
                }
                if (u32 !== null && u32 >= 100 && u32 <= 1500) {
                    return {...tokens, value: {kind: "temperature", celsius: Math.round(u32 / 10)}};
                }
                return null;
            }
            case "pattern": {
                if (parsed.kind !== "event" || parsed.code !== 8016) return null;
                if (payload.byteLength === 0) {
                    return {...tokens, value: {kind: "pattern", pattern: command.pattern}};
                }
                if (payload.byteLength < 4) return null;
                const u32 = readUint32(payload)!;
                const decoded = CODE_PATTERN[u32];
                return decoded ? {...tokens, value: {kind: "pattern", pattern: decoded}} : null;
            }
            case "stop": {
                const tool = command.tool ?? this.activeTool;
                const terminalEvent = parsed.kind === "event" && (
                    tool === "grind" ? (parsed.code === 3505 || parsed.code === 40507)
                        : tool === "pour" ? (parsed.code === 4507 || parsed.code === 40511 || parsed.code === 9006)
                            : false
                );
                const terminalStatus = parsed.kind === "status" && (
                    parsed.state === 0x01 || parsed.state === 0x41
                    || (tool === "grind" && parsed.state === 0x02)
                    || (tool === "pour" && parsed.state === 0x03)
                );
                if (terminalEvent || terminalStatus) {
                    this.runTokens = null;
                    this.movingStarted = false;
                    this.waterDispensedObserved = false;
                    return {...tokens, value: {kind: "terminal"}};
                }
                return null;
            }
            case "inspect": {
                if (command.recovery && command.tool !== null) {
                    if (parsed.kind === "status") {
                        if (parsed.state === 0x01 || parsed.state === 0x41) {
                            this.runTokens = null;
                            this.enterTokens = null;
                            this.activeTool = null;
                            this.movingStarted = false;
                            return {
                                ...tokens,
                                value: {kind: command.tool === "scale" ? "closed" : "terminal"}
                            };
                        }
                        if (parsed.state === 0x02 || parsed.state === 0x22
                            || parsed.state === 0x03 || parsed.state === 0x23 || parsed.state === 0x10
                            || parsed.state === 0x04 || parsed.state === 0x05) {
                            return {...tokens, value: {kind: "active"}};
                        }
                    }
                    if (parsed.kind === "info" && this.activeTool !== null && !this.movingStarted && this.runTokens === null) {
                        this.enterTokens = null;
                        this.activeTool = null;
                        return {...tokens, value: {kind: "closed"}};
                    }
                    return null;
                }
                if (command.tool === null) {
                    if (command.settingId === "vibrationAmplitude"
                        && parsed.kind === "event" && parsed.code === 11508) {
                        const raw = readUint32(payload);
                        if (raw === null) return null;
                        return {...tokens, value: {kind: "settings", readings: settingsWith({vibrationAmplitude: raw})}};
                    }
                    if (command.settingId === "pourRadius"
                        && parsed.kind === "event" && parsed.code === 11506) {
                        const raw = readUint32(payload);
                        if (raw === null || raw <= 0) return null;
                        return {...tokens, value: {kind: "settings", readings: settingsWith({pourRadius: raw})}};
                    }
                    if (parsed.kind === "info") {
                        return {...tokens, value: {kind: "settings", readings: this.decodeInfoSettings(parsed)}};
                    }
                }
                return null;
            }
            case "setting": {
                if (command.id === "pourRadius" && parsed.kind === "event" && parsed.code === 11507) {
                    if (payload.byteLength !== 0 && payload.byteLength < 4) return null;
                    const raw = readUint32(payload);
                    const value = raw !== null ? raw : command.value;
                    return {...tokens, value: {kind: "settings", readings: settingsWith({pourRadius: value})}};
                }
                if (command.id === "vibrationAmplitude" && parsed.kind === "event" && parsed.code === 11509) {
                    if (payload.byteLength !== 0 && payload.byteLength < 4) return null;
                    const raw = readUint32(payload);
                    const value = raw !== null ? raw : command.value;
                    return {...tokens, value: {kind: "settings", readings: settingsWith({vibrationAmplitude: value})}};
                }
                if (parsed.kind === "info") {
                    return {...tokens, value: {kind: "settings", readings: this.decodeInfoSettings(parsed)}};
                }
                return null;
            }
        }
    }
}

export function createProductionQualifications(): readonly ControlQualification[] {
    return Object.freeze([
        Object.freeze({
            profile: studioQualifiedProfile,
            protocol: new StudioControlProtocol()
        })
    ]);
}

export const productionQualifications: readonly ControlQualification[] = createProductionQualifications();
