import React from "react";
import {Platform} from "react-native";
import {DateTimePickerAndroid} from "@react-native-community/datetimepicker";
import {act, fireEvent, screen} from "@testing-library/react-native";

import BagSheet from "@/components/BagSheet";
import {newBag, type BagTracker, type CoffeeBag} from "@/library/coffeeBag";
import type {AdvisedCoffee} from "@/library/restPeak";
import {renderWithProviders} from "@/test-utils/render";

function noop() {}

/** 18 Oct 2026, mid-afternoon local time: "today" for every test here. */
const NOW = new Date(2026, 9, 18, 15, 30).getTime();
const TODAY = "2026-10-18";
/** No roast level known: the medium defaults. */
const MEDIUM = {restDays: 7, peakDay: 18, bestUntilDay: 27};

beforeEach(() => {
    // Only the date is faked, and it keeps moving, so sheet animations still
    // finish: a frozen Date.now leaves them settling outside act().
    jest.useFakeTimers({
        now: NOW,
        advanceTimers: true,
        doNotFake: ["nextTick", "setImmediate", "clearImmediate", "setTimeout", "clearTimeout",
            "setInterval", "clearInterval", "queueMicrotask", "hrtime", "performance",
            "requestAnimationFrame", "cancelAnimationFrame", "requestIdleCallback", "cancelIdleCallback"]
    });
    (DateTimePickerAndroid.open as jest.Mock).mockClear();
});

afterEach(() => {
    jest.useRealTimers();
});

/** Where this run's platform shows the calendar, opened from the row. */
async function openCalendar(): Promise<{
    value: Date; minimumDate: Date; maximumDate: Date; pick: (date: Date) => void;
}> {
    await fireEvent.press(screen.getByTestId("bag-roasted-field"));
    if (Platform.OS === "android") {
        const calls = (DateTimePickerAndroid.open as jest.Mock).mock.calls;
        const args = calls[calls.length - 1][0];
        return {...args, pick: (date: Date) => args.onValueChange({nativeEvent: {}}, date)};
    }
    const props = screen.getByTestId("bag-roasted-calendar").props as {
        value: Date; minimumDate: Date; maximumDate: Date;
        onValueChange: (event: unknown, date: Date) => void;
    };
    return {...props, pick: (date: Date) => props.onValueChange({nativeEvent: {}}, date)};
}

const BAG = {...newBag("r1", {sizeGrams: 250, roastedOn: "2026-10-12"}, 1_760_000_000_000), id: "bag-1"};

async function open(over: {
    tracker?: BagTracker; bag?: CoffeeBag | null; gramsLeft?: number | null;
    onSave?: jest.Mock; onFinish?: jest.Mock; onRemove?: jest.Mock;
    beanNameFixed?: boolean; suggestedRoastedOn?: string; coffee?: AdvisedCoffee;
} = {}) {
    await renderWithProviders(
        <BagSheet open onOpenChange={noop} epoch={1}
                  tracker={over.tracker ?? "xbrw"}
                  bag={over.bag === undefined ? null : over.bag}
                  gramsLeft={over.gramsLeft ?? null}
                  suggestedRoastedOn={over.suggestedRoastedOn}
                  coffee={over.coffee}
                  beanName="Ethiopia Guji" beanNameFixed={over.beanNameFixed ?? false}
                  onSave={over.onSave ?? jest.fn()}
                  onFinish={over.onFinish ?? jest.fn()}
                  onRemove={over.onRemove ?? jest.fn()}/>
    );
}

