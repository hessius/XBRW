import React from "react";
import {fireEvent, screen} from "@testing-library/react-native";

import MachineAddSheet from "@/components/MachineAddSheet";
import type {MachineAdder} from "@/hooks/useMachineAdder";
import {renderWithProviders} from "@/test-utils/render";

function adder(over: Partial<MachineAdder> = {}): MachineAdder {
    return {
        open: true, start: jest.fn(), close: jest.fn(), looking: false,
        found: [], adding: null, error: null, pick: jest.fn(),
        ...over
    };
}

describe("adding a machine", () => {
    it("lists every unsaved machine with a tag, and marks the loudest as a hint", async () => {
        await renderWithProviders(<MachineAddSheet adder={adder({found: [
            {id: "AA:BB:CC:DD:00:11", name: "XBLOOM", rssi: -40},
            {id: "AA:BB:CC:DD:00:22", name: "XBLOOM", rssi: -80}
        ]})}/>);

        expect(screen.getByLabelText("XBLOOM, ID 0011, probably the nearest")).toBeTruthy();
        expect(screen.getByLabelText("XBLOOM, ID 0022")).toBeTruthy();
    });

    it("adds only the one the user taps, never the first one heard by itself", async () => {
        const pick = jest.fn();
        await renderWithProviders(<MachineAddSheet adder={adder({pick, found: [
            {id: "one", name: "XBLOOM"}, {id: "two", name: "XBLOOM"}
        ]})}/>);

        expect(pick).not.toHaveBeenCalled();
        await fireEvent.press(screen.getByTestId("machine-add-two"));
        expect(pick).toHaveBeenCalledWith("two");
    });

    it("says plainly when there is nothing new to add, and offers to scan again", async () => {
        const start = jest.fn();
        await renderWithProviders(<MachineAddSheet adder={adder({start})}/>);

        expect(screen.getByTestId("machine-add-note").props.children).toMatch(/No new xBloom found/);
        await fireEvent.press(screen.getByTestId("machine-add-rescan"));
        expect(start).toHaveBeenCalled();
    });

    it("locks the list while one is connecting", async () => {
        const pick = jest.fn();
        await renderWithProviders(<MachineAddSheet adder={adder({pick, adding: "one", found: [
            {id: "one", name: "XBLOOM"}, {id: "two", name: "XBLOOM"}
        ]})}/>);

        await fireEvent.press(screen.getByTestId("machine-add-two"));
        expect(pick).not.toHaveBeenCalled();
        expect(screen.getByText("CONNECTING…")).toBeTruthy();
    });
});
