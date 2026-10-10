import React from "react";
import {AccessibilityInfo} from "react-native";
import {act, fireEvent, screen} from "@testing-library/react-native";
import {renderWithProviders} from "@/test-utils/render";
import EasyModeWriteOverlay from "@/components/EasyModeWriteOverlay";
import EasyModeSlots from "@/components/EasyModeSlots";
import type {SlotAttempt} from "@/hooks/useEasyModeSlots";
import {emptySlotRecord, prepareSet, snapshotRecipe} from "@/library/slots/slotModel";
import {coffee} from "@/library/slots/__tests__/fixtures";
import {SLOT_WRITE_SUCCESS_HOLD_MS} from "@/constants/motion";
import * as motion from "@/constants/motion";

const attempt: SlotAttempt = {deviceId: "one", serial: "serial", operation: "write", status: "writing"};
function record(acknowledged = 0) {
    const saved = snapshotRecipe(coffee("Frozen morning"));
    return {
        ...emptySlotRecord(),
        journal: {
            id: "attempt", serial: "serial", slots: [saved, saved, saved] as [typeof saved, typeof saved, typeof saved],
            frames: prepareSet([saved, saved, saved]), acknowledged,
            inFlight: acknowledged < 3 ? acknowledged as 0 | 1 | 2 : null, error: null
        }
    };
}

it("shows durable receipts, active snapshot, and saving rather than inferred success", async () => {
    const announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility");
    const view = await renderWithProviders(<EasyModeWriteOverlay record={record(1)} attempt={attempt}/>);
    expect(screen.getByText("WRITING YOUR SLOTS")).toBeOnTheScreen();
    expect(screen.getByText("Frozen morning")).toBeOnTheScreen();
    expect(screen.getByText("A: received")).toBeOnTheScreen();
    expect(screen.getByText("B: writing")).toBeOnTheScreen();
    expect(screen.getByText("C: pending")).toBeOnTheScreen();
    expect(screen.getByText("Keep the app open and stay near your machine.")).toBeOnTheScreen();
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(screen.queryByText(/%/)).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
    expect(announce).toHaveBeenLastCalledWith(expect.stringContaining("Writing B"));
    await view.rerender(<EasyModeWriteOverlay record={record(3)} attempt={attempt}/>);
    expect(screen.getByText("SAVING")).toBeOnTheScreen();
    expect(screen.queryByText("SLOTS WRITTEN")).toBeNull();
    expect(announce).toHaveBeenLastCalledWith(expect.stringContaining("Saving"));
    announce.mockRestore();
});

it("only shows success from the completed hook attempt and dismisses once with timer cleanup", async () => {
    jest.useFakeTimers();
    const onDismissSuccess = jest.fn();
    const saved = snapshotRecipe(coffee());
    const completed = {...emptySlotRecord(), written: {at: 1000, slots: [saved, saved, saved] as [typeof saved, typeof saved, typeof saved]}};
    const view = await renderWithProviders(<EasyModeWriteOverlay record={completed}
        attempt={null} onDismissSuccess={onDismissSuccess}/>);
    expect(screen.queryByText("SLOTS WRITTEN")).toBeNull();
    await view.rerender(<EasyModeWriteOverlay record={completed} attempt={{...attempt, status: "success"}}
        onDismissSuccess={onDismissSuccess}/>);
    expect(screen.getByText("SLOTS WRITTEN")).toBeOnTheScreen();
    expect(screen.getByText("C: received")).toBeOnTheScreen();
    await act(async () => jest.advanceTimersByTime(SLOT_WRITE_SUCCESS_HOLD_MS));
    expect(onDismissSuccess).toHaveBeenCalledTimes(1);
    await view.unmount();
    await act(async () => jest.runOnlyPendingTimers());
    expect(onDismissSuccess).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
});

it("cleans up the success timer when unmounted before dismissal", async () => {
    jest.useFakeTimers();
    const onDismissSuccess = jest.fn();
    const saved = snapshotRecipe(coffee());
    const completed = {...emptySlotRecord(), written: {at: 1000, slots: [saved, saved, saved] as [typeof saved, typeof saved, typeof saved]}};
    const view = await renderWithProviders(<EasyModeWriteOverlay record={completed}
        attempt={{...attempt, status: "success"}} onDismissSuccess={onDismissSuccess}/>);
    await view.unmount();
    await act(async () => jest.advanceTimersByTime(SLOT_WRITE_SUCCESS_HOLD_MS));
    expect(onDismissSuccess).not.toHaveBeenCalled();
    jest.useRealTimers();
});

