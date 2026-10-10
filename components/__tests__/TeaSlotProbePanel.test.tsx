import React from "react";
import {fireEvent, screen} from "@testing-library/react-native";
import * as Clipboard from "expo-clipboard";
import {renderWithProviders} from "@/test-utils/render";
import {createTestDatabase} from "@/test-utils/sqlite";
import TeaSlotProbePanel from "@/components/TeaSlotProbePanel";
import {notify} from "@/components/XbrwToast";
import {SlotDatabase} from "@/library/slots/SlotDatabase";
import {coffee} from "@/library/slots/__tests__/fixtures";
import {snapshotRecipe, type SlotRecord} from "@/library/slots/slotModel";
import {formatTeaProbeEvidence, restoreTeaSlotOriginal, writeTeaSlotProbe} from "@/library/slots/teaSlotProbe";

jest.mock("expo-clipboard", () => ({setStringAsync: jest.fn().mockResolvedValue(true)}));
jest.mock("@/components/XbrwToast", () => ({notify: jest.fn()}));

const identity = {deviceId: "one", serial: "serial"};
const port = {available: true, acquire: async () => ({
    sendAndConfirm: async () => {}, confirmSaved: async () => {}, release: () => {}
})};
const dev = __DEV__;

function seeded() {
    const store = new SlotDatabase(createTestDatabase());
    for (const index of [0, 1, 2] as const) store.assign("one", index, snapshotRecipe(coffee(`Original ${index}`)));
    return store;
}

function props(record: SlotRecord) {
    return {
        ...identity, record, connected: true, available: true, busy: false, running: false, error: null,
        onWriteProbe: jest.fn(), onRestore: jest.fn(), onObserve: jest.fn().mockReturnValue(true)
    };
}

afterEach(() => { Object.defineProperty(global, "__DEV__", {value: dev}); jest.clearAllMocks(); });

it("shows fixed steep parameters, originals and safety instructions without performing an action on mount", async () => {
    const options = props(seeded().read("one"));
    await renderWithProviders(<TeaSlotProbePanel {...options}/>);
    expect(screen.getByText(/1 steep, 60 ml, 70 C, 60 s/)).toBeOnTheScreen();
    expect(screen.getByText(/Originals: complete phone draft set/)).toBeOnTheScreen();
    expect(screen.getByText("Original B: Original 1")).toBeOnTheScreen();
    expect(screen.getByText(/Omni Tea Brewer, an empty receiving vessel/)).toBeOnTheScreen();
    expect(screen.getByText(/Stop after refusal, incomplete or uncertain saving/)).toBeOnTheScreen();
    expect(screen.queryByText(/1:12|REMOVED FROM LIBRARY/)).toBeNull();
    expect(options.onWriteProbe).not.toHaveBeenCalled();
    expect(options.onRestore).not.toHaveBeenCalled();
    expect(options.onObserve).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole("button", {name: "WRITE PROBE"}));
    expect(options.onWriteProbe).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", {name: /brew|start/i})).toBeNull();
});

it.each(["unpaired", "serial", "offline", "busy", "running", "unavailable", "incomplete"] as const)(
    "blocks a new probe for %s without calling the writer", async (reason) => {
        const options = props(seeded().read("one"));
        if (reason === "unpaired") options.deviceId = "";
        if (reason === "serial") options.serial = "";
        if (reason === "offline") options.connected = false;
        if (reason === "busy") options.busy = true;
        if (reason === "running") options.running = true;
        if (reason === "unavailable") options.available = false;
        if (reason === "incomplete") options.record = {...options.record, drafts: [null, null, null]};
        await renderWithProviders(<TeaSlotProbePanel {...options}/>);
        const write = screen.getByRole("button", {name: "WRITE PROBE"});
        expect(write).toBeDisabled();
        await fireEvent.press(write);
        expect(options.onWriteProbe).not.toHaveBeenCalled();
    }
);

it("prefers last-written originals even when current drafts are incomplete", async () => {
    const store = seeded();
    await writeTeaSlotProbe(store, identity, port);
    await restoreTeaSlotOriginal(store, identity, port);
    const written = store.read("one").written!;
    const record: SlotRecord = {version: 1, drafts: [null, null, null], written, journal: null};
    await renderWithProviders(<TeaSlotProbePanel {...props(record)}/>);
    expect(screen.getByText(/Originals: last written by XBRW/)).toBeOnTheScreen();
    expect(screen.getByRole("button", {name: "WRITE PROBE"})).toBeEnabled();
});

it("keeps pending and cancelled candidates unconfirmed and requires explicit recovery before restoration", async () => {
    const store = seeded();
    const failingPort = {...port, acquire: async () => ({
        sendAndConfirm: async () => { throw new Error("Receipt unknown"); },
        confirmSaved: async () => {}, release: () => {}
    })};
    await expect(writeTeaSlotProbe(store, identity, failingPort)).rejects.toThrow();
    const options = props(store.read("one"));
    const view = await renderWithProviders(<TeaSlotProbePanel {...options}/>);
    expect(screen.getByText(/Candidate saving is unresolved/)).toBeOnTheScreen();
    expect(screen.getByRole("button", {name: "RESTORE ORIGINAL SET"})).toBeDisabled();
    expect(screen.queryByRole("button", {name: "WRITE PROBE"})).toBeNull();
    store.cancel("one", store.read("one").journal!.id);
    await view.rerender(<TeaSlotProbePanel {...options} record={store.read("one")}/>);
    expect(screen.getByText(/Candidate or restoration was not confirmed/)).toBeOnTheScreen();
    expect(screen.queryByText(/Candidate storage confirmed/)).toBeNull();
    await fireEvent.press(screen.getByRole("button", {name: "RESTORE ORIGINAL SET"}));
    expect(options.onRestore).toHaveBeenCalledTimes(1);
});

