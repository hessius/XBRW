import {AppState, type AppStateStatus} from "react-native";
import {act, renderHook} from "@testing-library/react-native";

import {useNow} from "@/hooks/useNow";

const BEFORE = new Date(2026, 9, 19, 23, 59, 50).getTime();
const MIDNIGHT = new Date(2026, 9, 20).getTime();

beforeEach(() => {
    jest.useFakeTimers({now: BEFORE});
});

afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
});

it("updates at local midnight without ticking throughout the day", async () => {
    const {result} = await renderHook(() => useNow());
    await act(async () => { jest.advanceTimersByTime(5_000); });
    expect(result.current).toBe(BEFORE);
    await act(async () => { jest.advanceTimersByTime(5_000); });
    expect(result.current).toBe(MIDNIGHT);
    const tomorrow = new Date(2026, 9, 21).getTime();
    await act(async () => { jest.advanceTimersByTime(tomorrow - MIDNIGHT); });
    expect(result.current).toBe(tomorrow);
});

it.each([new Date(2026, 2, 29, 0, 30), new Date(2026, 9, 25, 0, 30)])(
    "uses calendar midnight on daylight-saving boundary %s", async (start) => {
        jest.setSystemTime(start);
        const next = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1).getTime();
        const {result} = await renderHook(() => useNow());
        await act(async () => { jest.advanceTimersByTime(next - start.getTime() - 1); });
        expect(result.current).toBe(start.getTime());
        await act(async () => { jest.advanceTimersByTime(1); });
        expect(result.current).toBe(next);
    }
);

it("does not open a clock or listener while disabled and refreshes each enabled generation", async () => {
    const listen = jest.spyOn(AppState, "addEventListener").mockClear();
    const schedule = jest.spyOn(global, "setTimeout");
    const cancel = jest.spyOn(global, "clearTimeout");
    const clock = jest.fn(() => Date.now());
    const {result, rerender, unmount} = await renderHook(
        ({enabled}: {enabled: boolean}) => useNow(clock, enabled),
        {initialProps: {enabled: false}}
    );
    expect(result.current).toBeNull();
    expect(listen).not.toHaveBeenCalled();
    expect(clock).not.toHaveBeenCalled();
    expect(schedule).not.toHaveBeenCalled();
    await rerender({enabled: true});
    expect(result.current).toBeNull();
    await act(async () => { jest.advanceTimersByTime(0); });
    expect(result.current).toBe(BEFORE);
    const firstTimer = schedule.mock.results.at(-1)?.value;
    await rerender({enabled: false});
    expect(result.current).toBeNull();
    expect(cancel).toHaveBeenCalledWith(firstTimer);
    const later = BEFORE + 3 * 86_400_000;
    jest.setSystemTime(later);
    await rerender({enabled: true});
    expect(result.current).toBeNull();
    await act(async () => { jest.advanceTimersByTime(0); });
    expect(result.current).toBe(later);
    const lastTimer = schedule.mock.results.at(-1)?.value;
    await unmount();
    expect(cancel).toHaveBeenCalledWith(lastTimer);
});

it("reschedules after foregrounding with a changed clock and clears resources on unmount", async () => {
    const schedule = jest.spyOn(global, "setTimeout");
    const cancel = jest.spyOn(global, "clearTimeout");
    let changed: ((state: AppStateStatus) => void) | undefined;
    const remove = jest.fn();
    jest.spyOn(AppState, "addEventListener").mockImplementation((_event, listener) => {
        changed = listener;
        return {remove};
    });

    const {result, unmount} = await renderHook(() => useNow());
    const afternoon = new Date(2026, 9, 22, 15).getTime();
    jest.setSystemTime(afternoon);
    await act(async () => { changed?.("active"); });
    expect(result.current).toBe(afternoon);
    const nextMidnight = new Date(2026, 9, 23).getTime();
    await act(async () => { jest.advanceTimersByTime(nextMidnight - afternoon); });
    expect(result.current).toBe(nextMidnight);
    const nextDelay = new Date(2026, 9, 24).getTime() - nextMidnight;
    const pending = schedule.mock.calls.findIndex(([, delay]) => delay === nextDelay);
    expect(pending).toBeGreaterThanOrEqual(0);
    await unmount();
    expect(remove).toHaveBeenCalledTimes(1);
    expect(cancel).toHaveBeenCalledWith(schedule.mock.results[pending].value);
});
