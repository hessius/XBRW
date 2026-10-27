import React, {useState} from "react";
import {fireEvent, screen} from "@testing-library/react-native";
import {MachineNumericControl} from "@/components/MachineControlReadout";
import {validateSetting, type NumericPolicy} from "@/library/machine/controlModel";
import {renderWithProviders} from "@/test-utils/render";

function Host({policy, initial, changed}: {
    policy: NumericPolicy; initial: number; changed: (value: number) => void;
}) {
    const [value, setValue] = useState(initial);
    return <MachineNumericControl label="Speed" value={value} policy={policy} editable
        onChange={next => {
            validateSetting("brightness", next, {brightness: policy});
            changed(next);
            setValue(next);
        }}/>;
}

it("stays on the qualified ladder at an off-grid maximum and when typing", async () => {
    const changed = jest.fn();
    await renderWithProviders(<Host policy={{min: 400, max: 1000, step: 80}} initial={880} changed={changed}/>);
    await fireEvent.press(screen.getByLabelText("Increase Speed"));
    expect(screen.getByTestId("stepper-value")).toHaveTextContent("960");
    await fireEvent.press(screen.getByLabelText("Increase Speed"));
    expect(changed.mock.calls.map(([value]) => value)).toEqual([960]);
    await fireEvent.press(screen.getByLabelText("Decrease Speed"));
    expect(changed).toHaveBeenLastCalledWith(880);
    for (const [typed, expected] of [["1000", 960], ["920", 960], ["1", 400]] as const) {
        await fireEvent.press(screen.getByLabelText("Edit Speed"));
        await fireEvent.changeText(screen.getByLabelText("Speed"), typed);
        await fireEvent(screen.getByLabelText("Speed"), "blur");
        expect(changed).toHaveBeenLastCalledWith(expected);
    }
});

it("anchors decimal steps at the decimal minimum", async () => {
    const changed = jest.fn();
    await renderWithProviders(<Host policy={{min: 0.05, max: 0.4, step: 0.1}} initial={0.05} changed={changed}/>);
    await fireEvent.press(screen.getByLabelText("Increase Speed"));
    expect(changed).toHaveBeenLastCalledWith(0.15);
    await fireEvent.press(screen.getByLabelText("Edit Speed"));
    await fireEvent.changeText(screen.getByLabelText("Speed"), "0.4");
    await fireEvent(screen.getByLabelText("Speed"), "submitEditing");
    expect(changed).toHaveBeenLastCalledWith(0.35);
    await fireEvent.press(screen.getByLabelText("Decrease Speed"));
    expect(changed).toHaveBeenLastCalledWith(0.25);
});

it.each([
    {min: 1, max: 2, step: 0}, {min: 2, max: 1, step: 1},
    {min: 1, max: Infinity, step: 1}, {min: -Number.MAX_VALUE, max: Number.MAX_VALUE, step: 1}
])("exposes invalid policy without editable or dispatched values: %j", async policy => {
    const changed = jest.fn();
    await renderWithProviders(<Host policy={policy} initial={1} changed={changed}/>);
    expect(screen.getByText(/control is unavailable/)).toBeTruthy();
    expect(screen.queryByLabelText("Increase Speed")).toBeNull();
    expect(changed).not.toHaveBeenCalled();
});
