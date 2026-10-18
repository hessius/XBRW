import React from "react";
import {StyleSheet} from "react-native";
import {fireEvent, screen, waitFor, within} from "@testing-library/react-native";

import MachineSection from "@/components/MachineSection";
import {machineColours} from "@/constants/colors";
import {renderWithProviders} from "@/test-utils/render";
import {palette} from "@/constants/colors";
import {notify} from "@/components/XbrwToast";
import {SlotOperationError} from "@/library/machine/errors";
import type {SavedMachine} from "@/library/machine/savedMachines";

jest.mock("@/components/XbrwToast", () => ({notify: jest.fn()}));

// Jest forbids a `jest.mock` factory from closing over a variable unless its
// name is `mock`-prefixed, so the plan's `push`/`link` are named `mockPush` and
// `mockLink` here. The router's own method key stays `push` — the component
// calls `router.push`.
const mockPush = jest.fn();
jest.mock("expo-router", () => ({router: {push: (...args: unknown[]) => mockPush(...args)}}));

const mockAsk = jest.fn().mockResolvedValue(true);
const mockLink: {
    machine: {info: null | object; askHowItIsDoing: jest.Mock; modelNumber: string};
    status: import("@/hooks/useMachine").LinkStatus;
    error: string | null;
    remembered: string;
    connect: jest.Mock;
    forget: jest.Mock;
    forgetMachine: jest.Mock;
    choose: jest.Mock;
    changeBlocker: string | null;
    canOpenSettings: boolean;
    openSettings: jest.Mock;
    machines: SavedMachine[];
} = {
    machine: {info: null, askHowItIsDoing: mockAsk, modelNumber: ""},
    status: "disconnected",
    error: null,
    remembered: "",
    connect: jest.fn(),
    forget: jest.fn(),
    forgetMachine: jest.fn(async () => true),
    choose: jest.fn(async () => undefined),
    changeBlocker: null,
    canOpenSettings: false,
    openSettings: jest.fn(),
    machines: []
};

jest.mock("@/hooks/useMachine", () => ({
    __esModule: true,
    default: () => mockLink,
    useMachine: () => mockLink
}));

