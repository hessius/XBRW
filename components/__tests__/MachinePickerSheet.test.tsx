import React from "react";
import {StyleSheet} from "react-native";
import {fireEvent, screen} from "@testing-library/react-native";

import MachineChip from "@/components/MachineChip";
import MachinePickerSheet from "@/components/MachinePickerSheet";
import {machineColours, resolveAppearance} from "@/constants/colors";
import {AppearanceScope} from "@/hooks/useAppearance";
import {THEME_IDS} from "@/library/appearance";
import type {SavedMachine} from "@/library/machine/savedMachines";
import {renderWithProviders} from "@/test-utils/render";

function entry(id: string, overrides: Partial<SavedMachine> = {}): SavedMachine {
    return {
        id, label: id.toUpperCase(), model: "studio", modelString: "", advertisedName: "", serial: "",
        ...overrides
    };
}

/** Five saved machines, the default (`bar-1`) first. */
const CAFE = [
    entry("bar-1"), entry("bar-2", {model: "original", serial: "J15A01D48H051"}),
    entry("window"), entry("back"), entry("spare")
];

function props(over: Partial<React.ComponentProps<typeof MachinePickerSheet>> = {}) {
    return {
        open:         true,
        onOpenChange: jest.fn(),
        machines:     CAFE,
        activeId:     "bar-2",
        connected:    true,
        survey:       {heard: ["spare", "window"], looking: false, error: null},
        onRescan:     jest.fn(),
        blocker:      null,
        onChoose:     jest.fn(),
        ...over
    };
}

