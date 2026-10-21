import React from "react";
import {AppState, type AppStateStatus} from "react-native";
import {act, waitFor} from "@testing-library/react-native";

import {useRoasterForegroundSync} from "@/hooks/useRoasterForegroundSync";
import {announceBack} from "@/hooks/useRoasterSubscriptions";
import {syncDue} from "@/library/roasterSync";
import {renderWithProviders} from "@/test-utils/render";
import {memorySettings} from "@/test-utils/roasterFeed";

jest.mock("@/library/roasterSync", () => ({syncDue: jest.fn()}));
jest.mock("@/hooks/useRoasterSubscriptions", () => ({announceBack: jest.fn()}));
jest.mock("@/hooks/useSetting", () =>
    require("@/test-utils/settingsMock").settingsMock());
jest.mock("@/components/XbrwToast", () => ({notify: jest.fn()}));

function Owner() {
    useRoasterForegroundSync();
    return null;
}

it("syncs on launch and foreground only, announces results and removes its listener", async () => {
    const result = {ok: false, reason: "notDue"} as const;
    jest.mocked(syncDue).mockResolvedValue([result]);
    let onChange: ((state: AppStateStatus) => void) | undefined;
    const remove = jest.fn();
    const listener = jest.spyOn(AppState, "addEventListener").mockImplementation((_event, cb) => {
        onChange = cb;
        return {remove};
    });
    try {
        const view = await renderWithProviders(<Owner/>);
        await waitFor(() => expect(syncDue).toHaveBeenCalledTimes(1));
        expect(announceBack).toHaveBeenCalledWith(result);
        await act(async () => onChange?.("background"));
        expect(syncDue).toHaveBeenCalledTimes(1);
        await act(async () => onChange?.("active"));
        expect(syncDue).toHaveBeenCalledTimes(2);
        await view.unmount();
        expect(remove).toHaveBeenCalledTimes(1);
    } finally {
        listener.mockRestore();
    }
});

it("reports a storage failure without letting the foreground promise reject", async () => {
    const {notify} = jest.requireMock("@/components/XbrwToast");
    jest.mocked(syncDue).mockRejectedValueOnce(new Error("storage unavailable"));
    const settings = memorySettings();
    function FailingOwner() {
        useRoasterForegroundSync(settings);
        return null;
    }
    const listener = jest.spyOn(AppState, "addEventListener").mockReturnValue({remove: jest.fn()});
    try {
        const view = await renderWithProviders(<FailingOwner/>);
        await waitFor(() => expect(notify).toHaveBeenCalledWith(expect.objectContaining({
            tone: "error",
            message: expect.stringContaining("saved")
        })));
        await view.unmount();
    } finally {
        listener.mockRestore();
    }
});