describe("BagSheet", () => {
    it("adds a bag from a preset size and a roast day", async () => {
        const onSave = jest.fn();
        await open({onSave, suggestedRoastedOn: "2026-10-01"});
        await fireEvent.press(screen.getByTestId("bag-size-320"));
        expect(screen.getByTestId("bag-roasted-value")).toHaveTextContent("Thu 1 Oct 2026");
        const calendar = await openCalendar();
        await act(() => calendar.pick(new Date(2026, 9, 12, 9, 0)));
        await fireEvent.press(screen.getByTestId("bag-save"));
        expect(onSave).toHaveBeenCalledWith({sizeGrams: 320, roastedOn: "2026-10-12",
            // No roast level known, so the medium defaults.
            figures: {restDays: 7, peakDay: 18, bestUntilDay: 27}});
    });

    it("starts a new bag on today", async () => {
        const onSave = jest.fn();
        await open({onSave});
        expect(screen.getByTestId("bag-roasted-value")).toHaveTextContent("Today, 18 Oct");
        await fireEvent.press(screen.getByTestId("bag-save"));
        expect(onSave).toHaveBeenCalledWith({sizeGrams: 250, roastedOn: TODAY, figures: MEDIUM});
    });

    it("shows an edited bag's own roast day", async () => {
        await open({bag: BAG, gramsLeft: 200});
        expect(screen.getByTestId("bag-roasted-value")).toHaveTextContent("Mon 12 Oct 2026");
    });

    it("shows no roast day on an edited bag that has none", async () => {
        await open({bag: {...BAG, roastedOn: undefined}, gramsLeft: 200});
        expect(screen.getByTestId("bag-roasted-value")).toHaveTextContent("Not set");
        expect(screen.queryByTestId("bag-roasted-clear")).toBeNull();
    });

    it("offers days from a year back up to today, never later", async () => {
        await open();
        const calendar = await openCalendar();
        expect(calendar.maximumDate).toEqual(new Date(2026, 9, 18));
        expect(calendar.minimumDate).toEqual(new Date(2025, 9, 18));
        expect(calendar.value).toEqual(new Date(2026, 9, 18));
    });

    it("saves the local day picked, whatever the hour", async () => {
        const onSave = jest.fn();
        await open({onSave});
        const calendar = await openCalendar();
        // Just before midnight: a UTC reading would be the next day east of
        // Greenwich and the day before west of it.
        await act(() => calendar.pick(new Date(2026, 9, 16, 23, 59)));
        expect(screen.getByTestId("bag-roasted-value")).toHaveTextContent("Fri 16 Oct 2026");
        await fireEvent.press(screen.getByTestId("bag-save"));
        expect(onSave).toHaveBeenCalledWith({sizeGrams: 250, roastedOn: "2026-10-16", figures: MEDIUM});
    });

    it("clears the roast day, which stays optional", async () => {
        const onSave = jest.fn();
        await open({onSave});
        await fireEvent.press(screen.getByTestId("bag-roasted-clear"));
        expect(screen.getByTestId("bag-roasted-value")).toHaveTextContent("Not set");
        await fireEvent.press(screen.getByTestId("bag-save"));
        expect(onSave).toHaveBeenCalledWith({sizeGrams: 250});
    });

    it("takes a custom size and refuses one that is not whole grams", async () => {
        const onSave = jest.fn();
        await open({onSave});
        await fireEvent.press(screen.getByTestId("bag-size-other"));
        await fireEvent.changeText(screen.getByTestId("bag-size-field"), "12.5");
        expect(screen.getByTestId("bag-size-error")).toBeTruthy();
        await fireEvent.press(screen.getByTestId("bag-save"));
        expect(onSave).not.toHaveBeenCalled();
        await fireEvent.changeText(screen.getByTestId("bag-size-field"), "750");
        await fireEvent.press(screen.getByTestId("bag-save"));
        expect(onSave).toHaveBeenCalledWith({sizeGrams: 750, roastedOn: TODAY, figures: MEDIUM});
    });

    it("lets the grams left be corrected while editing", async () => {
        const onSave = jest.fn();
        await open({onSave, bag: BAG, gramsLeft: 212});
        expect(screen.getByTestId("bag-left-field").props.value).toBe("212");
        await fireEvent.changeText(screen.getByTestId("bag-left-field"), "150");
        await fireEvent.press(screen.getByTestId("bag-save"));
        expect(onSave).toHaveBeenCalledWith({sizeGrams: 250, roastedOn: "2026-10-12", gramsLeft: 150,
            figures: {restDays: 7, peakDay: 18, bestUntilDay: 27}});
    });

    it("finishes or removes an open bag", async () => {
        const onFinish = jest.fn();
        const onRemove = jest.fn();
        await open({bag: BAG, gramsLeft: 10, onFinish, onRemove});
        await fireEvent.press(screen.getByTestId("bag-sheet-finish"));
        await fireEvent.press(screen.getByTestId("bag-sheet-remove"));
        expect(onFinish).toHaveBeenCalled();
        expect(onRemove).toHaveBeenCalled();
    });

    it("in Beanconqueror mode asks for the bean name and price, not the grams left", async () => {
        const onSave = jest.fn();
        await open({tracker: "beanconqueror", onSave});
        expect(screen.getByTestId("bag-bean-name-field").props.value).toBe("Ethiopia Guji");
        expect(screen.queryByTestId("bag-left-field")).toBeNull();
        expect(screen.getByText("SEND TO BEANCONQUEROR")).toBeTruthy();
        await fireEvent.changeText(screen.getByTestId("bag-price-field"), "24,50");
        await fireEvent.press(screen.getByTestId("bag-save"));
        expect(onSave).toHaveBeenCalledWith({
            sizeGrams: 250, roastedOn: TODAY, price: 24.5, beanName: "Ethiopia Guji", figures: MEDIUM
        });
    });

    it("shows a pod's name without letting it be changed", async () => {
        await open({tracker: "beanconqueror", beanNameFixed: true});
        expect(screen.getByTestId("bag-bean-name")).toHaveTextContent("Ethiopia Guji");
        expect(screen.queryByTestId("bag-bean-name-field")).toBeNull();
    });

    describe("rest and peak", () => {
        it("asks only once there is a roast day", async () => {
            await open();
            expect(screen.getByTestId("bag-rest-peak")).toBeTruthy();
            await fireEvent.press(screen.getByTestId("bag-roasted-clear"));
            expect(screen.queryByTestId("bag-rest-peak")).toBeNull();
            const calendar = await openCalendar();
            await act(() => calendar.pick(new Date(2026, 9, 12)));
            expect(screen.getByTestId("bag-rest-peak")).toBeTruthy();
        });

        it("starts from the coffee's roast level and fills defaults from a picked level", async () => {
            const onSave = jest.fn();
            await open({onSave, suggestedRoastedOn: "2026-10-12", coffee: {roast: "Nordic Ultra-light"}});
            expect(screen.getByTestId("bag-roast-nordic").props.accessibilityState).toEqual({checked: true});
            expect(screen.getByTestId("bag-rest-field").props.value).toBe("14");
            expect(screen.getByTestId("bag-peak-field").props.value).toBe("35");
            await fireEvent.press(screen.getByTestId("bag-roast-dark"));
            expect(screen.getByTestId("bag-rest-field").props.value).toBe("4");
            await fireEvent.press(screen.getByTestId("bag-save"));
            expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
                figures: {restDays: 4, peakDay: 10, bestUntilDay: 15}
            }));
        });

        it("takes typed figures, moving best-until with the peak", async () => {
            const onSave = jest.fn();
            await open({onSave, suggestedRoastedOn: "2026-10-12", coffee: {roast: "Light"}});
            await fireEvent.changeText(screen.getByTestId("bag-rest-field"), "10");
            await fireEvent.changeText(screen.getByTestId("bag-peak-field"), "30");
            await fireEvent.press(screen.getByTestId("bag-save"));
            // Light keeps its best 14 days after the peak.
            expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
                figures: {restDays: 10, peakDay: 30, bestUntilDay: 44}
            }));
        });

        it("refuses a peak before the rest ends", async () => {
            const onSave = jest.fn();
            await open({onSave, suggestedRoastedOn: "2026-10-12"});
            await fireEvent.changeText(screen.getByTestId("bag-rest-field"), "20");
            await fireEvent.changeText(screen.getByTestId("bag-peak-field"), "10");
            expect(screen.getByTestId("bag-rest-peak-note"))
                .toHaveTextContent("The peak day is on or after the rest ends.");
            await fireEvent.press(screen.getByTestId("bag-save"));
            expect(onSave).not.toHaveBeenCalled();
        });

        it("shows the roaster's advice rather than asking", async () => {
            const onSave = jest.fn();
            await open({onSave, suggestedRoastedOn: "2026-10-12",
                        coffee: {restDays: 12, peakDay: 30, bestUntilDay: 45}});
            expect(screen.getByTestId("bag-rest-peak-roaster"))
                .toHaveTextContent("From the roaster: rest 12 days, peak on day 30.");
            expect(screen.queryByTestId("bag-rest-field")).toBeNull();
            await fireEvent.press(screen.getByTestId("bag-save"));
            expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
                figures: {restDays: 12, peakDay: 30, bestUntilDay: 45}
            }));
        });

        it("edits a bag from its own stored figures", async () => {
            const bag = {...BAG, restDays: 9, peakDay: 21, bestUntilDay: 30};
            await open({bag, gramsLeft: 200});
            expect(screen.getByTestId("bag-rest-field").props.value).toBe("9");
            expect(screen.getByTestId("bag-peak-field").props.value).toBe("21");
        });
    });
});
