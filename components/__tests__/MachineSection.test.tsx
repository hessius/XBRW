import React from "react";
import {StyleSheet} from "react-native";
import {fireEvent, screen, waitFor} from "@testing-library/react-native";

import MachineSection from "@/components/MachineSection";
import {machineColours} from "@/constants/colors";
import {renderWithProviders} from "@/test-utils/render";

jest.mock("@/components/XbrwToast", () => ({notify: jest.fn()}));

// Jest forbids a `jest.mock` factory from closing over a variable unless its
// name is `mock`-prefixed, so the plan's `push`/`link` are named `mockPush` and
// `mockLink` here. The router's own method key stays `push` — the component
// calls `router.push`.
const mockPush = jest.fn();
jest.mock("expo-router", () => ({router: {push: (...args: unknown[]) => mockPush(...args)}}));

const mockAsk = jest.fn().mockResolvedValue(true);
const mockLink: {
    machine: {info: null | object; askHowItIsDoing: jest.Mock};
    status: import("@/hooks/useMachine").LinkStatus;
    error: string | null;
    remembered: string;
    connect: jest.Mock;
    forget: jest.Mock;
    canOpenSettings: boolean;
    openSettings: jest.Mock;
    machines: import("@/library/machine/savedMachines").SavedMachine[];
} = {
    machine: {info: null, askHowItIsDoing: mockAsk},
    status: "disconnected",
    error: null,
    remembered: "",
    connect: jest.fn(),
    forget: jest.fn(),
    canOpenSettings: false,
    openSettings: jest.fn(),
    machines: []
};

jest.mock("@/hooks/useMachine", () => ({
    __esModule: true,
    default: () => mockLink,
    useMachine: () => mockLink
}));

// The section now carries a preference row, and the shared settings store opens
// SQLite, which cannot run under Jest. A per-hook in-memory value at the real
// default is all these tests need — the same stand-in `brew.test.tsx` uses.
jest.mock("@/hooks/useSetting", () => {
    const React = require("react");
    const {DEFAULTS} = require("@/library/Settings");
    const useSetting = (key: string) => React.useState(DEFAULTS[key]);
    return {__esModule: true, default: useSetting, useSetting};
});