// Each card's model row writes through the saved list, which reaches for the
// shared store (SQLite) on an edit. Observed rather than run.
const mockSetModel = jest.fn();
jest.mock("@/hooks/useSavedMachines", () => ({
    __esModule: true,
    useSavedMachines: () => ({setModel: mockSetModel})
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

const entry = (id: string, label: string, model: "studio" | "original" = "studio",
               serial = ""): SavedMachine => ({
    id, label, model, modelString: "", advertisedName: "", serial
});

const INFO = {
    kind: "info", serial: "J15ABC123456", model: "J15",
    firmware: "V12.0D.500", waterEnough: true, waterFeed: "tank",
    grindSize: 62, mode: "PRO"
};

/**
 * Open a machine's card from its header, if it is not open already.
 *
 * The machine in use starts open, so pressing its header blindly would close it.
 */
async function openCard(name: RegExp): Promise<void> {
    const header = screen.getByRole("button", {name});
    if (header.props.accessibilityState?.expanded !== true) await fireEvent.press(header);
}

/** Open a machine's card and then its Details fold. */
async function openDetails(name: RegExp, id: string): Promise<void> {
    await openCard(name);
    await fireEvent.press(card(id).getByRole("button", {name: /^Details/}));
}

/** Queries scoped to one machine's card, now that the machine in use starts open. */
function card(id: string) {
    return within(screen.getByTestId(`saved-machine-${id}-card`));
}

function resetLink(): void {
    mockPush.mockClear();
    mockAsk.mockClear();
    mockSetModel.mockClear();
    mockLink.status = "disconnected";
    mockLink.remembered = "";
    mockLink.machine = {info: null, askHowItIsDoing: mockAsk, modelNumber: ""};
    mockLink.error = null;
    mockLink.canOpenSettings = false;
    mockLink.openSettings.mockClear();
    mockLink.forgetMachine.mockClear();
    mockLink.choose.mockClear();
    mockLink.changeBlocker = null;
    mockLink.machines = [];
}

describe("the machine section", () => {
    beforeEach(resetLink);

    it("asks the machine how it is doing when the settings screen opens", async () => {
        // Otherwise the water level on show is whatever it was at connect. Fill
        // the tank and Settings still says Low until the app is relaunched.
        mockLink.status = "connected";
        mockLink.remembered = "AA:BB";
        mockLink.machines = [entry("AA:BB", "")];
        await renderWithProviders(<MachineSection/>);
        expect(mockAsk).toHaveBeenCalled();
    });

    it("does not ask a machine it has no link to", async () => {
        // Asking would mean writing to a transport that is not there.
        await renderWithProviders(<MachineSection/>);
        expect(mockAsk).not.toHaveBeenCalled();
    });

    it("surfaces a slot-lock refresh refusal instead of silently hiding it in Settings", async () => {
        mockLink.status = "connected";
        const message = "Finish the incomplete Easy Mode write before using the machine.";
        mockAsk.mockRejectedValueOnce(new SlotOperationError(message));
        await renderWithProviders(<MachineSection/>);
        await waitFor(() => expect(notify).toHaveBeenCalledWith({tone: "error", message}));
        expect(mockAsk).toHaveBeenCalledTimes(1);
    });

    it("is there before a machine has ever been paired", async () => {
        // Otherwise nothing in the app tells a new owner that pairing exists:
        // BREW only appears once a machine is remembered.
        await renderWithProviders(<MachineSection/>);
        expect(screen.getByText("MACHINES")).toBeTruthy();
        expect(await screen.findByText(/no machine paired/i)).toBeTruthy();
        expect(screen.getByLabelText(/^Connect to my machine/)).toBeTruthy();
    });

    it("says whether a machine is paired at all, not only whether it is connected", async () => {
        // "Not connected" was true of both a phone that has never seen a
        // machine and one that has paired with a machine and lost it, and the
        // difference decides everything: whether the app connects at launch,
        // and whether it pays for a scan.
        await renderWithProviders(<MachineSection/>);
        expect(await screen.findByText(/no machine paired/i)).toBeTruthy();

        mockLink.status = "idle";
        mockLink.remembered = "AA:BB1122";
        mockLink.machines = [entry("AA:BB1122", "")];
        await renderWithProviders(<MachineSection/>);
        await openCard(/^xBloom 1, /);
        expect(await screen.findByText("Not connected")).toBeTruthy();
    });

    it("says not connected before an attempt, and every reason a failed one could have after", async () => {
        // "Not connected" = no attempt made. After a failed attempt the radio
        // cannot say why: a machine another phone is connected to stops
        // answering exactly like one that is off. "Not in range" claimed one
        // reason, and was wrong with the machine on the bench beside a phone
        // that had it. The Bluetooth identifier is in Details, not here.
        mockLink.remembered = "MY:MACHINE";
        mockLink.machines = [entry("MY:MACHINE", "Home")];
        const notFound = "Not found. It may be off, out of range or connected to another phone.";

        mockLink.status = "idle";
        await renderWithProviders(<MachineSection/>);
        await openCard(/^Home, /);
        expect(await screen.findByText("Not connected")).toBeTruthy();

        mockLink.status = "disconnected";
        await renderWithProviders(<MachineSection/>);
        await openCard(/^Home, /);
        expect(await screen.findByText(notFound)).toBeTruthy();

        mockLink.status = "failed";
        await renderWithProviders(<MachineSection/>);
        await openCard(/^Home, /);
        expect(await screen.findByText(notFound)).toBeTruthy();
        expect(screen.queryByText(/MY:MACHINE/)).toBeNull();
        expect(screen.queryByText(/Not in range/)).toBeNull();
        // And how to get the machine back from the other phone.
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

    it("asks which xBloom you own before one is paired, because the two grind on different scales", async () => {
        await renderWithProviders(<MachineSection/>);

        expect(screen.getByText("Your xBloom")).toBeTruthy();
        expect(screen.getByText("Studio")).toBeTruthy();
        expect(screen.getByText("Original")).toBeTruthy();
        const stacked = within(screen.getByTestId("settings-choice-stacked"));
        expect(stacked.getByText(
            "Choose your model for matching imports. Grind scales differ. Saved recipes stay unchanged."
        )).toBeTruthy();
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

    it("leaves the brewing preferences to the Brewing section", async () => {
        mockLink.machines = [entry("AA:BB", "")];
        mockLink.remembered = "AA:BB";
        await renderWithProviders(<MachineSection/>);
        await openDetails(/^xBloom 1, /, "AA:BB");

        for (const label of ["Start brewing automatically", "Animate the brew chart",
                             "Ask how a brew was", "Brew detail storage"]) {
            expect(screen.queryByText(label, {includeHiddenElements: true})).toBeNull();
        }
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
        resetLink();
        mockLink.status = "failed";
        mockLink.error = "Bluetooth permission is off for XBRW++. Turn it on in Settings to reach the machine.";
        mockLink.canOpenSettings = true;
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

    it("offers it inside the card of the machine in use too", async () => {
        mockLink.remembered = "AA:BB";
        mockLink.machines = [entry("AA:BB", "Home")];
        await renderWithProviders(<MachineSection/>);
        await openCard(/^Home, /);

        await fireEvent.press(await screen.findByText(/Open app settings/));

        expect(mockLink.openSettings).toHaveBeenCalled();
    });

    it("offers nothing when the refusal can still be asked about again", async () => {
        mockLink.error = "XBRW++ needs permission to use Bluetooth to reach the machine.";
        mockLink.canOpenSettings = false;

        await renderWithProviders(<MachineSection/>);

        await waitFor(() => expect(screen.queryByText(/Open app settings/)).toBeNull());
    });
});

describe("one card per saved machine", () => {
    beforeEach(() => {
        resetLink();
        mockLink.status = "connected";
        mockLink.remembered = "WORK";
        mockLink.machines = [entry("HOME", "Home", "studio", "J15A01D48H051"), entry("WORK", "Work", "original")];
    });

    it("lists them in order, each with its place in the order, and the one in use", async () => {
        await renderWithProviders(<MachineSection/>);

        expect(screen.getByRole("button", {name: /^Home, Studio · Tried 1st · #H051$/})).toBeTruthy();
        expect(screen.getByRole("button", {name: /^Work, Original · Tried 2nd · ID WORK · Connected$/}))
            .toBeTruthy();
    });

    it("never says Default, which read as a third word for the machine in use", async () => {
        // The first machine is only first in the connect order. It can be away
        // while the second is the one connected, and "Default · ... ·
        // Connected" on two different cards said two machines were in use.
        await renderWithProviders(<MachineSection/>);

        expect(screen.queryByRole("button", {name: /Default/})).toBeNull();
        expect(screen.queryByRole("button", {name: /Choice \d/})).toBeNull();
    });

    it("marks each machine's card with its colour, beside the name", async () => {
        mockLink.machines = [{...mockLink.machines[0], colour: 2}, {...mockLink.machines[1], colour: 0}];
        await renderWithProviders(<MachineSection/>);

        const dot = (id: string) => StyleSheet.flatten(screen.getByTestId(
            `saved-machine-${id}-colour`, {includeHiddenElements: true}).props.style);
        expect(dot("HOME").backgroundColor).toBe(machineColours[2].ink);
        expect(dot("WORK").backgroundColor).toBe(machineColours[0].ink);
    });

    it("keeps every card closed until it is tapped, and says so to a screen reader", async () => {
        await renderWithProviders(<MachineSection/>);
        const home = screen.getByRole("button", {name: /^Home, /});

        expect(home.props.accessibilityState).toEqual(expect.objectContaining({expanded: false}));
        // Folded away is hidden from a screen reader, not only from sight.
        expect(card("HOME").queryByText("Forget this machine")).toBeNull();
        expect(card("HOME").queryByText("Use this machine now")).toBeNull();

        await fireEvent.press(home);

        expect(screen.getByRole("button", {name: /^Home, /}).props.accessibilityState)
            .toEqual(expect.objectContaining({expanded: true}));
        expect(card("HOME").getByText("Use this machine now")).toBeTruthy();
        expect(card("HOME").getByText("Forget this machine")).toBeTruthy();
        // Opening one card leaves the other as it was: Work, in use, open.
        expect(screen.getByRole("button", {name: /^Work, /}).props.accessibilityState)
            .toEqual(expect.objectContaining({expanded: true}));
    });

    it("closes a card again from its header", async () => {
        await renderWithProviders(<MachineSection/>);
        await fireEvent.press(screen.getByRole("button", {name: /^Home, /}));
        await fireEvent.press(screen.getByRole("button", {name: /^Home, /}));

        expect(screen.queryByText("Use this machine now")).toBeNull();
    });

    it("starts the machine in use open and the others closed", async () => {
        await renderWithProviders(<MachineSection/>);

        expect(screen.getByRole("button", {name: /^Work, /}).props.accessibilityState)
            .toEqual(expect.objectContaining({expanded: true}));
        expect(screen.getByRole("button", {name: /^Home, /}).props.accessibilityState)
            .toEqual(expect.objectContaining({expanded: false}));
        // The machine in use's own rows are there without a tap.
        expect(card("WORK").getByRole("button", {name: /^Name, colour and order, /})).toBeTruthy();
        expect(screen.queryByText("Use this machine now")).toBeNull();
    });

    it("does not repeat Connected in a row of its own", async () => {
        // The header already says Connected in green, and the row under it
        // did nothing when pressed.
        await renderWithProviders(<MachineSection/>);

        expect(screen.queryByText("The link is held while XBRW++ is open.")).toBeNull();
        expect(screen.queryByText("Connect to my machine")).toBeNull();
    });

    it("calls the machine this phone uses Selected while it has no link to it", async () => {
        // "In use" read as "another phone is using it", which the app cannot
        // know. Selected is all it does know.
        mockLink.status = "failed";
        await renderWithProviders(<MachineSection/>);

        expect(screen.getByRole("button", {name: /^Work, Original · Tried 2nd · ID WORK · Selected$/}))
            .toBeTruthy();
        expect(screen.queryByText(/In use/)).toBeNull();
    });

    it("drops the model choice from a card whose serial named the model", async () => {
        // Home's serial is a Studio's and Home is saved as a Studio: the
        // choice could only point imports at the wrong grind scale.
        await renderWithProviders(<MachineSection/>);
        await openCard(/^Home, /);

        expect(card("HOME").queryByText("Model")).toBeNull();
        expect(card("WORK").getByText("Model")).toBeTruthy();
    });

    it("shows the machine in use's error and the way out without a tap", async () => {
        mockLink.status = "failed";
        mockLink.error = "Bluetooth permission is off for XBRW++. Turn it on in Settings to reach the machine.";
        mockLink.canOpenSettings = true;
        await renderWithProviders(<MachineSection/>);

        expect(screen.getByText(/Bluetooth permission is off/)).toBeTruthy();
        expect(screen.getByText("Open app settings")).toBeTruthy();
        expect(screen.getByLabelText(/^Connect to my machine/)).toBeTruthy();
    });

    it("turns the summary red while the machine in use has an error", async () => {
        mockLink.status = "failed";
        mockLink.error = "The machine did not answer.";
        await renderWithProviders(<MachineSection/>);

        expect(screen.getByTestId("saved-machine-WORK-summary")).toHaveStyle({color: palette.danger});
        expect(screen.getByTestId("saved-machine-HOME-summary")).toHaveStyle({color: palette.dim});
    });

    it("turns the summary green while the machine in use is connected", async () => {
        await renderWithProviders(<MachineSection/>);

        expect(screen.getByTestId("saved-machine-WORK-summary")).toHaveStyle({color: palette.success});
    });

    it("drops the one-line model question for a model row in each card", async () => {
        await renderWithProviders(<MachineSection/>);

        expect(screen.queryByText("Your xBloom", {includeHiddenElements: true})).toBeNull();

        await openCard(/^Work, /);
        await fireEvent.press(screen.getByLabelText("Studio"));

        expect(mockSetModel).toHaveBeenCalledWith("WORK", "studio");
    });

    it("switches to a machine that is not in use, from its card", async () => {
        await renderWithProviders(<MachineSection/>);
        await openCard(/^Home, /);

        await fireEvent.press(screen.getByText("Use this machine now"));

        expect(mockLink.choose).toHaveBeenCalledWith("HOME");
    });

    it("will not switch machines while a brew owns the link, and says why", async () => {
        mockLink.changeBlocker = "A brew is running. Stop it or let it finish before changing machines.";
        await renderWithProviders(<MachineSection/>);
        await openCard(/^Home, /);

        await fireEvent.press(screen.getByText("Use this machine now"));

        expect(mockLink.choose).not.toHaveBeenCalled();
    });

    it("forgets the machine from its card", async () => {
        await renderWithProviders(<MachineSection/>);
        await openCard(/^Home, /);

        await fireEvent.press(card("HOME").getByText("Forget this machine"));

        expect(mockLink.forgetMachine).toHaveBeenCalledWith("HOME");
    });

    it("will not forget a machine while a brew owns the link, and says why", async () => {
        mockLink.changeBlocker = "A brew is running. Stop it or let it finish before changing machines.";
        await renderWithProviders(<MachineSection/>);
        await openCard(/^Work, /);

        await fireEvent.press(screen.getByText("Forget this machine"));

        expect(mockLink.forgetMachine).not.toHaveBeenCalled();
        expect(screen.getAllByText(/A brew is running/).length).toBeGreaterThan(0);
    });

    it("opens a machine's sheet for its name and order", async () => {
        const onOpenMachine = jest.fn();
        await renderWithProviders(<MachineSection onOpenMachine={onOpenMachine}/>);
        await openCard(/^Home, /);

        await fireEvent.press(card("HOME").getByRole("button", {name: /^Name, colour and order/}));

        expect(onOpenMachine).toHaveBeenCalledWith("HOME");
    });

    it("offers to add another directly under the cards", async () => {
        const onAddMachine = jest.fn();
        await renderWithProviders(<MachineSection onAddMachine={onAddMachine}/>);

        await fireEvent.press(screen.getByText("Add another machine"));

        expect(onAddMachine).toHaveBeenCalled();
    });

    it("folds the machine's readings away inside its card", async () => {
        mockLink.machine = {askHowItIsDoing: mockAsk, modelNumber: "", info: INFO};
        await renderWithProviders(<MachineSection/>);
        await openCard(/^Work, /);

        // Open card, closed details: the readings are still out of the way.
        expect(screen.queryByText("V12.0D.500")).toBeNull();
        const toggle = card("WORK").getByRole("button", {name: /^Details/});
        expect(toggle.props.accessibilityState).toEqual(expect.objectContaining({expanded: false}));

        await fireEvent.press(toggle);

        expect(card("WORK").getByRole("button", {name: /^Details/}).props.accessibilityState)
            .toEqual(expect.objectContaining({expanded: true}));
        expect(screen.getByText("J15ABC123456")).toBeTruthy();
        expect(screen.getByText("V12.0D.500")).toBeTruthy();
    });

    it("reads a machine that is not in use from what was saved about it", async () => {
        mockLink.machine = {askHowItIsDoing: mockAsk, modelNumber: "", info: INFO};
        await renderWithProviders(<MachineSection/>);
        await openDetails(/^Home, /, "HOME");

        // Home's own serial, not the connected Work's readings.
        expect(screen.getByText("J15A01D48H051")).toBeTruthy();
        expect(screen.queryByText("V12.0D.500")).toBeNull();
        expect(screen.getByText(/show here while this machine is connected/)).toBeTruthy();
    });
});

describe("a single saved machine", () => {
    const INFO_ON = {askHowItIsDoing: mockAsk, modelNumber: "", info: INFO};

    beforeEach(() => {
        resetLink();
        mockLink.status = "connected";
        mockLink.remembered = "AA:BB";
        mockLink.machines = [entry("AA:BB", "")];
    });

    it("gets a clean card of its own, with a way to add a second", async () => {
        await renderWithProviders(<MachineSection/>);

        // No order word, no star and no colour: with one machine there is no
        // order and nothing to tell apart.
        expect(screen.getByRole("button", {name: /^xBloom 1, Studio · ID AABB · Connected$/}))
            .toBeTruthy();
        expect(screen.queryByTestId("saved-machine-AA:BB-colour", {includeHiddenElements: true}))
            .toBeNull();
        expect(screen.getByText("Add another machine")).toBeTruthy();
        expect(screen.queryByText("Your xBloom", {includeHiddenElements: true})).toBeNull();

        await openCard(/^xBloom 1, /);

        expect(screen.getByRole("button", {name: /^Name, Give it a name/})).toBeTruthy();
        expect(screen.getByText("XBRW++ will scan again next time.")).toBeTruthy();
    });

    it("shows what the machine says about itself once connected", async () => {
        mockLink.machine = INFO_ON;
        await renderWithProviders(<MachineSection/>);
        await openDetails(/^xBloom 1, /, "AA:BB");

        expect(screen.getByText("J15ABC123456")).toBeTruthy();
        expect(screen.getByText("V12.0D.500")).toBeTruthy();
        // The Bluetooth identifier, moved here from the status line.
        expect(screen.getByText("Bluetooth ID")).toBeTruthy();
        expect(screen.getByText("AA:BB")).toBeTruthy();
    });

    it("names the model the info blob reports", async () => {
        mockLink.machine = INFO_ON;
        await renderWithProviders(<MachineSection/>);
        await openDetails(/^xBloom 1, /, "AA:BB");

        expect(within(screen.getByTestId("machine-card-details")).getByText("Model")).toBeTruthy();
        expect(screen.getByText("J15")).toBeTruthy();
    });

    it("falls back to the Device Information model when the blob's model is blank", async () => {
        // A Studio on V12.0D.500 fills the blob's model bytes with 0xFF, which
        // parses as "". The row used to render with nothing beside it.
        mockLink.machine = {askHowItIsDoing: mockAsk, modelNumber: "XB-2",
            info: {...INFO, serial: "J15A01D48H051", model: ""}};
        await renderWithProviders(<MachineSection/>);
        await openDetails(/^xBloom 1, /, "AA:BB");

        expect(within(screen.getByTestId("machine-card-details")).getByText("Model")).toBeTruthy();
        expect(screen.getByText("XB-2")).toBeTruthy();
    });

    it("leaves the model row out when nothing reported a model", async () => {
        mockLink.machine = {askHowItIsDoing: mockAsk, modelNumber: "",
            info: {...INFO, serial: "J15A01D48H051", model: ""}};
        await renderWithProviders(<MachineSection/>);
        await openDetails(/^xBloom 1, /, "AA:BB");

        expect(screen.getByText("J15A01D48H051")).toBeTruthy();
        expect(within(screen.getByTestId("machine-card-details")).queryByText("Model")).toBeNull();
    });

    it("shows a tap-fed machine as plumbed rather than low on water", async () => {
        mockLink.machine = {askHowItIsDoing: mockAsk, modelNumber: "", info: {...INFO, waterEnough: false, waterFeed: "tap"}};
        await renderWithProviders(<MachineSection/>);
        await openDetails(/^xBloom 1, /, "AA:BB");

        expect(screen.getByText("Plumbed")).toBeTruthy();
        expect(screen.queryByText("Low")).toBeNull();
    });

    it("opens the console after seven taps on the firmware, and not before", async () => {
        mockLink.machine = INFO_ON;
        await renderWithProviders(<MachineSection/>);
        await openDetails(/^xBloom 1, /, "AA:BB");
        const firmware = screen.getByLabelText(/^Firmware/);

        for (let i = 0; i < 6; i++) await fireEvent.press(firmware);
        expect(mockPush).not.toHaveBeenCalled();

        await fireEvent.press(firmware);
        expect(mockPush).toHaveBeenCalledWith("/machine");
    });

    it("offers to forget the machine it remembers", async () => {
        await renderWithProviders(<MachineSection/>);
        await openCard(/^xBloom 1, /);

        await fireEvent.press(screen.getByText("Forget this machine"));

        expect(mockLink.forgetMachine).toHaveBeenCalledWith("AA:BB");
    });

    it("connects from its card when the link is down", async () => {
        mockLink.status = "idle";
        mockLink.connect.mockResolvedValue(undefined);
        await renderWithProviders(<MachineSection/>);
        await openCard(/^xBloom 1, /);

        await fireEvent.press(screen.getByLabelText(/^Connect to my machine, Your xBloom Studio/));

        expect(mockLink.connect).toHaveBeenCalled();
    });
});