describe("the machine picker", () => {
    it.each(THEME_IDS)("draws every canonical identity plus missing-colour green without changing order: %s", async theme => {
        const choice = {theme, recipeColours: "themed"} as const;
        const machines = machineColours.map((colour, index) => entry(colour.name, {colour: index}));
        machines.push(entry("Historical"));
        const before = JSON.stringify(machines);
        await renderWithProviders(<AppearanceScope choice={choice}>
            <MachinePickerSheet {...props({machines, activeId: "", connected: false,
                survey: {heard: machines.map(machine => machine.id), looking: false, error: null}})}/>
        </AppearanceScope>);
        expect(screen.getAllByTestId(/^machine-pick-colour-/, {includeHiddenElements: true}).map(node => node.props.testID))
            .toEqual(machines.map(machine => `machine-pick-colour-${machine.id}`));
        for (const [index, machine] of machines.entries()) {
            expect(screen.getByTestId(`machine-pick-colour-${machine.id}`, {includeHiddenElements: true})).toHaveStyle({
                backgroundColor: resolveAppearance(choice).machineColour(machineColours[index % 4]).ink
            });
        }
        expect(JSON.stringify(machines)).toBe(before);
    });
    it("keeps the connected machine connected before the first survey returns", async () => {
        await renderWithProviders(<MachinePickerSheet {...props({
            survey: {heard: null, looking: true, error: null}
        })}/>);

        expect(screen.getByLabelText(/^BAR-2, .*connected$/)).toBeTruthy();
        expect(screen.getByTestId("machine-heading-connected")).toBeTruthy();
    });

    it("puts the connected machine first, then the nearby ones, then the rest", async () => {
        await renderWithProviders(<MachinePickerSheet {...props()}/>);

        const drawn = screen.getAllByTestId(/^machine-(pick|heading)-/)
            .map((node) => String(node.props.testID).replace(/^machine-(pick|heading)-/, ""))
            .filter((id) => id !== "note" && id !== "scroll");
        expect(drawn).toEqual([
            "connected", "bar-2", "nearby", "window", "spare", "away", "bar-1", "back"
        ]);
        expect(screen.getByLabelText(/^BAR-2, .*connected$/)).toBeTruthy();
        expect(screen.getByLabelText(/^WINDOW, .*nearby$/)).toBeTruthy();
        expect(screen.getByLabelText(/^SPARE, .*nearby$/)).toBeTruthy();
        expect(screen.getByLabelText(/^BAR-1, .*not nearby$/)).toBeTruthy();
    });

    it("switches to a nearby machine in one tap and closes", async () => {
        const onChoose = jest.fn();
        const onOpenChange = jest.fn();
        await renderWithProviders(<MachinePickerSheet {...props({onChoose, onOpenChange})}/>);

        await fireEvent.press(screen.getByTestId("machine-pick-window"));

        expect(onChoose).toHaveBeenCalledWith("window");
        expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it("does not offer a machine that was not heard", async () => {
        const onChoose = jest.fn();
        await renderWithProviders(<MachinePickerSheet {...props({onChoose})}/>);

        await fireEvent.press(screen.getByTestId("machine-pick-bar-1"));

        expect(onChoose).not.toHaveBeenCalled();
        expect(screen.getByLabelText(/^BAR-1, /).props.accessibilityState).toMatchObject({disabled: true});
    });

    it("tells two machines apart by the end of the serial, or of the id before there is one", async () => {
        await renderWithProviders(<MachinePickerSheet {...props()}/>);

        expect(screen.getByText(/#H051/)).toBeTruthy();
        expect(screen.getByLabelText(/^WINDOW, .*ID NDOW/)).toBeTruthy();
    });

    it("says so plainly when none of the saved machines is nearby, and offers a rescan", async () => {
        const onRescan = jest.fn();
        await renderWithProviders(<MachinePickerSheet {...props({
            connected: false, activeId: "bar-1",
            survey: {heard: ["someone-elses"], looking: false, error: null}, onRescan
        })}/>);

        expect(screen.getByTestId("machine-pick-note").props.children)
            .toMatch(/None of your saved machines is nearby/);
        await fireEvent.press(screen.getByTestId("machine-rescan"));
        expect(onRescan).toHaveBeenCalled();
    });

    it("locks every row while a brew owns the link, and says why", async () => {
        const onChoose = jest.fn();
        await renderWithProviders(<MachinePickerSheet {...props({
            onChoose, blocker: "A brew is running. Stop it or let it finish before changing machines."
        })}/>);

        await fireEvent.press(screen.getByTestId("machine-pick-window"));

        expect(onChoose).not.toHaveBeenCalled();
        expect(screen.getByTestId("machine-pick-note").props.children).toMatch(/A brew is running/);
    });

    it("marks nothing nearby before anybody has looked", async () => {
        await renderWithProviders(<MachinePickerSheet {...props({
            connected: false, survey: {heard: null, looking: true, error: null}
        })}/>);

        expect(screen.getByText("NOT LOOKED FOR YET")).toBeTruthy();
        expect(screen.queryByText("NEARBY")).toBeNull();
        expect(screen.getByText("LOOKING…")).toBeTruthy();
    });

    it("holds ten machines in a list that scrolls", async () => {
        const many = Array.from({length: 10}, (_, index) => entry(`m${index}`));
        await renderWithProviders(<MachinePickerSheet {...props({
            machines: many, activeId: "m0", survey: {heard: many.map((m) => m.id), looking: false, error: null}
        })}/>);

        expect(screen.getByTestId("machine-pick-scroll")).toBeTruthy();
        expect(screen.getByTestId("machine-pick-m9")).toBeTruthy();
    });
});

describe("the machine chip", () => {
    it("names the machine and opens the picker", async () => {
        const onPress = jest.fn();
        await renderWithProviders(<MachineChip label="Work" onPress={onPress}/>);

        expect(screen.getByTestId("machine-chip-label").props.children).toBe("WORK");
        await fireEvent.press(screen.getByLabelText("Machine, Work"));
        expect(onPress).toHaveBeenCalled();
    });
});

describe("the machine picker for a screen reader", () => {
    it("announces each group as a heading", async () => {
        await renderWithProviders(<MachinePickerSheet {...props()}/>);

        expect(screen.getAllByRole("header").map((node) => node.props.accessibilityLabel))
            .toEqual(["CONNECTED", "NEARBY", "NOT NEARBY"]);
    });

    it("reports the connected machine as the current choice, not as unavailable", async () => {
        await renderWithProviders(<MachinePickerSheet {...props()}/>);

        const state = screen.getByLabelText(/^BAR-2, /).props.accessibilityState;
        expect(state).toMatchObject({selected: true});
        expect(state.disabled).toBeFalsy();
    });
});

describe("the machine picker's rows", () => {
    it("say each machine's place in the order, and never Default", async () => {
        await renderWithProviders(<MachinePickerSheet {...props()}/>);

        expect(screen.getByLabelText(/^BAR-1, Studio · Tried 1st · /)).toBeTruthy();
        expect(screen.getByLabelText(/^SPARE, Studio · Tried 5th · /)).toBeTruthy();
        expect(screen.queryByLabelText(/Default|Choice \d/)).toBeNull();
    });

    it("mark each machine with its colour, green for one saved before colours", async () => {
        await renderWithProviders(<MachinePickerSheet {...props({
            machines: [entry("home"), entry("work", {colour: 1}), entry("cafe", {colour: 3})]
        })}/>);

        const dot = (id: string) => StyleSheet.flatten(screen.getByTestId(
            `machine-pick-colour-${id}`, {includeHiddenElements: true}).props.style).backgroundColor;
        expect(dot("home")).toBe(machineColours[0].ink);
        expect(dot("work")).toBe(machineColours[1].ink);
        expect(dot("cafe")).toBe(machineColours[3].ink);
    });
});