describe("the machine section", () => {
    beforeEach(() => {
        mockPush.mockClear();
        mockAsk.mockClear();
        mockLink.status = "disconnected";
        mockLink.remembered = "";
        mockLink.machine = {info: null, askHowItIsDoing: mockAsk};
        mockLink.error = null;
        mockLink.canOpenSettings = false;
        mockLink.openSettings.mockClear();
        mockLink.machines = [];
    });

    it("does not ask the machine how it is doing when the settings screen opens", async () => {
        // Asking is a handshake, and the handshake beeps: V12.0D.500 ignores a
        // bare 40521 and sends its vitals only after an 8100 (2026-10-19).
        // Settings shows the vitals heard on this link; Refresh asks.
        mockLink.status = "connected";
        mockLink.remembered = "AA:BB";
        await renderWithProviders(<MachineSection/>);
        expect(mockAsk).not.toHaveBeenCalled();
    });

    it("does not ask a machine it has no link to", async () => {
        // Asking would mean writing to a transport that is not there.
        await renderWithProviders(<MachineSection/>);
        expect(mockAsk).not.toHaveBeenCalled();
    });

    it("is there before a machine has ever been paired", async () => {
        // Otherwise nothing in the app tells a new owner that pairing exists:
        // BREW only appears once a machine is remembered.
        await renderWithProviders(<MachineSection/>);
        expect(await screen.findByText(/no machine paired/i)).toBeTruthy();
        expect(screen.getByLabelText(/^Connect to my machine/)).toBeTruthy();
    });

    it("shows what the machine says about itself once connected", async () => {
        mockLink.status = "connected";
        mockLink.remembered = "AA:BB";
        mockLink.machine = {askHowItIsDoing: mockAsk, info: {
            kind: "info", serial: "J15ABC123456", model: "J15",
            firmware: "V12.0D.500", waterEnough: true, waterFeed: "tank",
            grindSize: 62, mode: "PRO"
        }} as never;

        await renderWithProviders(<MachineSection/>);

        expect(screen.getByText("J15ABC123456")).toBeTruthy();
        expect(screen.getByText("V12.0D.500")).toBeTruthy();
    });

    it("shows a tap-fed machine as plumbed rather than low on water", async () => {
        mockLink.status = "connected";
        mockLink.remembered = "AA:BB";
        mockLink.machine = {askHowItIsDoing: mockAsk, info: {
            kind: "info", serial: "J15ABC123456", model: "J15",
            firmware: "V12.0D.500", waterEnough: false, waterFeed: "tap",
            grindSize: 62, mode: "PRO"
        }} as never;

        await renderWithProviders(<MachineSection/>);

        expect(screen.getByText("Plumbed")).toBeTruthy();
        expect(screen.queryByText("Low")).toBeNull();
    });

    it("says whether a machine is paired at all, not only whether it is connected", async () => {
        // "Not connected" was true of both a phone that has never seen a
        // machine and one that has paired with a machine and lost it, and the
        // difference decides everything: whether the app connects at launch,
        // and whether it pays for a scan. The only way to tell them apart was
        // whether a "forget this machine" button happened to be on screen.
        mockLink.status = "disconnected";
        mockLink.remembered = "";
        await renderWithProviders(<MachineSection/>);
        expect(await screen.findByText(/no machine paired/i)).toBeTruthy();

        mockLink.status = "idle";
        mockLink.remembered = "AA:BB1122";
        await renderWithProviders(<MachineSection/>);
        expect(await screen.findByText("Not connected")).toBeTruthy();
    });

    it("says not connected before an attempt, and every reason a failed one could have after", async () => {
        // "Not connected" = no attempt made. After a failed attempt the radio
        // cannot say why: a machine another phone is connected to stops
        // answering exactly like one that is off. "Not in range" claimed one
        // reason, and was wrong with the machine on the bench beside a phone
        // that had it. The Bluetooth identifier is not in the line either.
        mockLink.remembered = "MY:MACHINE";
        const notFound = "Not found. It may be off, out of range or connected to another phone.";

        mockLink.status = "idle";
        await renderWithProviders(<MachineSection/>);
        expect(await screen.findByText("Not connected")).toBeTruthy();

        mockLink.status = "disconnected";
        await renderWithProviders(<MachineSection/>);
        expect(await screen.findByText(notFound)).toBeTruthy();

        mockLink.status = "failed";
        await renderWithProviders(<MachineSection/>);
        expect(await screen.findByText(notFound)).toBeTruthy();
        expect(screen.queryByText(/MY:MACHINE/)).toBeNull();
        expect(screen.queryByText(/Not in range/)).toBeNull();
    });

    it("tells somebody whose machine another phone has how to get it back", async () => {
        mockLink.remembered = "MY:MACHINE";
        mockLink.status = "failed";
        await renderWithProviders(<MachineSection/>);
        expect(screen.getByText(/close XBRW\+\+ or the xBloom app there/)).toBeTruthy();
    });

    it("opens the console from the status line when there is no connection", async () => {
        // The console is the only place a failed connection can be read about,
        // and the firmware row it used to hide behind is not rendered when
        // there is no firmware to report — so the diagnostic was unreachable in
        // exactly the situation that needs it.
        await renderWithProviders(<MachineSection/>);
        const status = screen.getByLabelText("No machine paired");

        for (let i = 0; i < 7; i++) await fireEvent.press(status);

        expect(mockPush).toHaveBeenCalledWith("/machine");
    });

    it("opens the console after seven taps on the firmware, and not before", async () => {
        mockLink.status = "connected";
        mockLink.remembered = "AA:BB";
        mockLink.machine = {askHowItIsDoing: mockAsk, info: {
            kind: "info", serial: "J15ABC123456", model: "J15",
            firmware: "V12.0D.500", waterEnough: true, waterFeed: "tank",
            grindSize: 62, mode: "PRO"
        }} as never;

        await renderWithProviders(<MachineSection/>);
        const firmware = screen.getByLabelText(/firmware/i);

        for (let i = 0; i < 6; i++) await fireEvent.press(firmware);
        expect(mockPush).not.toHaveBeenCalled();

        await fireEvent.press(firmware);
        expect(mockPush).toHaveBeenCalledWith("/machine");
    });

    it("offers to forget a machine it remembers", async () => {
        mockLink.status = "connected";
        mockLink.remembered = "AA:BB";

        await renderWithProviders(<MachineSection/>);

        expect(screen.getByLabelText(/forget/i)).toBeTruthy();
    });

    it("offers auto-start, off, because committing is what starts a grinder", async () => {
        // The machine goes from committed to grinding with nothing in between
        // and no confirmation of its own, so the default has to be the one
        // where a curious first press does not leave somebody standing over a
        // running burr.
        await renderWithProviders(<MachineSection/>);

        const toggle = screen.getByLabelText(/start brewing automatically/i);
        expect(toggle).toBeTruthy();
        expect(toggle.props.accessibilityState?.checked ?? toggle.props.value).toBe(false);
    });

    it("asks which xBloom you own, because the two grind on different scales", async () => {
        await renderWithProviders(<MachineSection/>);

        expect(screen.getByText("Your xBloom")).toBeTruthy();
        expect(screen.getByText("Studio")).toBeTruthy();
        expect(screen.getByText("Original")).toBeTruthy();
    });

    it("remembers the original xBloom when that is what you picked", async () => {
        await renderWithProviders(<MachineSection/>);

        // The Studio is the default, so this also pins that a fresh install
        // starts somewhere rather than with nothing chosen.
        expect(screen.getByLabelText("Studio").props.accessibilityState?.checked)
            .toBe(true);

        await fireEvent.press(screen.getByLabelText("Original"));

        // The control is driven by the setting, so the value coming back is the
        // evidence it was stored rather than merely pressed.
        await waitFor(() =>
            expect(screen.getByLabelText("Original").props.accessibilityState?.checked)
                .toBe(true));
    });

    it("stops naming the Studio to somebody who said they own the other one", async () => {
        // The connect row sat directly under the question, so an original owner
        // read the app telling them to switch on a machine they had just said
        // they do not have. It is also the one place worth admitting the link
        // has only ever been tried against a Studio.
        await renderWithProviders(<MachineSection/>);
        expect(screen.getByText(/Your xBloom Studio has to be on/)).toBeTruthy();

        await fireEvent.press(screen.getByLabelText("Original"));

        await waitFor(() =>
            expect(screen.getByText(/Only the Studio has been tested/)).toBeTruthy());
        expect(screen.queryByText(/Your xBloom Studio has to be on/)).toBeNull();
    });
});