it("does not restart the success hold when a parent supplies a fresh callback", async () => {
    jest.useFakeTimers();
    const original = jest.fn();
    const latest = jest.fn();
    const saved = snapshotRecipe(coffee());
    const completed = {...emptySlotRecord(), written: {at: 1000, slots: [saved, saved, saved] as [typeof saved, typeof saved, typeof saved]}};
    const view = await renderWithProviders(<EasyModeWriteOverlay record={completed}
        attempt={{...attempt, status: "success"}} onDismissSuccess={original}/>);
    await act(async () => jest.advanceTimersByTime(SLOT_WRITE_SUCCESS_HOLD_MS / 2));
    await view.rerender(<EasyModeWriteOverlay record={completed}
        attempt={{...attempt, status: "success"}} onDismissSuccess={latest}/>);
    await act(async () => jest.advanceTimersByTime(SLOT_WRITE_SUCCESS_HOLD_MS / 2));
    expect(latest).toHaveBeenCalledTimes(1);
    expect(original).not.toHaveBeenCalled();
    await view.unmount();
    jest.useRealTimers();
});

it("retains the same receipt and saving status with reduced motion", async () => {
    const reduced = jest.spyOn(motion, "useReducedMotion").mockReturnValue(true);
    try {
        await renderWithProviders(<EasyModeWriteOverlay record={record(3)} attempt={attempt}/>);
        expect(screen.getByText("SAVING")).toBeOnTheScreen();
        expect(screen.getByText("C: received")).toBeOnTheScreen();
        expect(screen.queryByText("SLOTS WRITTEN")).toBeNull();
    } finally {
        reduced.mockRestore();
    }
});

it("covers the old running-only contract without inventing success", async () => {
    await renderWithProviders(<EasyModeSlots record={record(1)} recipes={[]} deviceId="one"
        connected available running error={null} onAssign={jest.fn()} onWrite={jest.fn()}
        onRecover={jest.fn()} onCancel={jest.fn()}/>);
    expect(screen.getByText("WRITING YOUR SLOTS")).toBeOnTheScreen();
    expect(screen.queryByRole("button")).toBeNull();
});

it("removes outgoing recovery sheets when a native recovery attempt starts", async () => {
    const options = {
        record: record(1), recipes: [], deviceId: "one", serial: "serial",
        connected: true, available: true, running: false, error: "Receipt unknown",
        onAssign: jest.fn(), onWrite: jest.fn(), onRecover: jest.fn(), onCancel: jest.fn()
    };
    const view = await renderWithProviders(<EasyModeSlots {...options}/>);
    await fireEvent.press(screen.getByRole("button", {name: "Retry slot write"}));
    expect(await screen.findByText("Which screen is your machine showing?")).toBeOnTheScreen();
    await view.rerender(<EasyModeSlots {...options} running attempt={{...attempt, operation: "recover"}}/>);
    expect(screen.getByText("WRITING YOUR SLOTS")).toBeOnTheScreen();
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByText("Which screen is your machine showing?")).toBeNull();
});

it.each(["cancelled", "error"] as const)("does not show write success for %s", async (status) => {
    await renderWithProviders(<EasyModeWriteOverlay record={emptySlotRecord()}
        attempt={{...attempt, operation: "cancel", status}}/>);
    expect(screen.queryByTestId("easy-mode-write-overlay")).toBeNull();
});

it("covers every host control during the attempt and ignores another device's success", async () => {
    const options = {
        record: record(1), recipes: [coffee()], deviceId: "one", serial: "serial",
        connected: true, available: true, running: true, error: null,
        onAssign: jest.fn(), onWrite: jest.fn(), onRecover: jest.fn(), onCancel: jest.fn()
    };
    const view = await renderWithProviders(<EasyModeSlots {...options} attempt={attempt}/>);
    expect(screen.getByTestId("easy-mode-host", {includeHiddenElements: true}).props)
        .toMatchObject({accessibilityElementsHidden: true, importantForAccessibility: "no-hide-descendants"});
    expect(screen.queryByRole("button", {name: "Change slot A recipe"})).toBeNull();
    expect(screen.queryByRole("button", {name: "Cancel slot write"})).toBeNull();
    await view.rerender(<EasyModeSlots {...options} record={emptySlotRecord()} running={false}
        attempt={{...attempt, deviceId: "other", status: "success"}}/>);
    expect(screen.queryByTestId("easy-mode-write-overlay")).toBeNull();
    expect(screen.getByRole("button", {name: "About Easy Mode"})).toBeOnTheScreen();
    await view.rerender(<EasyModeSlots {...options} record={emptySlotRecord()} running={false}
        attempt={{...attempt, serial: "other", status: "success"}}/>);
    expect(screen.queryByTestId("easy-mode-write-overlay")).toBeNull();
    await fireEvent.press(screen.getByRole("button", {name: "About Easy Mode"}));
    expect(screen.getByTestId("easy-mode-host", {includeHiddenElements: true}).props)
        .toMatchObject({accessibilityElementsHidden: true, importantForAccessibility: "no-hide-descendants"});
});
