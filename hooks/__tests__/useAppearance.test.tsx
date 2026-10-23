import React, {useEffect, useState} from "react";
import {Text, TextInput} from "react-native";
import {act, fireEvent, renderHook, screen} from "@testing-library/react-native";

import {AppearanceProvider, AppearanceScope, useAppearance} from "@/hooks/useAppearance";
import {DEFAULT_APPEARANCE, type AppearanceChoice} from "@/library/appearance";
import {Settings, type SettingsStorage} from "@/library/Settings";
import {Providers, renderWithProviders} from "@/test-utils/render";
import {appDatabase} from "@/library/appDatabase";

jest.mock("@/library/appDatabase", () => ({
    appDatabase: jest.fn(() => { throw new Error("production database opened"); })
}));

function store(theme = "light", mode = "themed") {
    const values = new Map([
        ["appearanceTheme", JSON.stringify(theme)],
        ["recipeColourMode", JSON.stringify(mode)]
    ]);
    const storage: SettingsStorage = {
        read: key => values.get(key) ?? null,
        write: (key, value) => { values.set(key, value); }
    };
    return {settings: new Settings(storage), storage, values};
}

function Reader({id = "choice", onRead}: {
    id?: string;
    onRead?: (choice: AppearanceChoice) => void;
}) {
    const {choice} = useAppearance();
    onRead?.(choice);
    return <Text testID={id}>{`${choice.theme}/${choice.recipeColours}`}</Text>;
}

const invalidNotice = {
    tone: "error",
    message: "Some appearance preferences could not be read. Default choices are shown."
};

describe("AppearanceProvider", () => {
    it("uses persisted Light/Themed on the very first child render", async () => {
        const {settings} = store();
        const first = jest.fn();
        const invalid = jest.fn();
        await renderWithProviders(
            <AppearanceProvider settings={settings} onInvalidPreferences={invalid}>
                <Reader onRead={first}/>
            </AppearanceProvider>
        );
        expect(first.mock.calls[0][0]).toEqual({theme: "light", recipeColours: "themed"});
        expect(invalid).not.toHaveBeenCalled();
    });

    it("propagates independent preferences to every reader and retains persisted choices on failure", async () => {
        const {settings, storage} = store();
        await renderWithProviders(
            <AppearanceProvider settings={settings} onInvalidPreferences={jest.fn()}>
                <Reader id="one"/><Reader id="two"/>
            </AppearanceProvider>
        );
        await act(async () => settings.set("appearanceTheme", "blue"));
        expect(screen.getByTestId("one")).toHaveTextContent("blue/themed");
        expect(screen.getByTestId("two")).toHaveTextContent("blue/themed");
        await act(async () => settings.set("recipeColourMode", "original"));
        expect(screen.getByTestId("one")).toHaveTextContent("blue/original");
        expect(screen.getByTestId("two")).toHaveTextContent("blue/original");
        const write = storage.write;
        storage.write = (key, value) => {
            if (key === "appearanceTheme") throw new Error("storage unavailable");
            write(key, value);
        };
        await act(async () => {
            expect(() => settings.set("appearanceTheme", "magenta")).toThrow("storage unavailable");
        });
        expect(screen.getByTestId("one")).toHaveTextContent("blue/original");
        expect(screen.getByTestId("two")).toHaveTextContent("blue/original");
        expect(new Settings(storage).get("appearanceTheme")).toBe("blue");
    });

    it.each([
        ["unknown-theme", "themed", "original/themed"],
        ["light", "unknown-mode", "light/original"],
        ["unknown-theme", "unknown-mode", "original/original"]
    ])("reports invalid initial enums %s/%s once without rewriting storage", async (theme, mode, expected) => {
        const {settings, storage, values} = store(theme, mode);
        const write = jest.spyOn(storage, "write");
        const invalid = jest.fn();
        await renderWithProviders(
            <AppearanceProvider settings={settings} onInvalidPreferences={invalid}>
                <Reader/>
            </AppearanceProvider>
        );
        expect(screen.getByTestId("choice")).toHaveTextContent(expected);
        expect(invalid).toHaveBeenCalledTimes(1);
        expect(invalid).toHaveBeenCalledWith(invalidNotice);
        await act(async () => settings.set("showHints", true));
        expect(invalid).toHaveBeenCalledTimes(1);
        expect(values.get("appearanceTheme")).toBe(JSON.stringify(theme));
        expect(values.get("recipeColourMode")).toBe(JSON.stringify(mode));
        expect(write.mock.calls).toEqual([["showHints", "true"]]);
    });

    it("deduplicates raw values and invalid key sets until valid recovery", async () => {
        const {settings, storage} = store();
        const invalid = jest.fn();
        await renderWithProviders(
            <AppearanceProvider settings={settings} onInvalidPreferences={invalid}>
                <Reader/>
            </AppearanceProvider>
        );
        await act(async () => settings.set("appearanceTheme", "bad-a"));
        expect(screen.getByTestId("choice")).toHaveTextContent("original/themed");
        expect(invalid).toHaveBeenCalledTimes(1);
        await act(async () => settings.set("appearanceTheme", "bad-a"));
        expect(invalid).toHaveBeenCalledTimes(1);
        await act(async () => settings.set("appearanceTheme", "bad-b"));
        expect(invalid).toHaveBeenCalledTimes(2);
        await act(async () => settings.set("appearanceTheme", "bad-a"));
        expect(invalid).toHaveBeenCalledTimes(2);
        await act(async () => settings.set("recipeColourMode", "bad-mode"));
        expect(screen.getByTestId("choice")).toHaveTextContent("original/original");
        expect(invalid).toHaveBeenCalledTimes(3);
        await act(async () => settings.set("appearanceTheme", "light"));
        expect(screen.getByTestId("choice")).toHaveTextContent("light/original");
        expect(invalid).toHaveBeenCalledTimes(4);
        await act(async () => settings.set("recipeColourMode", "themed"));
        expect(screen.getByTestId("choice")).toHaveTextContent("light/themed");
        const write = jest.spyOn(storage, "write");
        await act(async () => settings.set("appearanceTheme", "bad-a"));
        expect(invalid).toHaveBeenCalledTimes(5);
        expect(invalid).toHaveBeenLastCalledWith(invalidNotice);
        expect(write.mock.calls).toEqual([["appearanceTheme", '"bad-a"']]);
    });
});