/**
 * The Android dead end.
 *
 * Refuse the Bluetooth dialog twice on Android and it never appears again, so
 * Connect does nothing at all and the error line is the end of the road. iOS
 * has no such state, which is why the row is driven by the link's own flag
 * rather than by `Platform.OS` here.
 */
describe("a Bluetooth permission only Settings can undo", () => {
    beforeEach(() => {
        mockLink.status = "failed";
        mockLink.remembered = "";
        mockLink.machine = {info: null, askHowItIsDoing: mockAsk};
        mockLink.error = "Bluetooth permission is off for XBRW++. Turn it on in Settings to reach the machine.";
        mockLink.canOpenSettings = true;
        mockLink.openSettings.mockClear();
    });

    it("offers the way out", async () => {
        await renderWithProviders(<MachineSection/>);

        expect(await screen.findByText(/Open app settings/)).toBeTruthy();
    });

    it("opens the system settings when it is taken", async () => {
        await renderWithProviders(<MachineSection/>);

        await fireEvent.press(await screen.findByText(/Open app settings/));

        expect(mockLink.openSettings).toHaveBeenCalled();
    });

    it("says why the permission cannot simply be granted again", async () => {
        await renderWithProviders(<MachineSection/>);

        expect(await screen.findByText(/Bluetooth permission can only be turned back on there/))
            .toBeTruthy();
    });

    it("offers nothing when the refusal can still be asked about again", async () => {
        mockLink.error = "XBRW++ needs permission to use Bluetooth to reach the machine.";
        mockLink.canOpenSettings = false;

        await renderWithProviders(<MachineSection/>);

        await waitFor(() => expect(screen.queryByText(/Open app settings/)).toBeNull());
    });
});

