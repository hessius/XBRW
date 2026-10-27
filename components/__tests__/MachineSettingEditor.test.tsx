import React from "react";
import {fireEvent, screen} from "@testing-library/react-native";
import {renderWithProviders} from "@/test-utils/render";
import MachineSettingEditor from "@/components/MachineSettingEditor";
import type {SettingEditorState} from "@/library/machine/controlModel";

it("never guesses missing numeric values, limits or units and renders busy fields read-only", async () => {
    const change = jest.fn();
    const read = jest.fn();
    const props = {
        draft: {id: "pourRadius", proposal: null} as SettingEditorState, policy: {},
        reading: "unavailable" as const, current: null,
        editable: true, canApply: false, pending: false, applied: false,
        unavailable: null, error: null, recoverable: false,
        onChange: change, onChooseCurrent: jest.fn(), onRead: read, onApply: jest.fn(), onRecover: jest.fn()
    };
    const view = await renderWithProviders(<MachineSettingEditor {...props}/>);
    expect(screen.getByRole("button", {name: "Use current value as proposal"})).toBeDisabled();
    expect(screen.queryByLabelText("Increase Pour radius")).toBeNull();
    expect(screen.getByText(/No physical unit has been qualified/)).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", {name: "Read current value"}));
    expect(read).toHaveBeenCalledTimes(1);
    expect(change).not.toHaveBeenCalled();
    await view.rerender(<MachineSettingEditor {...props}
        draft={{id: "pourRadius", proposal: 2}} policy={{pourRadius: {min: 1, max: 3, step: 1}}}
        editable={false} pending/>);
    expect(screen.queryByLabelText("Increase Pour radius")).toBeNull();
    expect(screen.getByRole("button", {name: "Apply"})).toBeDisabled();
});

it("offers only qualified water choices and leaves the physical-supply explanation visible before Apply", async () => {
    const change = jest.fn();
    const apply = jest.fn();
    await renderWithProviders(<MachineSettingEditor
        draft={{id: "waterSource", proposal: null}} policy={{waterSource: ["tank"]}}
        reading="current" current="tank" editable canApply={false} pending={false} applied={false}
        unavailable={null} error={null} recoverable={false} onChange={change}
        onChooseCurrent={jest.fn()} onRead={jest.fn()} onApply={apply} onRecover={jest.fn()}/>);
    expect(screen.queryByRole("button", {name: "Plumbed supply"})).toBeNull();
    expect(screen.getByText(/actual connected water line/)).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", {name: "Tank"}));
    expect(change).toHaveBeenCalledWith({id: "waterSource", proposal: "tank"});
    expect(apply).not.toHaveBeenCalled();
});
