import Machine from "@/library/machine/Machine";
import MachineControls from "@/library/machine/MachineControls";
import {ControlRecoveryStore} from "@/library/machine/controlRecovery";
import type {ControlCapabilityProfile} from "@/library/machine/controlCapabilities";
import type {ControlCommand, ControlFeedback, ControlTokens} from "@/library/machine/controlProtocol";
import {buildType1, MACHINE_STATE} from "@/library/machine/protocol";
import {FakeTransport, machineInfoFrame} from "@/library/machine/__tests__/FakeTransport";
import {notification, status} from "@/library/machine/__tests__/protocolFixtures";

// Synthetic adapter only. No command, bound or deadline here qualifies hardware.
export const identity = {deviceId: "controls-test", serial: "hook-serial"};
const profile: ControlCapabilityProfile = {
    id: "hook-test", models: ["test"], firmwares: ["test"], serials: [identity.serial],
    grind: {grindSize: {min: 1, max: 10, step: 1}, rpm: {min: 100, max: 200, step: 10}},
    pour: null, settings: {brightness: {min: 1, max: 5, step: 1}}
};
export type Planned = {command: ControlCommand; tokens: ControlTokens};
class Radio extends FakeTransport {
    get connectedDeviceId() { return this.connectedTo; }
}
export async function controlFixture() {
    const radio = new Radio();
    radio.infoReply = machineInfoFrame({serial: identity.serial, model: "test", firmware: "test"});
    let raw = "";
    const recovery = new ControlRecoveryStore({read: () => raw, write: value => { raw = value; }});
    const machine = new Machine(radio, {frameGapMs: 0});
    machine.installControlRecovery(recovery);
    await machine.connect(identity.deviceId);
    radio.emit(status(MACHINE_STATE.IDLE));
    const planned: Planned[] = [];
    const feedbacks = new Map<number, ControlFeedback>();
    let next = 0;
    let respond: (item: Planned) => void = () => {};
    function feedback(item: Planned, value: ControlFeedback["value"]) {
        const key = ++next;
        feedbacks.set(key, {...item.tokens, value});
        radio.emit(notification(0xFE, 0xFE, [key & 255, key >> 8]));
    }
    const controls = new MachineControls(machine, {qualifications: [{
        profile,
        protocol: {
            actualWaterSource: () => "tank",
            plan: (command, tokens) => {
                planned.push({command, tokens});
                if (command.kind === "inspect" && command.recovery) {
                    return {frame: null, refreshInfo: true, deadlineMs: 100};
                }
                return {frame: buildType1(60001, [tokens.session, tokens.transaction]), deadlineMs: 100};
            },
            decode: frame => frame[3] === 0xFE && frame[4] === 0xFE
                ? feedbacks.get(frame[10] | frame[11] << 8) ?? null : null
        }
    }]});
    radio.syntheticWrite = frame => {
        const code = frame[3] | frame[4] << 8;
        if (code === 60001 || (code === 8100 && planned.at(-1)?.command.kind === "inspect")) {
            respond(planned[planned.length - 1]);
        }
    };
    const accept = (item: Planned) => {
        const kind = item.command.kind;
        if (kind === "enter") feedback(item, {kind: "ready"});
        if (kind === "grind") feedback(item, {kind: "running"});
        if (kind === "stop") feedback(item, {kind: "terminal"});
        if (kind === "inspect" && item.command.kind === "inspect" && item.command.recovery) {
            feedback(item, {kind: "active"});
        }
        if ((kind === "inspect" && item.command.kind === "inspect" && item.command.tool === null)
            || kind === "setting") {
            feedback(item, {kind: "settings", readings: {
                brightness: item.command.kind === "setting" ? item.command.value as number : 1,
                temperatureUnit: null, weightUnit: null, waterSource: null,
                pourRadius: null, vibrationAmplitude: null
            }});
        }
        if (kind === "exit") feedback(item, {kind: "closed"});
    };
    respond = accept;
    return {
        machine, radio, controls, recovery, planned, feedback, accept,
        respond: (handler: typeof respond) => { respond = handler; }
    };
}
export const flushControls = async () => { for (let i = 0; i < 50; i++) await Promise.resolve(); };
