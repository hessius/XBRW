import React from "react";
import {fireEvent, screen} from "@testing-library/react-native";

import MachineDetailSheet from "@/components/MachineDetailSheet";
import type {SavedMachine} from "@/library/machine/savedMachines";
import {renderWithProviders} from "@/test-utils/render";

jest.mock("@/components/XbrwToast", () => ({notify: jest.fn()}));

const mockForget = jest.fn(async () => true);
const mockChoose = jest.fn(async () => undefined);
let mockBlocker: string | null = null;
const mockSetColour = jest.fn();

const MACHINES: SavedMachine[] = [
    {id: "HOME", label: "Home", model: "studio", modelString: "", advertisedName: "", serial: "J15A01D48H051"},
    {id: "WORK", label: "Work", model: "original", modelString: "", advertisedName: "", serial: "",
     colour: 2}
];
let mockMachines: SavedMachine[] = MACHINES;

jest.mock("@/hooks/useMachine", () => ({
    __esModule: true,
    useMachine: () => ({
        remembered: "HOME",
        status: "connected",
        changeBlocker: mockBlocker,
        choose: mockChoose,
        forgetMachine: mockForget
    })
}));

jest.mock("@/hooks/useSavedMachines", () => ({
    __esModule: true,
    useSavedMachines: () => ({
        machines: mockMachines,
        activeId: "HOME",
        rename: jest.fn(),
        setModel: jest.fn(),
        setColour: mockSetColour,
        makeDefault: jest.fn(),
        move: jest.fn()
    })
}));

beforeEach(() => {
    mockForget.mockClear();
    mockChoose.mockClear();
    mockBlocker = null;
    mockSetColour.mockClear();
    mockMachines = MACHINES;
});

describe("a saved machine's sheet", () => {
    it("asks the screen to confirm, and forgets nothing itself", async () => {
        // It used to forget on the tap. The screen's ForgetMachineSheet asks.
        const onForget = jest.fn();
        const onClose = jest.fn();
        await renderWithProviders(
            <MachineDetailSheet machineId="HOME" onClose={onClose} onForget={onForget}/>
        );

        await fireEvent.press(screen.getByText("Forget this machine"));

        expect(onForget).toHaveBeenCalledWith("HOME");
        expect(onClose).toHaveBeenCalled();
        expect(mockForget).not.toHaveBeenCalled();
    });

    it("will not forget the machine while a brew owns the link, and says why", async () => {
        mockBlocker = "A brew is running. Stop it or let it finish before changing machines.";
        const onForget = jest.fn();
        await renderWithProviders(
            <MachineDetailSheet machineId="HOME" onClose={jest.fn()} onForget={onForget}/>
        );

        await fireEvent.press(screen.getByText("Forget this machine"));

        expect(onForget).not.toHaveBeenCalled();
        expect(mockForget).not.toHaveBeenCalled();
        expect(screen.getAllByText(/A brew is running/).length).toBeGreaterThan(0);
    });

    it("shows the serial, so a machine can be checked against the one in front of you", async () => {
        await renderWithProviders(<MachineDetailSheet machineId="HOME" onClose={jest.fn()}/>);

        expect(screen.getByTestId("machine-detail-id").props.children).toMatch(/J15A01D48H051/);
    });

    it("says it is the selected machine, not that it is in use", async () => {
        await renderWithProviders(<MachineDetailSheet machineId="HOME" onClose={jest.fn()}/>);

        expect(screen.getByText("Selected and connected.")).toBeTruthy();
    });

    it("names the model its serial gave it instead of offering a choice", async () => {
        await renderWithProviders(<MachineDetailSheet machineId="HOME" onClose={jest.fn()}/>);

        expect(screen.getByTestId("machine-detail-model").props.children).toMatch(/^Studio, read from its serial/);
        expect(screen.queryByLabelText("Model")).toBeNull();
    });

    it("offers the choice for a machine whose serial is not known yet", async () => {
        await renderWithProviders(<MachineDetailSheet machineId="WORK" onClose={jest.fn()}/>);

        expect(screen.getByLabelText("Model")).toBeTruthy();
        expect(screen.queryByTestId("machine-detail-model")).toBeNull();
    });
});

describe("a machine's colour", () => {
    it("offers the four colours beside the name, with this machine's chosen", async () => {
        await renderWithProviders(<MachineDetailSheet machineId="WORK" onClose={jest.fn()}/>);

        expect(screen.getByLabelText("Colour")).toBeTruthy();
        for (const name of ["Green", "Blue", "Violet", "Cyan"]) {
            expect(screen.getByLabelText(name)).toBeTruthy();
        }
        expect(screen.getByLabelText("Violet").props.accessibilityState)
            .toEqual(expect.objectContaining({selected: true}));
        expect(screen.getByLabelText("Green").props.accessibilityState)
            .toEqual(expect.objectContaining({selected: false}));
    });

    it("treats a machine saved before colours as green, the colour it has always drawn in", async () => {
        await renderWithProviders(<MachineDetailSheet machineId="HOME" onClose={jest.fn()}/>);

        expect(screen.getByLabelText("Green").props.accessibilityState)
            .toEqual(expect.objectContaining({selected: true}));
    });

    it("saves the colour picked", async () => {
        await renderWithProviders(<MachineDetailSheet machineId="WORK" onClose={jest.fn()}/>);

        await fireEvent.press(screen.getByLabelText("Cyan"));

        expect(mockSetColour).toHaveBeenCalledWith("WORK", 3);
    });

    it("offers no colour with one machine, which stays the green it has always been", async () => {
        mockMachines = [MACHINES[0]];
        await renderWithProviders(<MachineDetailSheet machineId="HOME" onClose={jest.fn()}/>);

        expect(screen.queryByLabelText("Colour")).toBeNull();
        expect(screen.queryByLabelText("Green")).toBeNull();
    });

    it("says where a machine sits in the order without calling it a default", async () => {
        await renderWithProviders(<MachineDetailSheet machineId="WORK" onClose={jest.fn()}/>);

        expect(screen.getByText("Tried after 1 other.")).toBeTruthy();
        expect(screen.queryByText(/default/i)).toBeNull();
    });
});
