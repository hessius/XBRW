import {act, renderHook} from "@testing-library/react-native";
import {AppState, type AppStateStatus} from "react-native";

import {useCatalogueNow} from "@/hooks/useCatalogueNow";

it("advances each minute and on foreground, and cleans up both subscriptions", async () => {
    jest.useFakeTimers();
    const interval = jest.spyOn(global, "setInterval");
    const clear = jest.spyOn(global, "clearInterval");
    let at = 1000;
    let foreground: ((state: AppStateStatus) => void) | undefined;
    const remove = jest.fn();
    const listener = jest.spyOn(AppState, "addEventListener").mockImplementation((_type, next) => {
        foreground = next;
        return {remove};
    });
    const clock = () => at;
    const {result, unmount} = await renderHook(() => useCatalogueNow(clock));
    expect(result.current).toBe(1000);
    at += 60_000;
    await act(() => jest.advanceTimersByTime(60_000));
    expect(result.current).toBe(61_000);
    at += 120_000;
    await act(() => foreground?.("active"));
    expect(result.current).toBe(181_000);
    await unmount();
    expect(remove).toHaveBeenCalledTimes(1);
    expect(interval).toHaveBeenCalledWith(expect.any(Function), 60_000);
    expect(clear).toHaveBeenCalledWith(interval.mock.results[0].value);
    interval.mockRestore();
    clear.mockRestore();
    listener.mockRestore();
    jest.useRealTimers();
});
