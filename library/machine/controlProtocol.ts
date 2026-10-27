import type {ControlCapabilityProfile} from "./controlCapabilities";
import type {GrindRequest, Pattern, PourRequest, SettingId, SettingReadings, SettingValues, ToolId} from "./controlModel";
import type {MachineInfo} from "./protocol";

/** Correlation must be proven on the wire, not assigned to a later unsolicited reply. */
export type ControlTokens = Readonly<{session: number; transaction: number}>;
type SettingCommand = {
    [K in SettingId]: {kind: "setting"; id: K; value: SettingValues[K]}
}[SettingId];
export type ControlCommand =
    | {kind: "enter" | "exit" | "stop"; tool: ToolId | null}
    | {kind: "inspect"; tool: ToolId | null; recovery?: boolean; readOnly?: boolean}
    | {kind: "grind"; request: Readonly<GrindRequest>}
    | {kind: "pour"; request: Readonly<PourRequest>}
    | {kind: "tare"}
    | {kind: "temperature"; celsius: number}
    | {kind: "pattern"; pattern: Pattern}
    | SettingCommand;
export type ControlFeedback = ControlTokens & {value:
    | {kind: "ready" | "closed" | "running" | "terminal" | "active" | "tared"}
    | {kind: "refused"; reason: string}
    | {kind: "temperature"; celsius: number}
    | {kind: "pattern"; pattern: Pattern}
    | {kind: "settings"; readings: Readonly<SettingReadings>}
    | {kind: "cup"; grams: number}
    | {kind: "dispensed"; ml: number}
};
export type ControlExchange = Readonly<{
    frame: Uint8Array | null;
    deadlineMs: number;
    /** The setting readback needs the lease's 8100, after sending its proposal. */
    refreshInfo?: boolean;
}>;
/**
 * No production implementation is qualified. Every encoding, correlation,
 * deadline, unit conversion and optional freshness policy needs device evidence.
 * Entry/exit/inspection frames must never start motion. Terminal is proof of
 * stopped hardware, not an ACK. Dispensed telemetry is run-scoped, not cup mass.
 */
export interface ControlProtocol {
    plan(command: ControlCommand, tokens: ControlTokens): ControlExchange;
    decode(frame: Uint8Array): ControlFeedback | null;
    actualWaterSource(info: MachineInfo | null, infoAt: number): "tank" | "tap" | null;
    readonly telemetryFreshMs?: number;
}
export type ControlQualification = Readonly<{
    profile: ControlCapabilityProfile;
    protocol: ControlProtocol;
}>;
