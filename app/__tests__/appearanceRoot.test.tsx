import React, {useState} from "react";
import {Appearance, Platform, Text, Text as MockText, TextInput, View} from "react-native";
import {act, fireEvent, screen} from "@testing-library/react-native";
import {useFonts} from "expo-font";
import {SplashScreen} from "expo-router";
import * as SystemUI from "expo-system-ui";

import RootLayout from "@/app/_layout";
import {resolveAppearance} from "@/constants/colors";
import {useAppearance} from "@/hooks/useAppearance";
import {useLiveBrew} from "@/hooks/useLiveBrew";
import {Settings} from "@/library/Settings";
import Recipe from "@/library/Recipe";
import {renderWithProviders} from "@/test-utils/render";
import {THEME_IDS} from "@/library/appearance";

const mockMount = jest.fn();
const mockUnmount = jest.fn();
const mockBrew = jest.fn(async () => {});
let mockNavigationTheme: {dark: boolean; colors: Record<string, string>; fonts: unknown};
let mockSettings: Settings;

jest.mock("expo-font", () => ({...jest.requireActual("expo-font"), useFonts: jest.fn(() => [true])}));
jest.mock("expo-system-ui", () => ({setBackgroundColorAsync: jest.fn(async () => {})}));
jest.mock("expo-navigation-bar", () => ({
    NavigationBar: ({style}: {style: string}) => <MockText testID="native-navigation">{style}</MockText>
}));
jest.mock("expo-status-bar", () => ({
    StatusBar: ({style, hidden}: {style: string; hidden: boolean}) =>
        <MockText testID="native-status">{`${style}/${hidden}`}</MockText>
}));
jest.mock("expo-router", () => {
    const base = {
        colors: {primary: "base", background: "base", card: "base", text: "base", border: "base", notification: "base"},
        fonts: {regular: {fontFamily: "navigation-font", fontWeight: "400"}}
    };
    const Stack = () => <MockProbe/>;
    Stack.Screen = function MockScreen() { return null; };
    return {
        DarkTheme: {...base, dark: true}, DefaultTheme: {...base, dark: false},
        SplashScreen: {preventAutoHideAsync: jest.fn(), hideAsync: jest.fn()},
        Stack,
        ThemeProvider: ({children, value}: {children: React.ReactNode; value: typeof mockNavigationTheme}) => {
            mockNavigationTheme = value;
            return children;
        }
    };
});
jest.mock("expo-share-intent", () => ({ShareIntentProvider: ({children}: {children: React.ReactNode}) => children}));
jest.mock("@backpackapp-io/react-native-toast", () => ({Toasts: () => <MockProbe id="toast"/>}));
jest.mock("@/components/XbrwToast", () => ({notify: jest.fn()}));
jest.mock("@/components/LiveBrewBar", () => () => null);
jest.mock("@/components/RouteWatcher", () => () => null);
jest.mock("@/components/SplashOverlay", () => () => null);
jest.mock("@/hooks/useMachine", () => ({startMachineLink: jest.fn()}));
jest.mock("@/hooks/useRoasterForegroundSync", () => ({useRoasterForegroundSync: jest.fn()}));
jest.mock("@/hooks/useBrewHistory", () => ({sharedBrewDatabase: jest.fn(), sweepOnLaunch: jest.fn()}));
jest.mock("@/hooks/useSetting", () => ({
    useSetting: (key: string) => jest.requireActual("@/hooks/useSetting").useSetting(key, mockSettings)
}));
jest.mock("@/hooks/useBrewRun", () => ({
    useBrewRun: () => {
        jest.requireActual<typeof import("react")>("react").useEffect(() => { mockMount(); return mockUnmount; }, []);
        return {phase: {name: "pouring"}, brew: mockBrew};
    }
}));

function MockProbe({id = "route"}: {id?: string}) {
    const {choice, palette} = useAppearance();
    const live = useLiveBrew();
    const [draft, setDraft] = useState("");
    return <View testID={id} style={{backgroundColor: palette.base}}>
        <Text>{`${id}:${choice.theme}/${choice.recipeColours}`}</Text>
        {id === "route" && <>
            <TextInput accessibilityLabel="editor draft" value={draft} onChangeText={setDraft}/>
            <Text accessibilityRole="button" onPress={() => live.start(new Recipe())}>start brew</Text>
            <Text testID="run">{live.run ? "running" : "idle"}</Text>
        </>}
    </View>;
}

beforeEach(() => {
    jest.clearAllMocks();
    const values = new Map<string, string>();
    mockSettings = new Settings({
        read: key => values.get(key) ?? null,
        write: (key, value) => { values.set(key, value); }
    });
    jest.spyOn(Appearance, "setColorScheme").mockImplementation(() => {});
    jest.mocked(useFonts).mockReturnValue([true, null]);
});
afterEach(() => jest.restoreAllMocks());

it("mounts persisted Light on OS dark and preserves the real run owner and editor across every preset", async () => {
    jest.spyOn(Appearance, "getColorScheme").mockReturnValue("dark");
    mockSettings.set("appearanceTheme", "light");
    await renderWithProviders(<RootLayout/>);
    expect(screen.getByText("route:light/original")).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText("editor draft"), "unsaved draft");
    await fireEvent.press(screen.getByText("start brew"));
    for (const theme of THEME_IDS) {
        jest.mocked(Appearance.getColorScheme).mockReturnValue(theme === "light" ? "dark" : "light");
        await act(async () => mockSettings.set("appearanceTheme", theme));
        const {palette, scheme} = resolveAppearance({theme, recipeColours: "original"});
        expect(mockNavigationTheme.dark).toBe(scheme === "dark");
        expect(mockNavigationTheme.colors).toEqual({
            background: palette.base, card: palette.base, text: palette.text,
            border: palette.line, primary: palette.text, notification: palette.danger
        });
        expect(mockNavigationTheme.fonts).toEqual({regular: {fontFamily: "navigation-font", fontWeight: "400"}});
        expect(screen.getByTestId("route")).toHaveStyle({backgroundColor: palette.base});
        expect(screen.getByText(`toast:${theme}/original`)).toBeTruthy();
        expect(screen.getByTestId("native-status")).toHaveTextContent(`${scheme === "light" ? "dark" : "light"}/false`);
        expect(Appearance.setColorScheme).toHaveBeenLastCalledWith(scheme);
        expect(SystemUI.setBackgroundColorAsync).toHaveBeenLastCalledWith(palette.base);
        expect(screen.getByDisplayValue("unsaved draft")).toBeTruthy();
        expect(screen.getByTestId("run")).toHaveTextContent("running");
    }
    expect(screen.queryByTestId("native-navigation") !== null).toBe(Platform.OS === "android");
    if (Platform.OS === "android") expect(screen.getByTestId("native-navigation")).toHaveTextContent("auto");
    expect(mockMount).toHaveBeenCalledTimes(1);
    expect(mockUnmount).not.toHaveBeenCalled();
    expect(mockBrew).toHaveBeenCalledTimes(1);
});

it("keeps the OS splash until fonts and the application frame are ready", async () => {
    jest.mocked(useFonts).mockReturnValue([false, null]);
    const {rerender} = await renderWithProviders(<RootLayout/>);
    expect(screen.queryByTestId("route")).toBeNull();
    expect(SplashScreen.hideAsync).not.toHaveBeenCalled();
    jest.mocked(useFonts).mockReturnValue([true, null]);
    await rerender(<RootLayout/>);
    expect(screen.getByTestId("route")).toBeTruthy();
    expect(SplashScreen.hideAsync).toHaveBeenCalledTimes(1);
});