describe("several saved machines", () => {
    const entry = (id: string, label: string, model: "studio" | "original" = "studio") => ({
        id, label, model, modelString: "", advertisedName: "", serial: ""
    });

    beforeEach(() => {
        mockLink.status = "connected";
        mockLink.remembered = "WORK";
        mockLink.machine = {info: null, askHowItIsDoing: mockAsk};
        mockLink.error = null;
        mockLink.canOpenSettings = false;
        mockLink.machines = [entry("HOME", "Home"), entry("WORK", "Work", "original")];
    });

    it("lists them in order, each with its place in the order, and the one in use", async () => {
        await renderWithProviders(<MachineSection/>);

        expect(screen.getByLabelText(/^Home, Studio · Tried 1st · ID HOME$/)).toBeTruthy();
        expect(screen.getByLabelText(/^Work, Original · Tried 2nd · ID WORK · Connected$/)).toBeTruthy();
    });

    it("never says Default, which read as a third word for the machine in use", async () => {
        // The first machine is only first in the connect order. It can be away
        // while the second is the one connected, and "Default · ... ·
        // Connected" on two different rows said two machines were in use.
        await renderWithProviders(<MachineSection/>);

        expect(screen.queryByLabelText(/Default/)).toBeNull();
        expect(screen.queryByLabelText(/Choice \d/)).toBeNull();
    });

    it("marks each machine with its colour", async () => {
        mockLink.machines = [{...entry("HOME", "Home"), colour: 2}, {...entry("WORK", "Work"), colour: 0}];
        await renderWithProviders(<MachineSection/>);

        const dot = (id: string) => StyleSheet.flatten(screen.getByTestId(
            `saved-machine-colour-${id}`, {includeHiddenElements: true}).props.style);
        expect(dot("HOME").backgroundColor).toBe(machineColours[2].ink);
        expect(dot("WORK").backgroundColor).toBe(machineColours[0].ink);
    });

    it("calls the machine this phone uses Selected while it has no link to it", async () => {
        // "In use" read as "another phone is using it", which the app cannot
        // know. Selected is all it does know.
        mockLink.status = "failed";
        await renderWithProviders(<MachineSection/>);

        expect(screen.getByLabelText(/^Work, Original · Tried 2nd · ID WORK · Selected$/)).toBeTruthy();
        expect(screen.queryByText(/In use/)).toBeNull();
    });

    it("does not repeat Connected in a row of its own", async () => {
        // The machine's row already says Connected, and the old row under it
        // did nothing when pressed.
        await renderWithProviders(<MachineSection/>);

        expect(screen.queryByText("The link is held while XBRW++ is open.")).toBeNull();
        expect(screen.queryByText("Connect to my machine")).toBeNull();
    });

    it("moves the model choice into each machine, because one row could only describe one", async () => {
        await renderWithProviders(<MachineSection/>);

        expect(screen.queryByText("Your xBloom")).toBeNull();
    });

    it("moves Forget into each machine's sheet", async () => {
        await renderWithProviders(<MachineSection/>);

        expect(screen.queryByText("Forget this machine")).toBeNull();
    });

    it("opens a machine's sheet from its row", async () => {
        const onOpenMachine = jest.fn();
        await renderWithProviders(<MachineSection onOpenMachine={onOpenMachine}/>);

        await fireEvent.press(screen.getByLabelText(/^Home, /));

        expect(onOpenMachine).toHaveBeenCalledWith("HOME");
    });

    it("offers to add another, through the screen's sheet", async () => {
        const onAddMachine = jest.fn();
        await renderWithProviders(<MachineSection onAddMachine={onAddMachine}/>);

        await fireEvent.press(screen.getByText("Add another machine"));

        expect(onAddMachine).toHaveBeenCalled();
    });

    it("keeps one machine's section as it was, with a row to name it and a way to add a second", async () => {
        mockLink.machines = [entry("WORK", "")];
        await renderWithProviders(<MachineSection/>);

        expect(screen.getByText("Your xBloom")).toBeTruthy();
        expect(screen.getByText("Forget this machine")).toBeTruthy();
        expect(screen.getByText("Add another machine")).toBeTruthy();
        // No order word and no colour: with one machine there is no order and
        // nothing to tell apart.
        expect(screen.getByLabelText(/^xBloom 1, Studio · ID WORK · Connected$/)).toBeTruthy();
        expect(screen.queryByTestId("saved-machine-colour-WORK", {includeHiddenElements: true}))
            .toBeNull();
        // Nor the star's empty column, which left the name indented.
        expect(screen.queryByTestId("saved-machine-star-WORK", {includeHiddenElements: true}))
            .toBeNull();
    });

    it("keeps the star column on every row once there are two, so the names line up", async () => {
        mockLink.machines = [entry("HOME", "Home"), entry("WORK", "Work")];
        await renderWithProviders(<MachineSection/>);
        expect(screen.getByTestId("saved-machine-star-HOME", {includeHiddenElements: true})).toBeTruthy();
        expect(screen.getByTestId("saved-machine-star-WORK", {includeHiddenElements: true})).toBeTruthy();
    });

    it("drops the model choice once the machine's serial has named its model", async () => {
        // The serial set the model on connect, so the choice could only be
        // used to point imports at the wrong grind scale.
        mockLink.machines = [{...entry("WORK", ""), serial: "J15A01D48H051"}];
        await renderWithProviders(<MachineSection/>);

        expect(screen.queryByText("Your xBloom")).toBeNull();
        expect(screen.getByLabelText(/^xBloom 1, Studio · #H051/)).toBeTruthy();
    });

    it("keeps the model choice when the serial names no model", async () => {
        mockLink.machines = [{...entry("WORK", ""), serial: "S1"}];
        await renderWithProviders(<MachineSection/>);

        expect(screen.getByText("Your xBloom")).toBeTruthy();
    });

    it("keeps the model choice until the saved model agrees with the serial", async () => {
        // Corrected on the next connect; until then the choice stays usable.
        mockLink.machines = [{...entry("WORK", "", "original"), serial: "J15A01D48H051"}];
        await renderWithProviders(<MachineSection/>);

        expect(screen.getByText("Your xBloom")).toBeTruthy();
    });

    it("shows the Bluetooth identifier in the machine's details, not the status line", async () => {
        mockLink.machines = [entry("WORK", "")];
        mockLink.machine = {askHowItIsDoing: mockAsk, info: {
            kind: "info", serial: "J15ABC123456", model: "J15",
            firmware: "V12.0D.500", waterEnough: true, waterFeed: "tank",
            grindSize: 62, mode: "PRO"
        }} as never;
        await renderWithProviders(<MachineSection/>);

        expect(screen.getByText("Bluetooth ID")).toBeTruthy();
        expect(screen.getByText("WORK")).toBeTruthy();
    });
});
