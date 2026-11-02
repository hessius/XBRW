import Machine from "@/library/machine/Machine";
import MachineControls, {type MachineControlsOptions} from "@/library/machine/MachineControls";
import {ControlRecoveryStore} from "@/library/machine/controlRecovery";
import type {ControlCapabilityProfile} from "@/library/machine/controlCapabilities";
import type {ControlCommand, ControlFeedback, ControlTokens} from "@/library/machine/controlProtocol";
import type {SettingReadings} from "@/library/machine/controlModel";
import {buildType1, MACHINE_STATE} from "@/library/machine/protocol";
import {FakeTransport, machineInfoFrame} from "@/library/machine/__tests__/FakeTransport";
import {notification, status} from "@/library/machine/__tests__/protocolFixtures";

export const settingIdentity = {deviceId: "setting-test", serial: "setting-id"};
export const settingReadings: SettingReadings = {
    temperatureUnit: "C", weightUnit: "g", brightness: 2, waterSource: "tank",
    pourRadius: 3, vibrationAmplitude: 4
};
// Synthetic only. These values, units, tokens and frames qualify no hardware.
export function settingProfile(): ControlCapabilityProfile {
    return {
        id: "setting-test", models: ["test"], firmwares: ["test"], serials: [settingIdentity.serial],
        grind: null, pour: null,
        settings: {
            temperatureUnit: ["C", "F"], weightUnit: ["g", "oz", "ml"], waterSource: ["tank", "tap"],
            brightness: {min: 1, max: 5, step: 1, unit: "test-level"},
            pourRadius: {min: 1, max: 5, step: 1}, vibrationAmplitude: {min: 1, max: 5, step: 1}
        }
    };
}
export type SettingPlan = {command: ControlCommand; tokens: ControlTokens};
class Radio extends FakeTransport {
    get connectedDeviceId() { return this.connectedTo; }
}
export async function machineSettingsFixture(options: {
    production?: boolean; profile?: ControlCapabilityProfile; unsafeInspectionFrame?: boolean;
    reconnect?: MachineControlsOptions["reconnect"];
} = {}) {
    const radio = new Radio();
    radio.infoReply = machineInfoFrame({serial: settingIdentity.serial, model: "test", firmware: "test"});
    let raw = "";
    const recovery = new ControlRecoveryStore({read: () => raw, write: next => { raw = next; }});
    const machine = new Machine(radio, {frameGapMs: 0});
    machine.installControlRecovery(recovery);
    await machine.connect(settingIdentity.deviceId);
    radio.emit(status(MACHINE_STATE.IDLE));
    radio.written = [];
    const planned: SettingPlan[] = [];
    const feedbacks = new Map<number, ControlFeedback>();
    let key = 0;
    let readings = {...settingReadings};
    function feedback(item: SettingPlan, value: ControlFeedback["value"]) {
        const id = ++key;
        feedbacks.set(id, {...item.tokens, value});
        radio.emit(notification(0xFE, 0xFE, [id & 255, id >> 8]));
    }
    const controls = new MachineControls(machine, options.production ? {} : {reconnect: options.reconnect, qualifications: [{
        profile: options.profile ?? settingProfile(),
        protocol: {
            actualWaterSource: () => null,
            plan: (command, tokens) => {
                planned.push({command, tokens});
                return {
                    frame: command.kind === "inspect" && !options.unsafeInspectionFrame
                        ? null : buildType1(60001, [tokens.session, tokens.transaction]),
                    refreshInfo: true, deadlineMs: 100
                };
            },
            decode: frame => frame[3] === 0xFE && frame[4] === 0xFE
                ? feedbacks.get(frame[10] | frame[11] << 8) ?? null : null
        }
    }]});
    const accept = (item: SettingPlan) => {
        const command = item.command;
        if (command.kind === "setting") readings = {...readings, [command.id]: command.value};
        feedback(item, {kind: "settings", readings});
    };
    let respond = accept;
    radio.syntheticWrite = frame => {
        if ((frame[3] | frame[4] << 8) === 8100) respond(planned[planned.length - 1]);
    };
    return {
        controls, machine, radio, planned, feedback, accept, recovery,
        respond: (handler: typeof respond) => { respond = handler; },
        readings: (next: SettingReadings) => { readings = next; }
    };
}