describe("AppearanceScope", () => {
    it("uses the default pure test scope without opening the production database", async () => {
        const {result} = await renderHook(useAppearance, {wrapper: Providers});
        expect(result.current.choice).toEqual(DEFAULT_APPEARANCE);
        expect(appDatabase).not.toHaveBeenCalled();
    });

    it("accepts a read-only appearance in the shared test providers", async () => {
        const choice = Object.freeze({theme: "light", recipeColours: "themed"} as const);
        await renderWithProviders(
            <Providers appearance={choice}><Reader/></Providers>
        );
        expect(screen.getByTestId("choice")).toHaveTextContent("light/themed");
        expect(appDatabase).not.toHaveBeenCalled();
    });

    it("throws explicitly without a scope", async () => {
        const error = jest.spyOn(console, "error").mockImplementation(() => {});
        try {
            await expect(renderHook(useAppearance)).rejects.toThrow("AppearanceScope is missing");
        } finally {
            error.mockRestore();
        }
    });

    it("uses the nearest scope and does not mutate read-only choices", async () => {
        const choice = Object.freeze({theme: "light", recipeColours: "themed"} as const);
        await renderWithProviders(
            <>
                <Reader id="outer"/>
                <AppearanceScope choice={choice}><Reader id="inner"/></AppearanceScope>
            </>
        );
        expect(screen.getByTestId("outer")).toHaveTextContent("original/original");
        expect(screen.getByTestId("inner")).toHaveTextContent("light/themed");
        expect(choice).toEqual({theme: "light", recipeColours: "themed"});
        expect(appDatabase).not.toHaveBeenCalled();
    });

    it("preserves child identity and local input across scheme and mode changes", async () => {
        const mounted = jest.fn();
        const unmounted = jest.fn();
        function Input() {
            const [text, setText] = useState("");
            useEffect(() => {
                mounted();
                return unmounted;
            }, []);
            return <><Reader/><TextInput accessibilityLabel="local input" value={text} onChangeText={setText}/></>;
        }
        const tree = (choice: AppearanceChoice) =>
            <AppearanceScope choice={choice}><Input/></AppearanceScope>;
        const {rerender} = await renderWithProviders(tree(DEFAULT_APPEARANCE));
        await fireEvent.changeText(screen.getByLabelText("local input"), "keep me");
        await rerender(tree(Object.freeze({theme: "light", recipeColours: "themed"})));
        expect(screen.getByTestId("choice")).toHaveTextContent("light/themed");
        expect(screen.getByDisplayValue("keep me")).toBeTruthy();
        await rerender(tree({theme: "magenta", recipeColours: "original"}));
        expect(screen.getByDisplayValue("keep me")).toBeTruthy();
        expect(mounted).toHaveBeenCalledTimes(1);
        expect(unmounted).not.toHaveBeenCalled();
    });
});
