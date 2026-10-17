import React from "react";
import {fireEvent, screen} from "@testing-library/react-native";

import MachineDetailSheet from "@/components/MachineDetailSheet";
import type {SavedMachine} from "@/library/machine/savedMachines";
import {renderWithProviders} from "@/test-utils/render";

jest.mock("@/components/XbrwToast", () => ({notify: jest.fn()}));

const mockForget = jest.fn(async () => true);
const mockChoose = jest.fn(async () => undefined);
let mockBlocker: string | null = null;

const MACHINES: SavedMachine[] = [
    {id: "HOME", label: "Home", model: "studio", modelString: "", advertisedName: "", serial: "J15A01D48H051"},
    {id: "WORK", label: "Work", model: "original", modelString: "", advertisedName: "", serial: ""}
];

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
        machines: MACHINES,
        activeId: "HOME",
        rename: jest.fn(),
        setModel: jest.fn(),
        makeDefault: jest.fn(),
        move: jest.fn()
    })
}));

beforeEach(() => {
    mockForget.mockClear();
    mockChoose.mockClear();
    mockBlocker = null;
});

describe("a saved machine's sheet", () => {
    it("forgets the machine when asked", async () => {
        await renderWithProviders(<MachineDetailSheet machineId="HOME" onClose={jest.fn()}/>);

        await fireEvent.press(screen.getByText("Forget this machine"));

        expect(mockForget).toHaveBeenCalledWith("HOME");
    });

    it("will not forget the machine while a brew owns the link, and says why", async () => {
        mockBlocker = "A brew is running. Stop it or let it finish before changing machines.";
        await renderWithProviders(<MachineDetailSheet machineId="HOME" onClose={jest.fn()}/>);

        await fireEvent.press(screen.getByText("Forget this machine"));

        expect(mockForget).not.toHaveBeenCalled();
        expect(screen.getAllByText(/A brew is running/).length).toBeGreaterThan(0);
    });

    it("shows the serial, so a machine can be checked against the one in front of you", async () => {
        await renderWithProviders(<MachineDetailSheet machineId="HOME" onClose={jest.fn()}/>);

        expect(screen.getByTestId("machine-detail-id").props.children).toMatch(/J15A01D48H051/);
    });
});
