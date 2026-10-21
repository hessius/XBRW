import React from "react";
import {fireEvent, screen, waitFor} from "@testing-library/react-native";

import ForgetMachineSheet from "@/components/ForgetMachineSheet";
import type {SavedMachine} from "@/library/machine/savedMachines";
import {renderWithProviders} from "@/test-utils/render";

jest.mock("@/components/XbrwToast", () => ({notify: jest.fn()}));

const mockForget = jest.fn(async (_id: string) => true);
const mockMachines: SavedMachine[] = [
    {id: "HOME", label: "Home", model: "studio", modelString: "", advertisedName: "", serial: ""},
    {id: "WORK", label: "Work", model: "studio", modelString: "", advertisedName: "", serial: ""}
];

jest.mock("@/hooks/useMachine", () => ({
    __esModule: true,
    useMachine: () => ({machines: mockMachines, forgetMachine: mockForget})
}));

beforeEach(() => {
    mockForget.mockReset();
    mockForget.mockResolvedValue(true);
});

describe("asking before a machine is forgotten", () => {
    it("names the machine and says how to get it back", async () => {
        await renderWithProviders(<ForgetMachineSheet machineId="HOME" onClose={jest.fn()}/>);

        expect(screen.getByText("Forget Home?")).toBeTruthy();
        expect(screen.getByText(
            "It comes off your list. To use it again, switch it on nearby and add it again."
        )).toBeTruthy();
        expect(mockForget).not.toHaveBeenCalled();
    });

    it("closes on Keep it with the machine still saved", async () => {
        const onClose = jest.fn();
        await renderWithProviders(<ForgetMachineSheet machineId="HOME" onClose={onClose}/>);

        await fireEvent.press(screen.getByRole("button", {name: "Keep Home"}));

        expect(onClose).toHaveBeenCalled();
        expect(mockForget).not.toHaveBeenCalled();
    });

    it("forgets the machine on Forget, then closes", async () => {
        const onClose = jest.fn();
        await renderWithProviders(<ForgetMachineSheet machineId="WORK" onClose={onClose}/>);

        await fireEvent.press(screen.getByRole("button", {name: "Forget Work"}));

        expect(mockForget).toHaveBeenCalledWith("WORK");
        await waitFor(() => expect(onClose).toHaveBeenCalled());
    });

    it("stays up when the forget is refused, as it is mid-brew", async () => {
        // `forgetMachine` refuses while a brew holds the link and says why in
        // a toast. A brew can start while this sheet is open, so the guard is
        // the hook's, not only the row's.
        mockForget.mockResolvedValue(false);
        const onClose = jest.fn();
        await renderWithProviders(<ForgetMachineSheet machineId="HOME" onClose={onClose}/>);

        await fireEvent.press(screen.getByRole("button", {name: "Forget Home"}));

        await waitFor(() => expect(mockForget).toHaveBeenCalledWith("HOME"));
        expect(onClose).not.toHaveBeenCalled();
    });
});
