import {act, renderHook} from "@testing-library/react-native";
import {useLayoutEffect} from "react";
import {Appearance, AppState, type AppStateStatus} from "react-native";
import * as SystemUI from "expo-system-ui";

import {resolveAppearance} from "@/constants/colors";
import {useNativeAppearance} from "@/hooks/useNativeAppearance";
import {notify} from "@/components/XbrwToast";
import {Providers} from "@/test-utils/render";
import {THEME_IDS, type ThemeId} from "@/library/appearance";

jest.mock("expo-system-ui", () => ({setBackgroundColorAsync: jest.fn(async () => {})}));
jest.mock("@/components/XbrwToast", () => ({notify: jest.fn()}));

const appearance = (theme: ThemeId) => resolveAppearance({theme, recipeColours: "themed"});
const background = jest.mocked(SystemUI.setBackgroundColorAsync);
let resume: (state: AppStateStatus) => void;
const remove = jest.fn();

function deferred() {
    let resolve!: () => void;
    let reject!: (error: Error) => void;
    const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
    return {promise, resolve, reject};
}

beforeEach(() => {
    jest.clearAllMocks();
    background.mockReset().mockResolvedValue(undefined);
    jest.spyOn(Appearance, "setColorScheme").mockImplementation(() => {});
    jest.spyOn(AppState, "addEventListener").mockImplementation((event, listener) => {
        expect(event).toBe("change");
        resume = listener;
        return {remove};
    });
});

afterEach(() => jest.restoreAllMocks());

it.each(THEME_IDS)("applies the explicit %s preset, independent of the OS scheme", async theme => {
    jest.spyOn(Appearance, "getColorScheme").mockReturnValue(theme === "light" ? "dark" : "light");
    await renderHook(() => useNativeAppearance(appearance(theme)), {wrapper: Providers});
    expect(Appearance.setColorScheme).toHaveBeenLastCalledWith(theme === "light" ? "light" : "dark");
    expect(background).toHaveBeenLastCalledWith(appearance(theme).palette.base);
});

it("sets the explicit scheme synchronously before the next layout effect", async () => {
    await renderHook(() => {
        useNativeAppearance(appearance("light"));
        useLayoutEffect(() => {
            expect(Appearance.setColorScheme).toHaveBeenCalledWith("light");
        }, []);
    }, {wrapper: Providers});
});

it("serializes deferred writes through rapid changes and resumes with the latest background", async () => {
    const first = deferred();
    const latest = deferred();
    const completed: string[] = [];
    background
        .mockImplementationOnce(() => first.promise.then(() => { completed.push("light"); }))
        .mockImplementationOnce(() => latest.promise.then(() => { completed.push("magenta"); }));
    const {rerender} = await renderHook(({theme}: {theme: ThemeId}) => useNativeAppearance(appearance(theme)), {
        initialProps: {theme: "light"}, wrapper: Providers
    });
    await rerender({theme: "blue"});
    await rerender({theme: "magenta"});
    expect(background).toHaveBeenCalledTimes(1);
    expect(completed).toEqual([]);
    await act(async () => first.resolve());
    expect(background).toHaveBeenCalledTimes(2);
    expect(background).toHaveBeenLastCalledWith(appearance("magenta").palette.base);
    expect(completed).toEqual(["light"]);
    await act(async () => latest.resolve());
    expect(completed).toEqual(["light", "magenta"]);
    await act(async () => resume("background"));
    const count = background.mock.calls.length;
    await act(async () => resume("active"));
    expect(background).toHaveBeenCalledTimes(count + 1);
    expect(background).toHaveBeenLastCalledWith(appearance("magenta").palette.base);
    expect(Appearance.setColorScheme).toHaveBeenLastCalledWith("dark");
    expect(notify).not.toHaveBeenCalled();
});

it("does not poison the queue when an older write fails", async () => {
    const first = deferred();
    background.mockImplementationOnce(() => first.promise);
    const {rerender} = await renderHook(({theme}: {theme: ThemeId}) => useNativeAppearance(appearance(theme)), {
        initialProps: {theme: "light"}, wrapper: Providers
    });
    await rerender({theme: "blue"});
    await act(async () => first.reject(new Error("native refused")));
    expect(background).toHaveBeenLastCalledWith(appearance("blue").palette.base);
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({tone: "error"}));
});

it("reports scheme and background failures explicitly and retries on resume", async () => {
    jest.mocked(Appearance.setColorScheme).mockImplementationOnce(() => { throw new Error("scheme"); });
    background.mockRejectedValueOnce(new Error("background"));
    await renderHook(() => useNativeAppearance(appearance("light")), {wrapper: Providers});
    expect(notify).toHaveBeenCalledTimes(2);
    expect(jest.mocked(notify).mock.calls.every(([notice]) => notice.tone === "error")).toBe(true);
    await act(async () => resume("active"));
    expect(background).toHaveBeenCalledTimes(2);
    expect(Appearance.setColorScheme).toHaveBeenLastCalledWith("light");
});

it("reports a synchronous background failure without poisoning the next write", async () => {
    background.mockImplementationOnce(() => { throw new Error("synchronous native failure"); });
    const {rerender} = await renderHook(({theme}: {theme: ThemeId}) => useNativeAppearance(appearance(theme)), {
        initialProps: {theme: "light"}, wrapper: Providers
    });
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({tone: "error"}));
    await rerender({theme: "blue"});
    expect(background).toHaveBeenLastCalledWith(appearance("blue").palette.base);
    expect(notify).toHaveBeenCalledTimes(1);
});

it("removes the subscription and drops queued work and late notices after unmount", async () => {
    const first = deferred();
    background.mockImplementationOnce(() => first.promise);
    const {rerender, unmount} = await renderHook(({theme}: {theme: ThemeId}) => useNativeAppearance(appearance(theme)), {
        initialProps: {theme: "light"}, wrapper: Providers
    });
    await rerender({theme: "blue"});
    await unmount();
    await act(async () => first.reject(new Error("late failure")));
    expect(remove).toHaveBeenCalledTimes(2);
    expect(background).toHaveBeenCalledTimes(1);
    expect(notify).not.toHaveBeenCalled();
});
