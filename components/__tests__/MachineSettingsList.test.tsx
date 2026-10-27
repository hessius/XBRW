import React from "react";
import {act, fireEvent, screen} from "@testing-library/react-native";
import {renderWithProviders} from "@/test-utils/render";
import MachineSettingsList, {machineSettingRoute} from "@/components/MachineSettingsList";
import {machineSettingsFixture, settingIdentity} from "@/test-utils/machineSettings";

jest.mock("react-native-ble-manager", () => ({__esModule: true, default: {}}));
jest.mock("@/components/XbrwToast", () => ({notify: jest.fn()}));
jest.mock("@/hooks/useSetting", () => jest.requireActual("@/test-utils/settingsMock").settingsMock());

it("groups six named setting links without reading, connecting or choosing a first option", async () => {
    const s = await machineSettingsFixture();
    const select = jest.fn();
    await renderWithProviders(<MachineSettingsList identity={settingIdentity} controls={s.controls} onSelect={select}/>);
    expect(screen.getAllByRole("header").map(node => node.props.children)).toEqual(["Machine settings", "Tuning"]);
    expect(screen.getAllByRole("button")).toHaveLength(6);
    expect(screen.getByRole("button", {name: /Temperature unit: Unavailable/})).toBeTruthy();
    expect(s.radio.sent).toEqual([]);
    await fireEvent.press(screen.getByRole("button", {name: /Water source:/}));
    expect(select).toHaveBeenCalledWith("waterSource");
    expect(machineSettingRoute(settingIdentity.deviceId, "waterSource")).toEqual({
        pathname: "/machineSetting", params: {machineId: settingIdentity.deviceId, setting: "waterSource"}
    });
    expect(s.planned).toEqual([]);
    s.controls.dispose();
});

it("shows only qualified matching readings and explicitly labels offline values last-known", async () => {
    const s = await machineSettingsFixture();
    await s.controls.readSettings(settingIdentity, "weightUnit");
    const view = await renderWithProviders(<MachineSettingsList identity={settingIdentity} controls={s.controls} onSelect={jest.fn()}/>);
    expect(screen.getByRole("button", {name: "Weight unit: g"})).toBeTruthy();
    await act(async () => s.radio.drop());
    expect(screen.getByRole("button", {name: "Weight unit: Last known · g"})).toBeTruthy();
    await view.rerender(<MachineSettingsList identity={{...settingIdentity, serial: "wrong"}} controls={s.controls} onSelect={jest.fn()}/>);
    expect(screen.queryByRole("button", {name: "Weight unit: Last known · g"})).toBeNull();
    expect(screen.getByRole("button", {name: /Weight unit: Unavailable/})).toBeTruthy();
    s.controls.dispose();
});
