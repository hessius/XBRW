import React from "react";
import {fireEvent, screen} from "@testing-library/react-native";
import {renderWithProviders} from "@/test-utils/render";
import TeaSlotProbePanel from "@/components/TeaSlotProbePanel";
import {createTestDatabase} from "@/test-utils/sqlite";
import {SlotDatabase} from "@/library/slots/SlotDatabase";
import {snapshotRecipe} from "@/library/slots/slotModel";
import {coffee} from "@/library/slots/__tests__/fixtures";
import {writeTeaSlotProbe} from "@/library/slots/teaSlotProbe";

const identity = {deviceId: "one", serial: "serial"};
const port = {available: true, acquire: async () => ({
    sendAndConfirm: async () => {}, confirmSaved: async () => {}, release: () => {}
})};
function setup() {
    const store = new SlotDatabase(createTestDatabase());
    for (const index of [0, 1, 2] as const) store.assign("one", index, snapshotRecipe(coffee(`Original ${index}`)));
    const props = {
        ...identity, record: store.read("one"), connected: true, available: true, busy: false,
        running: false, error: null, onWriteProbe: jest.fn(), onRestore: jest.fn(), onObserve: jest.fn(),
        onWriteLab: jest.fn(), onRecoveryCommand: jest.fn(), onClearRecovery: jest.fn()
    };
    return {store, props};
}

it("offers source-backed steeps and requires an explicit confirmation before writing only A", async () => {
    const {props} = setup();
    await renderWithProviders(<TeaSlotProbePanel {...props}/>);
    expect(screen.getByText(/A: 1 steep.*B: 2 steeps.*C: 3 steeps/)).toBeOnTheScreen();
    expect(props.onWriteLab).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole("button", {name: "WRITE STEEP TEST"}));
    expect(props.onWriteLab).toHaveBeenCalledWith("tea-slot-apk-steeps-abc-v1");
    await fireEvent.press(screen.getByRole("button", {name: "TEST SINGLE SLOT RECOVERY"}));
    expect(props.onWriteLab).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/saving screen usually clears after about a minute/)).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", {name: "WRITE ONLY A"}));
    expect(props.onWriteLab).toHaveBeenLastCalledWith("slot-apk-recovery-40526-v1");
});

it("keeps 40526 available for a confirmed partial lab despite its journal, without clearing it automatically", async () => {
    const {store, props} = setup();
    await writeTeaSlotProbe(store, identity, port, {candidateId: "slot-apk-recovery-40526-v1"});
    await renderWithProviders(<TeaSlotProbePanel {...props} record={store.read("one")}/>);
    await fireEvent.press(screen.getByRole("button", {name: "TRY RECOVERY COMMAND"}));
    expect(props.onRecoveryCommand).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole("button", {name: "SEND 40526"}));
    expect(props.onRecoveryCommand).toHaveBeenCalledTimes(1);
    expect(props.onClearRecovery).not.toHaveBeenCalled();
    expect(screen.queryByText(/Candidate storage confirmed/)).toBeNull();
});

it("reflects hardware-qualified steep selectors without claiming this trial has been observed", async () => {
    const {store, props} = setup();
    await writeTeaSlotProbe(store, identity, port, {candidateId: "tea-slot-apk-steeps-abc-v1"});
    await renderWithProviders(<TeaSlotProbePanel {...props} record={store.read("one")}/>);
    expect(screen.getByText(/One, two and three steeps worked in our hardware test/)).toBeOnTheScreen();
    expect(screen.queryByText(/NOT hardware-qualified/)).toBeNull();
    expect(screen.getByText(/UNTESTED until manually observed/)).toBeOnTheScreen();
    expect(props.onObserve).not.toHaveBeenCalled();
});

it("does not expose new experiment dispatch in production, while retaining recovery for a saved partial lab", async () => {
    const {store, props} = setup();
    const dev = __DEV__;
    await writeTeaSlotProbe(store, identity, port, {candidateId: "slot-apk-recovery-40526-v1"});
    Object.defineProperty(global, "__DEV__", {value: false});
    try {
        await renderWithProviders(<TeaSlotProbePanel {...props} record={store.read("one")}/>);
        expect(screen.queryByRole("button", {name: "WRITE STEEP TEST"})).toBeNull();
        expect(screen.getByRole("button", {name: "TRY RECOVERY COMMAND"})).toBeEnabled();
    } finally {
        Object.defineProperty(global, "__DEV__", {value: dev});
    }
});