it("retains restoration and copy in production, and never offers another trial after restoration", async () => {
    const store = seeded();
    await writeTeaSlotProbe(store, identity, port);
    Object.defineProperty(global, "__DEV__", {value: false});
    const options = props(store.read("one"));
    const view = await renderWithProviders(<TeaSlotProbePanel {...options}/>);
    expect(screen.getByRole("button", {name: "RESTORE ORIGINAL SET"})).toBeEnabled();
    expect(screen.queryByRole("button", {name: "WRITE PROBE"})).toBeNull();
    await restoreTeaSlotOriginal(store, identity, port);
    await view.rerender(<TeaSlotProbePanel {...options} record={store.read("one")}/>);
    expect(screen.getByText(/Original set restored/)).toBeOnTheScreen();
    expect(screen.queryByRole("button", {name: "RESTORE ORIGINAL SET"})).toBeNull();
    await fireEvent.press(screen.getByRole("button", {name: "COPY PROBE EVIDENCE"}));
    expect(Clipboard.setStringAsync).toHaveBeenCalledWith(formatTeaProbeEvidence(store.read("one").experiment!));
    expect(notify).toHaveBeenCalledWith({tone: "success", message: "Tea slot probe evidence copied"});
    Object.defineProperty(global, "__DEV__", {value: true});
    await view.rerender(<TeaSlotProbePanel {...options} record={store.read("one")}/>);
    expect(screen.queryByRole("button", {name: "WRITE PROBE"})).toBeNull();
});

it("records actual display, fractional held time, drain and note separately without deriving physical success", async () => {
    const store = seeded();
    await writeTeaSlotProbe(store, identity, port, {id: () => "trial"});
    const options = props(store.read("one"));
    await renderWithProviders(<TeaSlotProbePanel {...options}/>);
    await fireEvent.changeText(screen.getByLabelText("Actual machine display"), "OFF / A");
    await fireEvent.changeText(screen.getByLabelText("Observed held seconds"), "61.5");
    await fireEvent.press(screen.getByRole("button", {name: "Drained as tea: Yes"}));
    await fireEvent.changeText(screen.getByLabelText("Tea probe observation note"), "Manual timing");
    await fireEvent.press(screen.getByRole("button", {name: "SAVE OBSERVATION"}));
    expect(options.onObserve).toHaveBeenCalledWith("trial", {
        at: expect.any(Number), display: "OFF / A", heldSeconds: 61.5, drainedAsTea: true, note: "Manual timing"
    });
    expect(store.read("one").experiment?.observation).toBeNull();
    expect(options.onRestore).not.toHaveBeenCalled();
    expect(options.onWriteProbe).not.toHaveBeenCalled();
});

it("uses unknown rather than zero/no, rejects invalid time and does not claim a failed observation save", async () => {
    const store = seeded();
    await writeTeaSlotProbe(store, identity, port);
    const options = props(store.read("one"));
    options.onObserve.mockReturnValue(false);
    await renderWithProviders(<TeaSlotProbePanel {...options}/>);
    await fireEvent.changeText(screen.getByLabelText("Observed held seconds"), "-2");
    await fireEvent.press(screen.getByRole("button", {name: "SAVE OBSERVATION"}));
    expect(screen.getByText(/Enter an actual held time/)).toBeOnTheScreen();
    expect(options.onObserve).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByLabelText("Observed held seconds"), "");
    await fireEvent.press(screen.getByRole("button", {name: "SAVE OBSERVATION"}));
    expect(options.onObserve).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
        heldSeconds: null, drainedAsTea: null
    }));
    expect(screen.queryByText("Observation saved on this phone.")).toBeNull();
});

it("shows storage errors and blocks a stale retained serial without losing local copy", async () => {
    const store = seeded();
    await writeTeaSlotProbe(store, identity, port);
    await renderWithProviders(<TeaSlotProbePanel {...props(store.read("one"))}
        serial="other" error="disk full"/>);
    expect(screen.getByText("disk full")).toBeOnTheScreen();
    expect(screen.getByText(/Reconnect to the machine and serial/)).toBeOnTheScreen();
    expect(screen.getByRole("button", {name: "RESTORE ORIGINAL SET"})).toBeDisabled();
    expect(screen.getByRole("button", {name: "SAVE OBSERVATION"})).toBeDisabled();
    expect(screen.getByRole("button", {name: "COPY PROBE EVIDENCE"})).toBeEnabled();
});

it("reports clipboard failure rather than a success toast", async () => {
    const store = seeded();
    await writeTeaSlotProbe(store, identity, port);
    jest.mocked(Clipboard.setStringAsync).mockRejectedValueOnce(new Error("clipboard denied"));
    await renderWithProviders(<TeaSlotProbePanel {...props(store.read("one"))}/>);
    await fireEvent.press(screen.getByRole("button", {name: "COPY PROBE EVIDENCE"}));
    expect(notify).toHaveBeenCalledWith({
        tone: "error", message: "Could not copy tea slot probe evidence: clipboard denied"
    });
});
