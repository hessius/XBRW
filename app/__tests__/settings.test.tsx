import * as Application from "expo-application";
import React from "react";
import {StyleSheet} from "react-native";
import {SafeAreaProvider} from "react-native-safe-area-context";
import {screen, fireEvent, act, within, waitFor} from "@testing-library/react-native";
import type {ReactTestRendererJSON} from "react-test-renderer";

import SettingsScreen from "@/app/settings";
import {AppearanceProvider} from "@/hooks/useAppearance";
import {createTestDatabase} from "@/test-utils/sqlite";
import * as databaseModule from "@/library/appDatabase";
import {SUPPORT_TITLE} from "@/components/SupportTile";
import {palette} from "@/constants/colors";
import Recipe from "@/library/Recipe";
import {feedKey, serialiseFeedOptOut} from "@/library/roasterFeed";
import {serialiseSubscriptions} from "@/library/roasterSubscription";
import {buildBackup, parseBackup} from "@/library/backup";
import CoffeeBagDatabase from "@/library/CoffeeBagDatabase";
import {BagAttributionError} from "@/library/BrewDatabase";
import {bagFixture} from "@/test-utils/bags";
import type {BagInventoryBackup} from "@/library/bagBackup";
import {brew} from "@/library/brew/handoff/__tests__/fixtures";
import {DEFAULTS, NOT_IN_BACKUP, Settings, SqliteSettingsStorage, type SettingKey, type SettingsStorage} from "@/library/Settings";
import {
    renderWithProviders, SHEET_PRESS_TIMEOUT, THREE_BUTTON_METRICS
} from "@/test-utils/render";

/**
 * The rendered text of a `toJSON()` tree, in document order.
 *
 * Order across sibling elements is not something `getByText`/`getByRole` can
 * compare directly — each finds one node, not a position — so a test that
 * cares which section comes first has to walk the tree itself.
 */
function renderOrder(node: ReactTestRendererJSON | ReactTestRendererJSON[] | string | null): string[] {
    if (node === null) return [];
    if (typeof node === "string") return [node];
    if (Array.isArray(node)) return node.flatMap(renderOrder);
    return renderOrder(node.children as ReactTestRendererJSON[] | null ?? []);
}

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
    ...jest.requireActual("expo-router"),
    useRouter:      () => ({push: mockPush}),
    // Fired once on mount, which is what `useCloudSession` reads the stored
    // session in. The real one also fires on every return to this screen.
    useFocusEffect: (cb: () => void | (() => void)) => {
        const {useEffect} = jest.requireActual("react");
        useEffect(cb, [cb]);
    }
}));

const mockLoadSession = jest.fn(async () => null as unknown);
const mockSignOut = jest.fn(async () => {});
jest.mock("@/library/cloud/session", () => ({
    loadSession: () => mockLoadSession(),
    signOut:     () => mockSignOut()
}));

const mockExportBackup = jest.fn();
const mockPickBackup = jest.fn();
jest.mock("@/hooks/useBackup", () => ({
    useBackup: () => ({
        exportBackup: (...args: unknown[]) => mockExportBackup(...args),
        pickBackup: (...args: unknown[]) => mockPickBackup(...args)
    })
}));

// notify lives in components/XbrwToast, not library/notify — the toast body
// and its dispatcher share that module, and that is what every other screen
// in this app imports it from.
const mockNotify = jest.fn();
jest.mock("@/components/XbrwToast", () => ({
    ...jest.requireActual("@/components/XbrwToast"),
    notify: (...args: unknown[]) => mockNotify(...args)
}));

// useRecipeLibrary's default store is a real RecipeDatabase, which opens
// expo-sqlite — a native module with no working implementation under Jest.
// The screen delegates every whole-library change to this hook, so the mock is
// the seam the screen is tested through: `mockLibraryRecipes` drives the count
// the delete sheet and the merge preview read, and `mockApplyRestore` /
// `mockDeleteAll` observe what the screen asks the library to do.
let mockLibraryRecipes: Recipe[] = [];
let mockUnreadableCount = 0;
let mockAllRecipesThrows = false;
// Callables, not a value: the count parses every blob, so the library exposes
// it as something Settings asks for once rather than a figure every consumer
// pays for at render (#124).
const mockCountUnreadable = jest.fn(() => mockUnreadableCount);
const mockDeleteUnreadable = jest.fn(() => 0);
const mockRefresh = jest.fn();
const mockDeleteAll = jest.fn();
const mockApplyRestore = jest.fn();
// The brew history lives in SQLite, which this environment has no native
// module for. Mocked as a store rather than stubbed away, so the two questions
// the screen asks it -- what to back up, and what a restore added -- can both
// be asserted.
const mockBrewStore = {
    all: jest.fn(() => [] as unknown[]),
    restore: jest.fn(() => 0)
};

jest.mock("@/hooks/useBrewHistory", () => ({
    sharedBrewDatabase: () => mockBrewStore
}));

jest.mock("@/hooks/useRecipeLibrary", () => ({
    useRecipeLibrary: () => ({
        recipes:         mockLibraryRecipes,
        countUnreadable: mockCountUnreadable,
        deleteUnreadable: mockDeleteUnreadable,
        allRecipes:      () => {
            if (mockAllRecipesThrows) throw new Error("one recipe could not be read");
            return mockLibraryRecipes;
        },
        refresh:         mockRefresh,
        deleteRecipe:    jest.fn(),
        duplicateRecipe: jest.fn(),
        deleteAll:       mockDeleteAll,
        applyRestore:    mockApplyRestore
    })
}));

// The machine section (added by the BLE brew work) pulls in `useMachine`, which
// transitively imports the BLE transport — a native module that throws at load
// under Jest. This screen only needs the section to render in its unpaired
// state, so the hook is stubbed here the same way the library and backup hooks
// above are, keeping the settings screen off the radio entirely.
jest.mock("@/hooks/useMachine", () => {
    const link = {
        machine:    {info: null},
        status:     "disconnected",
        error:      null,
        remembered: "",
        connect:    jest.fn(),
        forget:     jest.fn(),
        forgetMachine: jest.fn(async () => true),
        changeBlocker: null,
        machines:   []
    };
    return {__esModule: true, default: () => link, useMachine: () => link};
});

function recipeNamed(name: string, uuid: string): Recipe {
    const recipe = new Recipe();
    recipe.name = name;
    recipe.uuid = uuid;
    return recipe;
}

function backupOf(
    recipes: Recipe[], settings: Record<string, unknown> = {}, brews: unknown[] = [],
    skippedBrews = 0
) {
    return {
        cancelled: false,
        result: {
            ok: true,
            payload: {
                recipes,
                brews,
                settings,
                skipped: 0,
                skippedBrews,
                skippedBags: 0, skippedBagRows: 0, bagWarnings: [],
                appVersion: "2.6.0",
                exportedAt: "2026-08-26T21:00:00.000Z"
            }
        }
    };
}

/**
 * A store with the xBloom account feature switched on.
 *
 * The account section is always drawn now. Kept as a named helper rather than
 * inlined so the tests below still say out loud which ones are about it.
 */
function accountOn(): Settings {
    return new Settings(memoryStorage());
}

function memoryStorage(): SettingsStorage {
    const values = new Map<string, string>();
    return {
        read:  (key) => values.get(key) ?? null,
        write: (key, value) => {
            values.set(key, value);
        }
    };
}

/**
 * Let a just-opened sheet finish arriving before it is touched.
 *
 * `XbrwSheet` slides in on the frame after it mounts (a `requestAnimationFrame`
 * that flips it from closed to shown), and a press dispatched into that gap is
 * dropped. Waiting a frame makes the interaction deterministic rather than a
 * race the test wins most of the time.
 */
async function settleSheet(): Promise<void> {
    await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 60));
    });
}

describe("SettingsScreen", () => {
    function sqlSettings() {
        const db = createTestDatabase();
        jest.spyOn(databaseModule, "appDatabase").mockReturnValue(
            db as unknown as ReturnType<typeof databaseModule.appDatabase>);
        return {db, settings: new Settings(new SqliteSettingsStorage())};
    }

    async function renderAppearanceSettings(settings: Settings) {
        return renderWithProviders(
            <AppearanceProvider settings={settings} onInvalidPreferences={mockNotify}>
                <SettingsScreen settings={settings}/>
            </AppearanceProvider>);
    }

    async function openAppearance() {
        expect(screen.getAllByRole("button", {name: /^Appearance,/})).toHaveLength(1);
        await fireEvent.press(screen.getByRole("button", {name: /^Appearance,/}));
        await waitFor(() => expect(screen.getByRole("radio", {name: "Offline Blue"})).toBeTruthy());
    }

    async function pressRadio(name: string, selected: () => void) {
        await waitFor(async () => {
            await fireEvent.press(screen.getByRole("radio", {name}));
            selected();
        }, {timeout: SHEET_PRESS_TIMEOUT});
    }

    it("persists the opt-in solid label switch in Appearance and retains it after reopening", async () => {
        const {settings, db} = sqlSettings();
        await renderAppearanceSettings(settings);
        await openAppearance();
        expect(screen.getByRole("switch", {name: "Solid button labels"})).not.toBeChecked();
        await waitFor(async () => {
            await fireEvent.press(screen.getByRole("switch", {name: "Solid button labels"}));
            expect(settings.get("solidControlLabels")).toBe(true);
        }, {timeout: SHEET_PRESS_TIMEOUT});
        expect(db.getFirstSync("SELECT value FROM settings WHERE key = ?", ["solidControlLabels"]))
            .toEqual({value: "true"});
        await fireEvent.press(screen.getByRole("button", {name: "Close"}));
        await openAppearance();
        expect(screen.getByRole("switch", {name: "Solid button labels"})).toBeChecked();
        await waitFor(async () => {
            await fireEvent.press(screen.getByRole("switch", {name: "Solid button labels"}));
            expect(settings.get("solidControlLabels")).toBe(false);
        }, {timeout: SHEET_PRESS_TIMEOUT});
        expect(new Settings(new SqliteSettingsStorage()).get("solidControlLabels")).toBe(false);
    });

    it("reports a failed label preference write and keeps the previous choice", async () => {
        const {settings, db} = sqlSettings();
        settings.set("solidControlLabels", false);
        db.execSync(`CREATE TRIGGER reject_labels BEFORE UPDATE ON settings
            WHEN NEW.key = 'solidControlLabels'
            BEGIN SELECT RAISE(FAIL, 'disk full'); END;`);
        await renderAppearanceSettings(settings);
        await openAppearance();
        await waitFor(async () => {
            await fireEvent.press(screen.getByRole("switch", {name: "Solid button labels"}));
            expect(mockNotify).toHaveBeenCalledWith({
                tone: "error", message: "Could not save button labels. Please try again."
            });
        }, {timeout: SHEET_PRESS_TIMEOUT});
        expect(screen.getByRole("switch", {name: "Solid button labels"})).not.toBeChecked();
        expect(new Settings(new SqliteSettingsStorage()).get("solidControlLabels")).toBe(false);
    });

    it.each([
        [{solidControlLabels: true}, true, false],
        [{solidControlLabels: false}, false, false],
        [{}, true, false],
        [{solidControlLabels: "true"}, true, true]
    ] as const)("restores solid labels from %j without resetting an absent or invalid preference", async (incoming, expected, warning) => {
        const {settings} = sqlSettings();
        settings.set("solidControlLabels", true);
        mockPickBackup.mockResolvedValue(backupOf([], incoming));
        mockApplyRestore.mockReturnValue({status: "restored", added: 0});
        await renderAppearanceSettings(settings);
        await fireEvent.press(screen.getByRole("button", {name: /^Restore from a backup,/}));
        await settleSheet();
        await fireEvent(screen.getByLabelText(/settings from this backup/i), "checkedChange", true);
        await waitFor(async () => {
            await fireEvent.press(screen.getByRole("button", {name: "Take the settings"}));
            expect(mockApplyRestore).toHaveBeenCalled();
        }, {timeout: SHEET_PRESS_TIMEOUT});
        expect(new Settings(new SqliteSettingsStorage()).get("solidControlLabels")).toBe(expected);
        const notice = {tone: "error", message: "Some appearance preferences were not restored."};
        if (warning) expect(mockNotify).toHaveBeenCalledWith(notice);
        else expect(mockNotify).not.toHaveBeenCalledWith(notice);
    });

    it("immediately persists independent appearance choices without Apply, retaining them after close", async () => {
        const {settings, db} = sqlSettings();
        await renderAppearanceSettings(settings);
        await openAppearance();
        expect(screen.queryByRole("button", {name: /apply/i})).toBeNull();
        expect(screen.getByTestId("settings-screen", {includeHiddenElements: true})).toHaveProp("accessibilityElementsHidden", true);
        expect(screen.getByTestId("settings-screen", {includeHiddenElements: true})).toHaveProp("importantForAccessibility", "no-hide-descendants");
        await pressRadio("Themed", () =>
            expect(screen.getByRole("radio", {name: "Themed"})).toBeChecked());
        // Original Dark deliberately has the same visuals in either recipe mode.
        expect(settings.get("appearanceTheme")).toBe("original");
        await pressRadio("Light", () =>
            expect(screen.getByRole("radio", {name: "Light"})).toBeChecked());
        expect(db.getFirstSync("SELECT value FROM settings WHERE key = ?", ["appearanceTheme"]))
            .toEqual({value: '"light"'});
        expect(db.getFirstSync("SELECT value FROM settings WHERE key = ?", ["recipeColourMode"]))
            .toEqual({value: '"themed"'});
        await fireEvent.press(screen.getByRole("button", {name: "Close"}));
        await openAppearance();
        expect(screen.getByRole("radio", {name: "Light"})).toBeChecked();
        expect(screen.getByRole("radio", {name: "Themed"})).toBeChecked();
    });

    it("keeps the last persisted selection and explicitly reports either failed appearance write", async () => {
        const {settings, db} = sqlSettings();
        settings.set("appearanceTheme", "blue");
        settings.set("recipeColourMode", "themed");
        db.execSync(`CREATE TRIGGER reject_appearance BEFORE UPDATE ON settings
            WHEN NEW.key IN ('appearanceTheme', 'recipeColourMode')
            BEGIN SELECT RAISE(FAIL, 'disk full'); END;`);
        await renderAppearanceSettings(settings);
        await openAppearance();
        await pressRadio("Light", () => expect(mockNotify).toHaveBeenCalledWith({
            tone: "error", message: "Could not save this appearance. Please try again."
        }));
        await pressRadio("Original", () => expect(mockNotify).toHaveBeenCalledWith({
            tone: "error", message: "Could not save recipe colours. Please try again."
        }));
        expect(screen.getByRole("radio", {name: "Offline Blue"})).toBeChecked();
        expect(screen.getByRole("radio", {name: "Themed"})).toBeChecked();
        expect(new Settings(new SqliteSettingsStorage()).get("appearanceTheme")).toBe("blue");
        expect(new Settings(new SqliteSettingsStorage()).get("recipeColourMode")).toBe("themed");
    });

    it("shows validated fallbacks in the sheet rather than selecting unknown stored enum strings", async () => {
        const {settings, db} = sqlSettings();
        db.runSync("INSERT INTO settings (key, value) VALUES (?, ?)", ["appearanceTheme", '"future"']);
        db.runSync("INSERT INTO settings (key, value) VALUES (?, ?)", ["recipeColourMode", '"future"']);
        await renderAppearanceSettings(settings);
        await openAppearance();
        expect(screen.getByRole("radio", {name: "Original Dark"})).toBeChecked();
        expect(screen.getByRole("radio", {name: "Original"})).toBeChecked();
        expect(screen.getAllByRole("radio", {checked: true})).toHaveLength(2);
    });

    it.each([
        [{appearanceTheme: "light", recipeColourMode: "themed"}, "light", "themed", false],
        [{}, "blue", "original", false],
        [{appearanceTheme: 9, recipeColourMode: "themed"}, "blue", "themed", true],
        [{appearanceTheme: "magenta", recipeColourMode: false}, "magenta", "original", true],
        [{appearanceTheme: "future", recipeColourMode: "themed"}, "blue", "themed", true],
        [{appearanceTheme: "light", recipeColourMode: "future"}, "light", "original", true],
        [{appearanceTheme: "future", recipeColourMode: "future"}, "blue", "original", true]
    ] as const)("restores appearance preferences independently from %j using real SQL", async (incoming, theme, mode, warning) => {
        const {settings} = sqlSettings();
        settings.set("appearanceTheme", "blue");
        mockPickBackup.mockResolvedValue(backupOf([], incoming));
        mockApplyRestore.mockReturnValue({status: "restored", added: 0});
        await renderAppearanceSettings(settings);
        await fireEvent.press(screen.getByRole("button", {name: /^Restore from a backup,/}));
        await settleSheet();
        await fireEvent(screen.getByLabelText(/settings from this backup/i), "checkedChange", true);
        await waitFor(async () => {
            await fireEvent.press(screen.getByRole("button", {name: "Take the settings"}));
            expect(mockApplyRestore).toHaveBeenCalled();
        }, {timeout: SHEET_PRESS_TIMEOUT});
        const reopened = new Settings(new SqliteSettingsStorage());
        expect(reopened.get("appearanceTheme")).toBe(theme);
        expect(reopened.get("recipeColourMode")).toBe(mode);
        const notice = {tone: "error", message: "Some appearance preferences were not restored."};
        if (warning) expect(mockNotify).toHaveBeenCalledWith(notice);
        else expect(mockNotify).not.toHaveBeenCalledWith(notice);
    });

    it("reports rejected SQL during restore without claiming success", async () => {
        const {settings, db} = sqlSettings();
        settings.set("appearanceTheme", "blue");
        db.execSync(`CREATE TRIGGER reject_restore BEFORE UPDATE ON settings
            WHEN NEW.key = 'appearanceTheme' BEGIN SELECT RAISE(FAIL, 'disk full'); END;`);
        mockPickBackup.mockResolvedValue(backupOf([], {appearanceTheme: "light"}));
        mockApplyRestore.mockReturnValue({status: "restored", added: 0});
        await renderAppearanceSettings(settings);
        await fireEvent.press(screen.getByRole("button", {name: /^Restore from a backup,/}));
        await settleSheet();
        await fireEvent(screen.getByLabelText(/settings from this backup/i), "checkedChange", true);
        await waitFor(async () => {
            await fireEvent.press(screen.getByRole("button", {name: "Take the settings"}));
            expect(mockNotify).toHaveBeenCalledWith({
                tone: "error", message: "The restore could not be completed. Some settings could not be saved."
            });
        }, {timeout: SHEET_PRESS_TIMEOUT});
        expect(mockNotify).not.toHaveBeenCalledWith(expect.objectContaining({tone: "success"}));
        expect(new Settings(new SqliteSettingsStorage()).get("appearanceTheme")).toBe("blue");
    });

    it("keeps feed management reachable with no subscriptions", async () => {
        const settings = new Settings(memoryStorage());
        await renderWithProviders(<SettingsScreen settings={settings}/>);
        await fireEvent.press(screen.getByRole("button", {
            name: "Roaster feeds, Manage subscriptions and declined offers."
        }));
        expect(mockPush).toHaveBeenCalledWith("/subscriptions");
    });

    beforeEach(() => {
        jest.clearAllMocks();
        jest.spyOn(databaseModule, "appDatabase").mockReturnValue(
            createTestDatabase() as ReturnType<typeof databaseModule.appDatabase>);
        mockLibraryRecipes = [];
        mockUnreadableCount = 0;
        mockAllRecipesThrows = false;
        mockCountUnreadable.mockImplementation(() => mockUnreadableCount);
        mockDeleteUnreadable.mockImplementation(() => 0);
        // `clearAllMocks` forgets calls but keeps implementations, so a test
        // that made one of these reject would otherwise poison its successors.
        mockLoadSession.mockResolvedValue(null);
        mockSignOut.mockResolvedValue(undefined);
        mockBrewStore.all.mockReturnValue([]);
        mockBrewStore.restore.mockReturnValue(0);
    });

    afterEach(() => jest.restoreAllMocks());

    it("groups app brew preferences separately and preserves their settings", async () => {
        const settings = new Settings(memoryStorage());
        const rendered = await renderWithProviders(<SettingsScreen settings={settings}/>);
        const order = renderOrder(rendered.toJSON());
        const brewing = order.indexOf("BREWING");
        expect(brewing).toBeGreaterThan(order.indexOf("MACHINES"));
        for (const label of ["Start brewing automatically", "Animate the brew chart", "Ask how a brew was", "Brew detail storage"]) {
            expect(order.indexOf(label)).toBeGreaterThan(brewing);
            expect(order.indexOf(label)).toBeLessThan(order.indexOf("XBLOOM ACCOUNT"));
        }
        expect(screen.getAllByRole("switch", {name: "Start brewing automatically"})).toHaveLength(1);
        await fireEvent.press(screen.getByRole("switch", {name: "Start brewing automatically"}));
        expect(settings.get("machineAutoStart")).toBe(true);
        await fireEvent.press(screen.getByRole("switch", {name: "Animate the brew chart"}));
        expect(settings.get("animateBrewChart")).toBe(false);
        await fireEvent.press(screen.getByRole("switch", {name: "Ask how a brew was"}));
        expect(settings.get("askForRatings")).toBe(false);
        await fireEvent.press(screen.getByRole("radio", {name: "50 MB"}));
        expect(settings.get("brewTraceBudgetMB")).toBe(50);
    });

    it("lets the last settings scroll clear of a three-button navigation bar", async () => {
        // The screen is drawn under Android's 48 point navigation bar. With the
        // old fixed 48 point end, the storage control at the bottom could
        // scroll no further than the bar's top edge.
        await renderWithProviders(
            <SafeAreaProvider initialMetrics={THREE_BUTTON_METRICS}>
                <SettingsScreen settings={new Settings(memoryStorage())}/>
            </SafeAreaProvider>
        );
        const content = StyleSheet.flatten(
            screen.getByTestId("settings-scroll").props.contentContainerStyle
        );

        expect(content.paddingBottom).toBe(48 + 24);
    });

    it("keeps its designed scroll end on a gesture navigation bar", async () => {
        // A gesture bar is a thin strip with a handle on it, so the end the
        // screen was designed with already clears it. No extra gap.
        const gesture = {...THREE_BUTTON_METRICS, insets: {...THREE_BUTTON_METRICS.insets, bottom: 16}};
        await renderWithProviders(
            <SafeAreaProvider initialMetrics={gesture}>
                <SettingsScreen settings={new Settings(memoryStorage())}/>
            </SafeAreaProvider>
        );
        const content = StyleSheet.flatten(
            screen.getByTestId("settings-scroll").props.contentContainerStyle
        );

        expect(content.paddingBottom).toBe(48);
    });

    it("shows the coffee marker toggle in its stored state", async () => {
        const settings = new Settings(memoryStorage());
        settings.set("showCoffeeMarker", false);

        await renderWithProviders(<SettingsScreen settings={settings}/>);

        expect(screen.getByLabelText("Show the COFFEE marker").props.accessibilityState.checked)
            .toBe(false);
    });

    it("keeps coffee details on cards off by default and persists both choices", async () => {
        const storage = memoryStorage();
        const settings = new Settings(storage);
        await renderWithProviders(<SettingsScreen settings={settings}/>);
        const toggle = () => screen.getByLabelText("Coffee details on cards");
        expect(toggle().props.accessibilityState.checked).toBe(false);
        await fireEvent(toggle(), "checkedChange", true);
        expect(new Settings(storage).get("showRecipeCardDetails")).toBe(true);
        await fireEvent(toggle(), "checkedChange", false);
        expect(new Settings(storage).get("showRecipeCardDetails")).toBe(false);
    });

    it("persists a change to the toggle", async () => {
        const storage = memoryStorage();
        const settings = new Settings(storage);

        await renderWithProviders(<SettingsScreen settings={settings}/>);
        await fireEvent(screen.getByLabelText("Show the COFFEE marker"), "checkedChange", false);

        expect(new Settings(storage).get("showCoffeeMarker")).toBe(false);
    });

    it("explains what the toggle does, rather than only naming it", async () => {
        await renderWithProviders(<SettingsScreen settings={new Settings(memoryStorage())}/>);
        expect(screen.getByText(/TEA marker is always shown/i)).toBeTruthy();
    });

    it("offers the dot matrix pour profile, off unless it has been turned on", async () => {
        await renderWithProviders(<SettingsScreen settings={new Settings(memoryStorage())}/>);
        expect(screen.getByLabelText("Dot matrix pour profile")
            .props.accessibilityState.checked).toBe(false);
    });

    it("persists the dot matrix pour profile", async () => {
        const storage = memoryStorage();

        await renderWithProviders(<SettingsScreen settings={new Settings(storage)}/>);
        await fireEvent(screen.getByLabelText("Dot matrix pour profile"), "checkedChange", true);

        expect(new Settings(storage).get("dotMatrixProfile")).toBe(true);
    });

    it("offers recipe pictures, on until someone turns them off", async () => {
        // On by default: most recipes now arrive with a pod photo, a sharer's
        // picture or a coffee photo, and a picture that will not load falls
        // back to the accent mark.
        await renderWithProviders(<SettingsScreen settings={new Settings(memoryStorage())}/>);

        expect(screen.getByLabelText("Pictures in ABOUT")
            .props.accessibilityState.checked).toBe(true);
        expect(screen.getByLabelText("Recipe card photos").props.accessibilityState.checked).toBe(false);
        expect(screen.getByLabelText("Shelf photo previews").props.accessibilityState.checked).toBe(true);
        expect(screen.getByText("Show coffee photos in your own shelves, tag shelves and eligible auto shelves.")).toBeTruthy();
    });

    it("changes each picture surface independently", async () => {
        const settings = new Settings(memoryStorage());
        await renderWithProviders(<SettingsScreen settings={settings}/>);
        await fireEvent(screen.getByLabelText("Pictures in ABOUT"), "checkedChange", false);
        expect(settings.get("showShelfPhotoPreviews")).toBe(true);
        expect(settings.get("showRecipeCardPhotos")).toBe(false);
        await fireEvent(screen.getByLabelText("Recipe card photos"), "checkedChange", true);
        await fireEvent(screen.getByLabelText("Shelf photo previews"), "checkedChange", false);
        expect(settings.get("showRecipeAvatars")).toBe(false);
        expect(settings.get("showRecipeCardPhotos")).toBe(true);
        expect(settings.get("showShelfPhotoPreviews")).toBe(false);
    });

    it("persists recipe pictures turned off", async () => {
        const storage = memoryStorage();

        await renderWithProviders(<SettingsScreen settings={new Settings(storage)}/>);
        await fireEvent(screen.getByLabelText("Pictures in ABOUT"), "checkedChange", false);

        expect(new Settings(storage).get("showRecipeAvatars")).toBe(false);
    });

    it("shows recipe pictures off for someone who turned them off", async () => {
        // The default moved, the choice did not: a stored false is a row, and
        // a row wins over the default.
        const settings = new Settings(memoryStorage());
        settings.set("showRecipeAvatars", false);

        await renderWithProviders(<SettingsScreen settings={settings}/>);

        expect(screen.getByLabelText("Pictures in ABOUT")
            .props.accessibilityState.checked).toBe(false);
    });

    it("does not offer the one-line hints", async () => {
        // The hints toggle lives in the editor's more menu, beside the deck it
        // annotates, rather than a screen away from it.
        await renderWithProviders(<SettingsScreen settings={new Settings(memoryStorage())}/>);

        expect(screen.queryByLabelText("One-line hints")).toBeNull();
        expect(screen.queryByText(/EDITOR/)).toBeNull();
    });

    it("no longer asks where the field explanations go", async () => {
        // There were two, and neither survived a phone. The long form is one
        // sheet behind the caret now, so there is nothing left to choose.
        await renderWithProviders(<SettingsScreen settings={new Settings(memoryStorage())}/>);

        expect(screen.queryByText(/Field explanations/)).toBeNull();
    });

    it("heads the toggles with the part of the app they change", async () => {
        await renderWithProviders(<SettingsScreen settings={new Settings(memoryStorage())}/>);
        expect(screen.getByText("RECIPE LIST")).toBeTruthy();
    });

    it("offers Celsius and Fahrenheit, starting on Celsius", async () => {
        await renderWithProviders(<SettingsScreen settings={new Settings(memoryStorage())}/>);

        expect(screen.getByText("UNITS")).toBeTruthy();
        expect(screen.getByLabelText("°C").props.accessibilityState.checked).toBe(true);
        expect(screen.getByLabelText("°F").props.accessibilityState.checked).toBe(false);
    });

    it("persists a switch to Fahrenheit", async () => {
        const storage = memoryStorage();

        await renderWithProviders(<SettingsScreen settings={new Settings(storage)}/>);
        await fireEvent.press(screen.getByLabelText("°F"));

        expect(new Settings(storage).get("temperatureUnit")).toBe("F");
    });

    it("says what the unit changes and what it does not", async () => {
        await renderWithProviders(<SettingsScreen settings={new Settings(memoryStorage())}/>);
        expect(screen.getByText(/card always stores/i)).toBeTruthy();
    });

    it("keeps roaster feeds reachable before the first subscription", async () => {
        await renderWithProviders(<SettingsScreen settings={new Settings(memoryStorage())}/>);
        await fireEvent.press(screen.getByRole("button", {
            name: "Roaster feeds, Manage subscriptions and declined offers."
        }));
        expect(mockPush).toHaveBeenCalledWith("/subscriptions");
    });

    it("shows roaster subscriptions once there is a subscription", async () => {
        const settings = new Settings(memoryStorage());
        settings.set("roasterSubscriptions", serialiseSubscriptions([{
            feed: "https://roaster.example/feed.json", roaster: "Example Roasters",
            lastSync: 0, lastAttempt: 0, paused: false
        }]));
        await renderWithProviders(<SettingsScreen settings={settings}/>);
        expect(screen.getByText("Roaster feeds")).toBeTruthy();
        expect(screen.getByText("Manage subscriptions and declined offers.")).toBeTruthy();
    });

    it("shows roaster subscriptions when only a don't-ask-again is left to undo", async () => {
        const settings = new Settings(memoryStorage());
        settings.set("roasterFeedOptOut", serialiseFeedOptOut([feedKey("https://roaster.example/feed.json") ?? ""]));
        await renderWithProviders(<SettingsScreen settings={settings}/>);
        expect(screen.getByText("Roaster feeds")).toBeTruthy();
        expect(screen.getByText("Manage subscriptions and declined offers.")).toBeTruthy();
    });

    it("offers backup and restore", async () => {
        await renderWithProviders(<SettingsScreen settings={new Settings(memoryStorage())}/>);

        expect(screen.getByText("LIBRARY")).toBeTruthy();
        expect(screen.getByRole("button",
            {name: "Back up my recipes, Writes a file and hands it to the share sheet."})).toBeTruthy();
        expect(screen.getByRole("button",
            {name: "Restore from a backup, Adds anything your library does not already have."})).toBeTruthy();
    });

    it("says nothing at all when the picker was cancelled", async () => {
        // The user withdrew. A message would be the app arguing with them. The
        // button is really wired: the picker is consulted, and because it came
        // back cancelled no restore sheet is raised either.
        mockPickBackup.mockResolvedValue({cancelled: true});
        await renderWithProviders(<SettingsScreen settings={new Settings(memoryStorage())}/>);

        await fireEvent.press(screen.getByRole("button",
            {name: "Restore from a backup, Adds anything your library does not already have."}));

        expect(mockPickBackup).toHaveBeenCalled();
        expect(mockNotify).not.toHaveBeenCalled();
        expect(screen.queryByRole("button", {name: /add to my library/i})).toBeNull();
    });

    it("reports a file it could not read", async () => {
        mockPickBackup.mockResolvedValue({
            cancelled: false, result: {ok: false, reason: "That file could not be read."}
        });
        await renderWithProviders(<SettingsScreen settings={new Settings(memoryStorage())}/>);

        await fireEvent.press(screen.getByRole("button",
            {name: "Restore from a backup, Adds anything your library does not already have."}));

        expect(mockNotify).toHaveBeenCalledWith(
            expect.objectContaining({tone: "error", message: "That file could not be read."})
        );
    });

    it("refuses a backup that would silently drop unreadable historical bag attribution", async () => {
        mockBrewStore.all.mockImplementationOnce(() => { throw new BagAttributionError("brew-a"); });
        mockExportBackup.mockResolvedValue({ok: true});
        await renderWithProviders(<SettingsScreen settings={new Settings(memoryStorage())}/>);
        await fireEvent.press(screen.getByRole("button",
            {name: "Back up my recipes, Writes a file and hands it to the share sheet."}));
        expect(mockExportBackup).not.toHaveBeenCalled();
        expect(mockNotify).toHaveBeenCalledWith(expect.objectContaining({
            tone: "error",
            message: "A brew's saved bag could not be read, so the backup was not made."
        }));
    });

    it("hands the whole library and the live settings to the exporter", async () => {
        // Rewiring this row to onRestore, or passing the wrong arguments, used
        // to leave every test green because none of them pressed it.
        mockLibraryRecipes = [recipeNamed("Ethiopia", "u1")];
        mockExportBackup.mockResolvedValue({ok: true});
        await renderWithProviders(<SettingsScreen settings={new Settings(memoryStorage())}/>);

        await fireEvent.press(screen.getByRole("button",
            {name: "Back up my recipes, Writes a file and hands it to the share sheet."}));

        expect(mockExportBackup).toHaveBeenCalledWith(
            mockLibraryRecipes, expect.any(Object), expect.any(String), expect.any(Array)
        );

        // Asserted against DEFAULTS rather than a list written out here, because
        // a hand-kept list is exactly what went wrong: `showHints` was added to
        // the app and nobody remembered to add it to the snapshot, so it was
        // silently absent from every backup while the tests stayed green. A
        // test that names the keys itself would have gone on passing too.
        const snapshot = mockExportBackup.mock.calls[0][1] as Record<string, unknown>;
        expect(snapshot.brewTraceBudgetMB).toBe(10);
        expect(snapshot).not.toHaveProperty("brewTraceRetention");
        expect(Object.keys(snapshot).sort()).toEqual(
            Object.keys(DEFAULTS).filter(key => !NOT_IN_BACKUP.includes(key as SettingKey)).sort()
        );
    });

    it("backs up existing bags even with the experiment disabled", async () => {
        const db = createTestDatabase();
        jest.spyOn(databaseModule, "appDatabase").mockReturnValue(
            db as ReturnType<typeof databaseModule.appDatabase>);
        const bags = new CoffeeBagDatabase();
        bags.create(bagFixture());
        bags.correct("bag-a", 100);
        const settings = new Settings(memoryStorage());
        expect(settings.get("bagExperimentEnabled")).toBe(false);
        mockExportBackup.mockResolvedValue({ok: true});
        await renderWithProviders(<SettingsScreen settings={settings}/>);
        await fireEvent.press(screen.getByRole("button", {name: /^Back up my recipes,/}));
        expect(mockExportBackup.mock.calls[0][4]).toEqual(bags.exportInventory());
        expect(mockExportBackup.mock.calls[0][1]).not.toHaveProperty("bagExperimentEnabled");
        expect(mockExportBackup.mock.calls[0][1]).not.toHaveProperty("bagTracker");
    });

    it("discovers legacy-only inventory for backup without requiring an opt-in", async () => {
        const db = createTestDatabase();
        jest.spyOn(databaseModule, "appDatabase").mockReturnValue(
            db as ReturnType<typeof databaseModule.appDatabase>);
        const old = {id: "legacy", recipeUuid: "missing", sizeGrams: 250,
            boughtOn: "2026-10-01", addedAt: 10, countedFrom: 100, gramsAtCount: 120};
        db.execSync(`CREATE TABLE coffee_bags (id TEXT PRIMARY KEY, recipeUuid TEXT,
            countedFrom INTEGER, finishedAt INTEGER DEFAULT 0, bag TEXT);`);
        db.runSync("INSERT INTO coffee_bags VALUES (?, ?, ?, 0, ?);",
            [old.id, old.recipeUuid, old.countedFrom, JSON.stringify(old)]);
        mockExportBackup.mockResolvedValue({ok: true});
        await renderWithProviders(<SettingsScreen settings={new Settings(memoryStorage())}/>);
        await fireEvent.press(screen.getByRole("button", {name: /^Back up my recipes,/}));
        expect(mockExportBackup.mock.calls[0][4]?.bags[0])
            .toMatchObject({bag: {id: "legacy"}, baselineGrams: 120, needsCheck: true});
    });

    it("refuses to make an incomplete backup when existing inventory is unreadable", async () => {
        const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
        const db = createTestDatabase();
        jest.spyOn(databaseModule, "appDatabase").mockReturnValue(
            db as ReturnType<typeof databaseModule.appDatabase>);
        new CoffeeBagDatabase().create(bagFixture());
        db.runSync("UPDATE coffee_bags_v2 SET bag = '{}';");
        await renderWithProviders(<SettingsScreen settings={new Settings(memoryStorage())}/>);
        await fireEvent.press(screen.getByRole("button", {name: /^Back up my recipes,/}));
        expect(mockExportBackup).not.toHaveBeenCalled();
        expect(mockNotify).toHaveBeenCalledWith({
            tone: "error", message: "Your coffee bags could not be read, so the backup was not made."
        });
        expect(warn).toHaveBeenCalled();
    });

    it.each([false, true])(
        "restores independent bags with local opt-in unchanged, even when bag writes fail: %s",
        async fail => {
            const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
            const db = createTestDatabase();
            jest.spyOn(databaseModule, "appDatabase").mockReturnValue(
                db as ReturnType<typeof databaseModule.appDatabase>);
            new CoffeeBagDatabase();
            if (fail) db.execSync(`CREATE TRIGGER reject_bags BEFORE INSERT ON coffee_bags_v2
                BEGIN SELECT RAISE(FAIL, 'disk full'); END;`);
            const inventory: BagInventoryBackup = {version: 2, bags: [{
                bag: bagFixture(), baselineGrams: 100, needsCheck: false,
                linkedRecipeUuids: [], runs: []
            }], selections: []};
            const incoming = backupOf([], {bagExperimentEnabled: true, bagTracker: "beanconqueror"});
            mockPickBackup.mockResolvedValue({
                ...incoming,
                result: {...incoming.result, payload: {...incoming.result.payload, bagInventory: inventory}}
            });
            mockApplyRestore.mockReturnValue({status: "restored", added: 0});
            const settings = new Settings(memoryStorage());
            settings.set("bagTracker", "xbrw");
            await renderWithProviders(<SettingsScreen settings={settings}/>);
            await fireEvent.press(screen.getByRole("button", {name: /^Restore from a backup,/}));
            await fireEvent(screen.getByLabelText(/settings from this backup/i), "checkedChange", true);
            await waitFor(async () => {
                await fireEvent.press(screen.getByRole("button", {name: /Restore.*bags/}));
                expect(mockNotify).toHaveBeenCalledWith(fail
                    ? {tone: "error", message: "Recipes were restored, but coffee bags could not be restored."}
                    : {tone: "success", message: "1 coffee bag restored"});
            }, {timeout: SHEET_PRESS_TIMEOUT});
            expect(settings.get("bagExperimentEnabled")).toBe(false);
            expect(settings.get("bagTracker")).toBe("xbrw");
            expect(new CoffeeBagDatabase().get("bag-a") === null).toBe(fail);
            expect(warn.mock.calls.length > 0).toBe(fail);
        }
    );

    it("reports bag damage even if the only successful work was restoring settings", async () => {
        const incoming = backupOf([], {temperatureUnit: "F"});
        mockPickBackup.mockResolvedValue({
            ...incoming, result: {...incoming.result, payload: {
                ...incoming.result.payload, skippedBags: 1,
                bagWarnings: ["This bag inventory version is not supported."]
            }}
        });
        mockApplyRestore.mockReturnValue({status: "restored", added: 0});
        await renderWithProviders(<SettingsScreen settings={new Settings(memoryStorage())}/>);
        await fireEvent.press(screen.getByRole("button", {name: /^Restore from a backup,/}));
        await fireEvent(screen.getByLabelText(/settings from this backup/i), "checkedChange", true);
        await waitFor(async () => {
            await fireEvent.press(screen.getByRole("button", {name: "Take the settings"}));
            expect(mockNotify).toHaveBeenCalledWith({
                tone: "error",
                message: "Some coffee bag data could not be restored. Check affected quantities and choices."
            });
        }, {timeout: SHEET_PRESS_TIMEOUT});
    });

    it("no longer carries the retired rail hint in a backup", async () => {
        // The rail hint and its setting were removed outright. The exhaustiveness
        // test above proves the snapshot equals DEFAULTS; this names the one key
        // that must not reappear, so a reader who re-adds it to DEFAULTS by reflex
        // is told here rather than shipping a dead preference in every backup.
        mockExportBackup.mockResolvedValue({ok: true});
        await renderWithProviders(<SettingsScreen settings={new Settings(memoryStorage())}/>);

        await fireEvent.press(screen.getByRole("button",
            {name: "Back up my recipes, Writes a file and hands it to the share sheet."}));

        const snapshot = mockExportBackup.mock.calls[0][1] as Record<string, unknown>;
        expect(snapshot).not.toHaveProperty("libraryRailHintDismissed");
    });

    it("leaves the paired machine out of a backup rather than carrying it to another phone", async () => {
        // A BLE peripheral identifier is minted by the operating system for one
        // phone. Carried to a second phone it does not name anything, and the
        // second phone would sit trying to reach a machine by an identifier its
        // own radio has never issued. So this key is excluded on purpose, and
        // named in NOT_IN_BACKUP so the exhaustiveness test above still holds
        // every other key to account.
        mockLibraryRecipes = [recipeNamed("Ethiopia", "u1")];
        mockExportBackup.mockResolvedValue({ok: true});
        const storage = memoryStorage();
        const settings = new Settings(storage);
        settings.set("machineDeviceId", "a-peripheral-on-this-phone-only");
        await renderWithProviders(<SettingsScreen settings={settings}/>);

        await fireEvent.press(screen.getByRole("button",
            {name: "Back up my recipes, Writes a file and hands it to the share sheet."}));

        const snapshot = mockExportBackup.mock.calls[0][1] as Record<string, unknown>;
        expect(snapshot).not.toHaveProperty("machineDeviceId");
    });

    it("ignores a machine identifier a backup carries anyway", async () => {
        // Older backups, or a hand-edited file. The pairing on this phone is
        // what the radio actually knows about, and a stranger's identifier
        // must not displace it.
        const storage = memoryStorage();
        const settings = new Settings(storage);
        settings.set("machineDeviceId", "mine");
        mockPickBackup.mockResolvedValue(backupOf([recipeNamed("A", "u1")], {machineDeviceId: "theirs"}));
        mockApplyRestore.mockReturnValue({status: "restored", added: 1});
        await renderWithProviders(<SettingsScreen settings={settings}/>);

        await fireEvent.press(screen.getByRole("button",
            {name: "Restore from a backup, Adds anything your library does not already have."}));
        await settleSheet();
        await fireEvent(screen.getByLabelText(/settings from this backup/i),
                        "checkedChange", true);
        await fireEvent.press(screen.getByRole("button", {name: /add to my library/i}));

        expect(new Settings(storage).get("machineDeviceId")).toBe("mine");
    });

    it("shows the brew detail storage budget and stores a choice of 25 MB", async () => {
        const settings = new Settings(memoryStorage());
        await renderWithProviders(<SettingsScreen settings={settings}/>);
        expect(screen.getByText("Brew detail storage")).toBeTruthy();
        expect(screen.getByText("Brew traces are the detailed charts. When they pass this limit, the oldest are dropped first. Rated and noted brews, and the newest brews of each recipe, go last. Summaries are always kept.")).toBeTruthy();
        expect(screen.getByRole("radio", {name: "10 MB", checked: true})).toBeTruthy();
        expect(screen.getByRole("radio", {name: "50 MB"})).toBeTruthy();
        expect(screen.getByRole("radio", {name: "Unlimited"})).toBeTruthy();
        await fireEvent.press(screen.getByRole("radio", {name: "25 MB"}));
        expect(settings.get("brewTraceBudgetMB")).toBe(25);
    });

    it.each([
        [{brewTraceRetention: 200}, 25],
        [{brewTraceBudgetMB: 50}, 50],
        [{brewTraceBudgetMB: 10}, 10],
        [{brewTraceBudgetMB: 25}, 25],
        [{brewTraceBudgetMB: 0}, 0],
        [{brewTraceBudgetMB: 200}, 25],
        [{brewTraceBudgetMB: -1}, 25],
        [{brewTraceBudgetMB: 10.5}, 25],
        [{brewTraceBudgetMB: "50"}, 25],
        [{brewTraceBudgetMB: null}, 25]
    ])("restores only supported brew storage budgets from %j", async (incoming, expected) => {
        const storage = memoryStorage();
        const settings = new Settings(storage);
        settings.set("brewTraceBudgetMB", 25);
        mockPickBackup.mockResolvedValue(backupOf([recipeNamed("A", "u1")], incoming));
        mockApplyRestore.mockReturnValue({status: "restored", added: 1});
        await renderWithProviders(<SettingsScreen settings={settings}/>);
        await fireEvent.press(screen.getByRole("button",
            {name: "Restore from a backup, Adds anything your library does not already have."}));
        await waitFor(async () => {
            await fireEvent(screen.getByLabelText(/settings from this backup/i), "checkedChange", true);
            await fireEvent.press(screen.getByRole("button", {name: /add to my library/i}));
            expect(mockApplyRestore).toHaveBeenCalled();
        }, {timeout: SHEET_PRESS_TIMEOUT});
        expect(new Settings(storage).get("brewTraceBudgetMB")).toBe(expected);
        expect(mockNotify).not.toHaveBeenCalledWith(expect.objectContaining({tone: "error"}));
    });

    it("refetches restored catalogues while retaining paused subscriptions and import choices", async () => {
        const storage = memoryStorage();
        const feed = "https://roaster.example/feed.json";
        const subscriptions = JSON.stringify([{
            feed, roaster: "Roaster", paused: true, lastSync: 1000, lastAttempt: 2000, pinnedAt: 123
        }]);
        const prints = JSON.stringify({u1: "brewing content"});
        mockPickBackup.mockResolvedValue(backupOf([recipeNamed("A", "u1")], {
            roasterSubscriptions: subscriptions,
            roasterFeedOptOut: JSON.stringify([feed]),
            importFingerprints: prints,
            roasterCatalogue: "untrusted cache",
            roasterAlerts: "untrusted alerts"
        }));
        mockApplyRestore.mockReturnValue({status: "restored", added: 1});
        await renderWithProviders(<SettingsScreen settings={new Settings(storage)}/>);
        await fireEvent.press(screen.getByRole("button",
            {name: "Restore from a backup, Adds anything your library does not already have."}));
        await settleSheet();
        await fireEvent(screen.getByLabelText(/settings from this backup/i), "checkedChange", true);
        await fireEvent.press(screen.getByRole("button", {name: /add to my library/i}));

        const restored = new Settings(storage);
        expect(JSON.parse(restored.get("roasterSubscriptions"))).toEqual([{
            feed, roaster: "Roaster", paused: true, lastSync: 0, lastAttempt: 0, pinnedAt: 123
        }]);
        expect(restored.get("roasterFeedOptOut")).toBe(JSON.stringify([feed]));
        expect(restored.get("importFingerprints")).toBe(prints);
        expect(restored.get("roasterCatalogue")).toBe("");
        expect(restored.get("roasterAlerts")).toBe("");
    });

    it("restores every setting a backup carries, not a subset of them", async () => {
        // The other half of the same omission: a key can be in the snapshot and
        // still be dropped on the way back in, which loses the preference at the
        // one moment the user expects it to be safe.
        const storage = memoryStorage();
        const all = Object.fromEntries(
            Object.entries(DEFAULTS)
                .filter(([key]) => !NOT_IN_BACKUP.includes(key as SettingKey))
                .map(([key, value]) => [key, typeof value === "boolean" ? !value : value])
        );
        mockPickBackup.mockResolvedValue(backupOf([recipeNamed("A", "u1")], all));
        mockApplyRestore.mockReturnValue({status: "restored", added: 1});
        await renderWithProviders(<SettingsScreen settings={new Settings(storage)}/>);

        await fireEvent.press(screen.getByRole("button",
            {name: "Restore from a backup, Adds anything your library does not already have."}));
        await settleSheet();
        await fireEvent(screen.getByLabelText(/settings from this backup/i),
                        "checkedChange", true);
        await fireEvent.press(screen.getByRole("button", {name: /add to my library/i}));

        const restored = new Settings(storage);
        for (const key of Object.keys(DEFAULTS) as SettingKey[]) {
            if (NOT_IN_BACKUP.includes(key)) continue;
            expect({[key]: restored.get(key)}).toEqual({[key]: all[key]});
        }
    });

    it.each([false, true])("restores legacy picture %s over newer independent settings", async legacy => {
        const storage = memoryStorage();
        const settings = new Settings(storage);
        settings.set("showRecipeCardPhotos", true);
        settings.set("showShelfPhotoPreviews", !legacy);
        mockPickBackup.mockResolvedValue(backupOf([recipeNamed("A", "u1")], {showRecipeAvatars: legacy}));
        mockApplyRestore.mockReturnValue({status: "restored", added: 1});
        await renderWithProviders(<SettingsScreen settings={settings}/>);
        await fireEvent.press(screen.getByRole("button",
            {name: "Restore from a backup, Adds anything your library does not already have."}));
        await settleSheet();
        await fireEvent(screen.getByLabelText(/settings from this backup/i), "checkedChange", true);
        await fireEvent.press(screen.getByRole("button", {name: /add to my library/i}));
        expect(settings.get("showRecipeAvatars")).toBe(legacy);
        expect(settings.get("showRecipeCardPhotos")).toBe(false);
        expect(settings.get("showShelfPhotoPreviews")).toBe(legacy);
    });

    it("restores which machine you own, not just the default", async () => {
        // The generic restore test flips booleans, so a string setting round-trips
        // its own default through it and proves nothing. This one names a value
        // that is not the default: somebody who corrected their machine by hand
        // and then moved phones must not silently land back on Studio.
        const storage = memoryStorage();
        mockPickBackup.mockResolvedValue(
            backupOf([recipeNamed("A", "u1")], {machineModel: "original"})
        );
        mockApplyRestore.mockReturnValue({status: "restored", added: 1});
        await renderWithProviders(<SettingsScreen settings={new Settings(storage)}/>);

        await fireEvent.press(screen.getByRole("button",
            {name: "Restore from a backup, Adds anything your library does not already have."}));
        await settleSheet();
        await fireEvent(screen.getByLabelText(/settings from this backup/i),
                        "checkedChange", true);
        await fireEvent.press(screen.getByRole("button", {name: /add to my library/i}));

        expect(new Settings(storage).get("machineModel")).toBe("original");
    });

    it("restores recipe pictures turned off, though the default is on", async () => {
        // A backup's false is somebody's answer, or at least the value they
        // had. It must land as a stored false, not be read as "unset" and come
        // back on under the new default.
        const storage = memoryStorage();
        mockPickBackup.mockResolvedValue(
            backupOf([recipeNamed("A", "u1")], {showRecipeAvatars: false})
        );
        mockApplyRestore.mockReturnValue({status: "restored", added: 1});
        await renderWithProviders(<SettingsScreen settings={new Settings(storage)}/>);

        await fireEvent.press(screen.getByRole("button",
            {name: "Restore from a backup, Adds anything your library does not already have."}));
        await settleSheet();
        await fireEvent(screen.getByLabelText(/settings from this backup/i),
                        "checkedChange", true);
        await fireEvent.press(screen.getByRole("button", {name: /add to my library/i}));

        expect(new Settings(storage).get("showRecipeAvatars")).toBe(false);
    });

    it("backs up recipe pictures turned off as off", async () => {
        const settings = new Settings(memoryStorage());
        settings.set("showRecipeAvatars", false);
        mockExportBackup.mockResolvedValue({ok: true});
        await renderWithProviders(<SettingsScreen settings={settings}/>);

        await fireEvent.press(screen.getByRole("button",
            {name: "Back up my recipes, Writes a file and hands it to the share sheet."}));

        expect(mockExportBackup).toHaveBeenCalledWith(expect.anything(),
            expect.objectContaining({showRecipeAvatars: false}),
            expect.any(String), expect.any(Array));
    });

    it("reports a backup that could not be shared", async () => {
        mockExportBackup.mockResolvedValue({ok: false, reason: "This device cannot share files."});
        await renderWithProviders(<SettingsScreen settings={new Settings(memoryStorage())}/>);

        await fireEvent.press(screen.getByRole("button",
            {name: "Back up my recipes, Writes a file and hands it to the share sheet."}));

        expect(mockNotify).toHaveBeenCalledWith(
            expect.objectContaining({tone: "error", message: "This device cannot share files."})
        );
    });

    it("restores a picked backup by adding exactly what the library lacks", async () => {
        mockLibraryRecipes = [];
        mockPickBackup.mockResolvedValue(
            backupOf([recipeNamed("A", "u1"), recipeNamed("B", "u2")])
        );
        mockApplyRestore.mockReturnValue({status: "restored", added: 2});
        await renderWithProviders(<SettingsScreen settings={new Settings(memoryStorage())}/>);

        await fireEvent.press(screen.getByRole("button",
            {name: "Restore from a backup, Adds anything your library does not already have."}));
        await settleSheet();
        await fireEvent.press(screen.getByRole("button", {name: /add to my library/i}));

        expect(mockApplyRestore).toHaveBeenCalledWith(
            expect.objectContaining({recipes: expect.any(Array)}),
            {replace: false}
        );
        expect(mockNotify).toHaveBeenCalledWith(
            expect.objectContaining({tone: "success", message: "2 recipes restored"})
        );
    });

    it.each([
        {brewHistorySort: "grind", brewHistorySortDirection: "asc"},
        {brewHistorySort: "supernova", brewHistorySortDirection: "sideways"},
        {brewHistorySort: "rating", brewHistorySortDirection: "sideways"},
        {brewHistorySort: "supernova", brewHistorySortDirection: "asc"},
        {}
    ])("restores only valid history preferences from %j", async (incoming) => {
        const storage = memoryStorage();
        const settings = new Settings(storage);
        settings.set("brewHistorySort", "dose");
        settings.set("brewHistorySortDirection", "desc");
        mockPickBackup.mockResolvedValue(backupOf([recipeNamed("A", "u1")], incoming));
        mockApplyRestore.mockReturnValue({status: "restored", added: 1});
        await renderWithProviders(<SettingsScreen settings={settings}/>);
        await fireEvent.press(screen.getByRole("button",
            {name: "Restore from a backup, Adds anything your library does not already have."}));
        await waitFor(async () => {
            await fireEvent(screen.getByLabelText(/settings from this backup/i), "checkedChange", true);
            await fireEvent.press(screen.getByRole("button", {name: /add to my library/i}));
            expect(mockApplyRestore).toHaveBeenCalled();
        }, {timeout: SHEET_PRESS_TIMEOUT});
        const restored = new Settings(storage);
        expect(restored.get("brewHistorySort")).toBe(
            incoming.brewHistorySort === "grind" || incoming.brewHistorySort === "rating"
                ? incoming.brewHistorySort : "dose");
        expect(restored.get("brewHistorySortDirection")).toBe(incoming.brewHistorySortDirection === "asc" ? "asc" : "desc");
    });

    it("includes history preferences in the typed settings snapshot", async () => {
        const settings = new Settings(memoryStorage());
        settings.set("brewHistorySort", "rating");
        settings.set("brewHistorySortDirection", "asc");
        mockExportBackup.mockResolvedValue({ok: true});
        await renderWithProviders(<SettingsScreen settings={settings}/>);
        await fireEvent.press(screen.getByRole("button", {name: /back up my recipes/i}));
        expect(mockExportBackup).toHaveBeenCalledWith(expect.anything(),
            expect.objectContaining({brewHistorySort: "rating", brewHistorySortDirection: "asc"}),
            expect.any(String), expect.any(Array));
    });

    it("restores a library sorted by rating", async () => {
        // The newest axis, through the read boundary that narrows an unknown
        // one away: a backup naming it must come back sorting by rating rather
        // than quietly falling back to name.
        const storage = memoryStorage();
        mockPickBackup.mockResolvedValue(
            backupOf([recipeNamed("A", "u1")],
                     {librarySort: "rating", librarySortDirection: "asc"})
        );
        mockApplyRestore.mockReturnValue({status: "restored", added: 1});
        await renderWithProviders(<SettingsScreen settings={new Settings(storage)}/>);

        await fireEvent.press(screen.getByRole("button",
            {name: "Restore from a backup, Adds anything your library does not already have."}));
        await settleSheet();
        await fireEvent(screen.getByLabelText(/settings from this backup/i),
                        "checkedChange", true);
        await fireEvent.press(screen.getByRole("button", {name: /add to my library/i}));

        const restored = new Settings(storage);
        expect(restored.get("librarySort")).toBe("rating");
        expect(restored.get("librarySortDirection")).toBe("asc");
    });

    it("shows how many saved recipes could not be read, and only then", async () => {
        // Buys off the silence of skipping an unreadable blob (#124): the line
        // is present when the library reports one and absent when it does not.
        mockUnreadableCount = 2;
        await renderWithProviders(<SettingsScreen settings={new Settings(memoryStorage())}/>);
        expect(screen.getByText("2 saved recipes could not be read.")).toBeTruthy();
    });

    it("asks the library for the count once rather than on every render", async () => {
        // The count parses every blob in the table, so it is a diagnostic the
        // screen that shows it asks for, never a figure the library carries
        // around. Taken at render it would put a whole-table parse on Home.
        mockUnreadableCount = 1;
        await renderWithProviders(<SettingsScreen settings={new Settings(memoryStorage())}/>);

        expect(mockCountUnreadable).toHaveBeenCalledTimes(1);
    });

    it("says a backup is unavailable while a recipe cannot be read", async () => {
        mockUnreadableCount = 1;
        await renderWithProviders(<SettingsScreen settings={new Settings(memoryStorage())}/>);

        expect(screen.getByText(/backing up is paused/i)).toBeTruthy();
    });

    it("reports the refusal rather than throwing out of the press", async () => {
        // `allRecipes()` throws over an unreadable row on purpose, and that
        // throw used to land outside `useBackup`'s catch and reject the press
        // handler, so the user tapped and nothing at all happened.
        mockUnreadableCount = 1;
        mockAllRecipesThrows = true;
        await renderWithProviders(<SettingsScreen settings={new Settings(memoryStorage())}/>);

        await fireEvent.press(screen.getByRole("button",
            {name: "Back up my recipes, Writes a file and hands it to the share sheet."}));

        expect(mockExportBackup).not.toHaveBeenCalled();
        expect(mockNotify).toHaveBeenCalledWith(
            expect.objectContaining({tone: "error"})
        );
    });

    it("offers a way to remove the rows that cannot be read", async () => {
        mockUnreadableCount = 1;
        mockDeleteUnreadable.mockReturnValue(1);
        await renderWithProviders(<SettingsScreen settings={new Settings(memoryStorage())}/>);

        await fireEvent.press(screen.getByRole("button", {name: /remove unreadable/i}));

        expect(mockDeleteUnreadable).toHaveBeenCalled();
    });

    it("clears the note once the unreadable rows are gone", async () => {
        mockUnreadableCount = 1;
        mockDeleteUnreadable.mockImplementation(() => {
            mockUnreadableCount = 0;
            return 1;
        });
        await renderWithProviders(<SettingsScreen settings={new Settings(memoryStorage())}/>);

        await fireEvent.press(screen.getByRole("button", {name: /remove unreadable/i}));

        expect(screen.queryByTestId("unreadable-recipes-note")).toBeNull();
    });

    it("shows no unreadable-recipes note when the library is clean", async () => {
        mockUnreadableCount = 0;
        await renderWithProviders(<SettingsScreen settings={new Settings(memoryStorage())}/>);
        expect(screen.queryByTestId("unreadable-recipes-note")).toBeNull();
    });

    it("carries the brew history into a backup", async () => {
        const history = [{id: "b1", rating: 4}];
        mockBrewStore.all.mockReturnValue(history);
        mockExportBackup.mockResolvedValue({ok: true});
        await renderWithProviders(<SettingsScreen settings={new Settings(memoryStorage())}/>);

        await fireEvent.press(screen.getByRole("button",
            {name: "Back up my recipes, Writes a file and hands it to the share sheet."}));

        expect(mockExportBackup.mock.calls[0][3]).toBe(history);
    });

    it("restores the brews a backup carries, and says how many landed", async () => {
        mockLibraryRecipes = [];
        mockPickBackup.mockResolvedValue(
            backupOf([recipeNamed("A", "u1")], {}, [{id: "b1"}, {id: "b2"}])
        );
        mockApplyRestore.mockReturnValue({status: "restored", added: 1});
        mockBrewStore.restore.mockReturnValue(2);
        await renderWithProviders(<SettingsScreen settings={new Settings(memoryStorage())}/>);

        await fireEvent.press(screen.getByRole("button",
            {name: "Restore from a backup, Adds anything your library does not already have."}));
        await settleSheet();
        await fireEvent.press(screen.getByRole("button", {name: /add to my library/i}));

        expect(mockBrewStore.restore).toHaveBeenCalledWith([{id: "b1"}, {id: "b2"}]);
        expect(mockNotify).toHaveBeenCalledWith(expect.objectContaining({
            tone: "success", message: "1 recipe and 2 brews restored"
        }));
    });

    it.each(["", "not-a-colour"])(
        "reports a backup's invalid brew accent %j instead of silently restoring it", async accent => {
            mockLibraryRecipes = [];
            mockPickBackup.mockResolvedValue({
                cancelled: false,
                result: parseBackup(buildBackup([recipeNamed("A", "u1")], {}, "2.2.0", [brew({accent})]))
            });
            mockApplyRestore.mockReturnValue({status: "restored", added: 1});
            mockBrewStore.restore.mockReturnValue(0);
            await renderWithProviders(<SettingsScreen settings={new Settings(memoryStorage())}/>);
            await fireEvent.press(screen.getByRole("button",
                {name: "Restore from a backup, Adds anything your library does not already have."}));
            await settleSheet();
            await fireEvent.press(screen.getByRole("button", {name: /add to my library/i}));
            expect(mockBrewStore.restore).toHaveBeenCalledWith([]);
            expect(mockNotify).toHaveBeenCalledWith(expect.objectContaining({
                tone: "error", message: "One brew in that backup could not be read."
            }));
        }
    );

    it("says so when part of a history could not be read", async () => {
        // A short history is not a failed restore, but a user told only what
        // landed has no way to know something did not.
        mockLibraryRecipes = [];
        mockPickBackup.mockResolvedValue(
            backupOf([recipeNamed("A", "u1")], {}, [{id: "b1"}], 2)
        );
        mockApplyRestore.mockReturnValue({status: "restored", added: 1});
        mockBrewStore.restore.mockReturnValue(1);
        await renderWithProviders(<SettingsScreen settings={new Settings(memoryStorage())}/>);

        await fireEvent.press(screen.getByRole("button",
            {name: "Restore from a backup, Adds anything your library does not already have."}));
        await settleSheet();
        await fireEvent.press(screen.getByRole("button", {name: /add to my library/i}));

        expect(mockNotify).toHaveBeenCalledWith(expect.objectContaining({
            tone: "success", message: "1 recipe and 1 brew restored"
        }));
        expect(mockNotify).toHaveBeenCalledWith(expect.objectContaining({
            tone: "error", message: "2 brews in that backup could not be read."
        }));
    });

    it("does not restore a history over a library that would not restore", async () => {
        mockLibraryRecipes = [];
        mockPickBackup.mockResolvedValue(backupOf([recipeNamed("A", "u1")], {}, [{id: "b1"}]));
        mockApplyRestore.mockReturnValue({status: "failed"});
        await renderWithProviders(<SettingsScreen settings={new Settings(memoryStorage())}/>);

        await fireEvent.press(screen.getByRole("button",
            {name: "Restore from a backup, Adds anything your library does not already have."}));
        await settleSheet();
        await fireEvent.press(screen.getByRole("button", {name: /add to my library/i}));

        expect(mockBrewStore.restore).not.toHaveBeenCalled();
    });

    it("reports a replace that rolled back, and leaves the settings alone", async () => {
        // The critical fix, seen from the screen: a failed replace must reach
        // the user as a notice, not as an uncaught throw, and must not have
        // changed anything — including the preferences.
        const storage = memoryStorage();
        mockLibraryRecipes = [recipeNamed("Old", "old")];
        mockPickBackup.mockResolvedValue(
            backupOf([recipeNamed("A", "u1")], {temperatureUnit: "F"})
        );
        mockApplyRestore.mockReturnValue({status: "failed"});
        await renderWithProviders(<SettingsScreen settings={new Settings(storage)}/>);

        await fireEvent.press(screen.getByRole("button",
            {name: "Restore from a backup, Adds anything your library does not already have."}));
        await settleSheet();
        await fireEvent.press(screen.getByRole("button", {name: /replace my library/i}));
        await fireEvent.press(screen.getByRole("button", {name: /yes, replace/i}));

        expect(mockApplyRestore).toHaveBeenCalledWith(expect.anything(), {replace: true});
        expect(mockNotify).toHaveBeenCalledWith(
            expect.objectContaining({tone: "error"})
        );
        expect(new Settings(storage).get("temperatureUnit")).toBe("C");
    });

    it("takes only the valid settings out of a restored backup, and only on success", async () => {
        // The settings block of a backup is arbitrary user-supplied JSON. A
        // good value is applied; a malformed one is ignored rather than trusted.
        const storage = memoryStorage();
        mockPickBackup.mockResolvedValue(
            backupOf([recipeNamed("A", "u1")],
                     {temperatureUnit: "K", dotMatrixProfile: true, machineModel: "toaster"})
        );
        mockApplyRestore.mockReturnValue({status: "restored", added: 1});
        await renderWithProviders(<SettingsScreen settings={new Settings(storage)}/>);

        await fireEvent.press(screen.getByRole("button",
            {name: "Restore from a backup, Adds anything your library does not already have."}));
        await settleSheet();
        await fireEvent(screen.getByLabelText(/settings from this backup/i),
                        "checkedChange", true);
        await fireEvent.press(screen.getByRole("button", {name: /add to my library/i}));

        const restored = new Settings(storage);
        expect(restored.get("temperatureUnit")).toBe("C");
        expect(restored.get("dotMatrixProfile")).toBe(true);
        // A machine that does not exist would be stored and then read back as
        // one, which is what `isMachineModel` is there to stop.
        expect(restored.get("machineModel")).toBe("studio");
    });

    it("presents its sheets outside the screen's flex container", async () => {
        // XbrwSheet is deliberately not `modal`, so it renders in place rather
        // than through a Portal. As a child of the screen's `flex={1}` YStack it
        // is an ordinary flex child sitting next to a ScrollView that takes the
        // space, so it resolves to zero height and draws nothing -- the failure
        // XbrwSheet's own comment calls looking "exactly like a control that did
        // nothing". On device that was Delete all doing nothing at all: the
        // press fired and the state flipped, but no sheet was ever drawn.
        //
        // The sheet must therefore be a sibling of the screen, which is the
        // shape app/index.tsx and app/editRecipe.tsx already use.
        mockLibraryRecipes = [recipeNamed("A", "u1")];
        await renderWithProviders(<SettingsScreen settings={new Settings(memoryStorage())}/>);

        await fireEvent.press(screen.getByRole("button",
            {name: "Delete all recipes, Everything on this phone. There is no undo."}));
        await settleSheet();

        // The sheet is up...
        expect(screen.getByText(/deletes 1 recipe/i)).toBeTruthy();
        // ...and outside both the scroll view and the screen's flex container.
        expect(within(screen.getByTestId("settings-scroll", {includeHiddenElements: true}))
            .queryByText(/deletes 1 recipe/i)).toBeNull();
        expect(within(screen.getByTestId("settings-screen", {includeHiddenElements: true}))
            .queryByText(/deletes 1 recipe/i)).toBeNull();
    });

    describe("forgetting a machine", () => {
        // Owner report, 2026-10-19: Forget acted on the tap, and a machine was
        // forgotten by accident. It now asks first, in a sheet the screen owns.
        type Link = {
            remembered: string; status: string; changeBlocker: string | null;
            machines: unknown[]; forget: jest.Mock; forgetMachine: jest.Mock;
        };
        const link = (): Link => jest.requireMock("@/hooks/useMachine").useMachine() as Link;
        const saved = {id: "WORK", label: "Work", model: "studio", modelString: "",
                       advertisedName: "", serial: ""};

        function machineSettings(): Settings {
            const settings = new Settings(memoryStorage());
            settings.set("savedMachines", JSON.stringify([saved]));
            settings.set("machineDeviceId", saved.id);
            return settings;
        }

        async function openManagement(): Promise<void> {
            await fireEvent.press(screen.getByRole("button", {name: /^Work, /}));
            await fireEvent.press(screen.getByRole("button", {name: /^Manage machine/}));
            await settleSheet();
        }

        async function askToForget(): Promise<void> {
            await openManagement();
            await waitFor(async () => {
                await fireEvent.press(screen.getByRole("button", {name: /^Forget this machine/}));
                expect(screen.getByText("Forget Work?")).toBeTruthy();
            }, {timeout: SHEET_PRESS_TIMEOUT});
            await settleSheet();
        }

        beforeEach(() => {
            Object.assign(link(), {
                remembered: "WORK", status: "disconnected", changeBlocker: null, machines: [saved]
            });
            link().forget.mockClear();
            link().forgetMachine.mockClear();
        });
        afterEach(() => {
            Object.assign(link(), {
                remembered: "", status: "disconnected", changeBlocker: null, machines: []
            });
        });

        it("asks first, and forgets nothing until the answer is Forget", async () => {
            await renderWithProviders(<SettingsScreen settings={machineSettings()}/>);
            await askToForget();

            expect(screen.getByText("Forget Work?")).toBeTruthy();
            expect(screen.getByTestId("settings-screen", {includeHiddenElements: true})
                .props.accessibilityElementsHidden).toBe(true);
            expect(screen.getByText(
                "It comes off your list. To use it again, switch it on nearby and add it again."
            )).toBeTruthy();
            expect(link().forgetMachine).not.toHaveBeenCalled();
            expect(link().forget).not.toHaveBeenCalled();

            await fireEvent.press(screen.getByRole("button", {name: "Forget Work"}));

            expect(link().forgetMachine).toHaveBeenCalledWith("WORK");
        });

        it("keeps the machine when the answer is Keep it", async () => {
            await renderWithProviders(<SettingsScreen settings={machineSettings()}/>);
            await askToForget();
            await fireEvent.press(screen.getByRole("button", {name: "Keep Work"}));
            await settleSheet();

            expect(link().forgetMachine).not.toHaveBeenCalled();
            expect(link().forget).not.toHaveBeenCalled();
            expect(screen.getByTestId("settings-screen").props.accessibilityElementsHidden)
                .toBe(false);
            expect(screen.getByText("Manage machine")).toBeTruthy();
        });

        it("disables forgetting in management while a brew holds the link", async () => {
            link().changeBlocker = "A brew is running. Stop it or let it finish before changing machines.";
            await renderWithProviders(<SettingsScreen settings={machineSettings()}/>);
            await openManagement();

            const forget = screen.getByRole("button", {name: /^Forget this machine/});
            expect(forget).toBeDisabled();
            expect(forget.props.accessibilityLabel).toContain(link().changeBlocker);
            await fireEvent.press(forget);
            await settleSheet();

            expect(screen.queryByText("Forget Work?")).toBeNull();
            expect(link().forget).not.toHaveBeenCalled();
            expect(link().forgetMachine).not.toHaveBeenCalled();
        });
    });

    it("deletes the whole library, on the real count, only after confirming", async () => {
        mockLibraryRecipes = [
            recipeNamed("A", "u1"), recipeNamed("B", "u2"), recipeNamed("C", "u3")
        ];
        mockDeleteAll.mockReturnValue({status: "deleted", deleted: 3});
        await renderWithProviders(<SettingsScreen settings={new Settings(memoryStorage())}/>);

        await fireEvent.press(screen.getByRole("button",
            {name: "Delete all recipes, Everything on this phone. There is no undo."}));
        await settleSheet();

        // The sheet a thumb is about to act in says the real number, not a
        // placeholder zero.
        expect(screen.getByText(/deletes 3 recipes/i)).toBeTruthy();
        expect(mockDeleteAll).not.toHaveBeenCalled();

        await fireEvent.press(screen.getByRole("button", {name: /delete all 3 recipes/i}));

        expect(mockDeleteAll).toHaveBeenCalledTimes(1);
        expect(mockNotify).toHaveBeenCalledWith(
            expect.objectContaining({tone: "success", message: "3 recipes deleted"})
        );
    });

    it("says nothing was removed when the delete fails", async () => {
        // The screen used to report success unconditionally, so a delete that
        // failed left the user believing their library was gone while every
        // recipe was still in it -- the worst way round for this to be wrong.
        mockLibraryRecipes = [recipeNamed("A", "u1"), recipeNamed("B", "u2")];
        mockDeleteAll.mockReturnValue({status: "failed"});
        await renderWithProviders(<SettingsScreen settings={new Settings(memoryStorage())}/>);

        await fireEvent.press(screen.getByRole("button",
            {name: "Delete all recipes, Everything on this phone. There is no undo."}));
        await settleSheet();
        await fireEvent.press(screen.getByRole("button", {name: /delete all 2 recipes/i}));

        expect(mockNotify).toHaveBeenCalledWith(
            expect.objectContaining({tone: "error", message: expect.stringMatching(/nothing was removed/i)})
        );
    });

    it("offers to delete everything, in the danger colour", async () => {
        await renderWithProviders(<SettingsScreen settings={new Settings(memoryStorage())}/>);

        const row = screen.getByRole("button",
            {name: "Delete all recipes, Everything on this phone. There is no undo."});
        expect(row).toBeTruthy();
        expect(screen.getByText("Delete all recipes").props.style)
            .toEqual(expect.objectContaining({color: palette.danger}));
    });

    it("asks before deleting anything", async () => {
        await renderWithProviders(<SettingsScreen settings={new Settings(memoryStorage())}/>);

        await fireEvent.press(screen.getByRole("button",
            {name: "Delete all recipes, Everything on this phone. There is no undo."}));

        expect(screen.getByText(/cannot be undone/i)).toBeTruthy();
    });

    it("opens About from the final row after the ordered preference groups", async () => {
        await renderWithProviders(<SettingsScreen settings={accountOn()}/>);

        // SettingsActionRow folds its label and detail into one accessible
        // name (see components/__tests__/SettingsRows.test.tsx), so the row's
        // full name is "About XBRW++, Version ..." rather than the label
        // alone — matched here in full, not by a prefix, so this test would
        // notice if the version ever stopped reaching the name.
        const version = Application.nativeApplicationVersion ?? "unknown";
        const about = screen.getByRole("button", {name: `About XBRW++, Version ${version}`});
        await fireEvent.press(about);

        expect(mockPush).toHaveBeenCalledWith("/about");

        const order = renderOrder(screen.toJSON());
        const indexOf = (text: string) => order.indexOf(text);
        const headings = ["MACHINES", "BREWING", "UNITS", "RECIPE LIST",
                          "XBLOOM ACCOUNT", "LIBRARY", "About XBRW++"];
        expect(indexOf(headings[0])).toBeGreaterThanOrEqual(0);
        for (let index = 1; index < headings.length; index++) {
            expect(indexOf(headings[index])).toBeGreaterThan(indexOf(headings[index - 1]));
        }
        expect(screen.queryByText("Brew history")).toBeNull();
        expect(screen.queryByText("What leaves this device")).toBeNull();
    });

    it("keeps support in the fixed header rather than the preferences scroll", async () => {
        await renderWithProviders(<SettingsScreen settings={accountOn()}/>);

        expect(screen.queryByTestId("support-tile")).toBeNull();
        expect(screen.getByRole("link", {name: `${SUPPORT_TITLE}. Opens in your browser.`})).toBeTruthy();
        expect(within(screen.getByTestId("settings-scroll")).queryByText(SUPPORT_TITLE)).toBeNull();
    });

    // It unlocks nothing, so it stores nothing. A key added here would also
    // have to reach settingsSnapshot(), and the one that does not is the one
    // that goes missing from a backup.
    it("adds no setting of its own", () => {
        expect(Object.keys(DEFAULTS)).not.toContain("supported");
        expect(Object.keys(DEFAULTS).some((key) => /support|donat|tip/i.test(key)))
            .toBe(false);
    });

    it("offers sign-in under its own heading when no account is connected", async () => {
        await renderWithProviders(<SettingsScreen settings={accountOn()}/>);

        // The heading, not just the row: a section whose title went missing
        // still works and still reads as part of whatever sits above it.
        await waitFor(() => expect(screen.getByText("XBLOOM ACCOUNT")).toBeTruthy());
        // SettingsActionRow folds label and detail into one accessible name.
        await fireEvent.press(screen.getByRole("button",
            {name: "Sign in, Bring across the recipes you made in the xBloom app."}));

        expect(mockPush).toHaveBeenCalledWith("/importCloud");
        // Nothing to sign out of yet.
        expect(screen.queryByRole("button", {name: "Sign out"})).toBeNull();
    });

    it("names the connected account and offers a way out of it", async () => {
        mockLoadSession.mockResolvedValue({memberId: 7, token: "t", email: "sam@example.com"});

        await renderWithProviders(<SettingsScreen settings={accountOn()}/>);

        // The email is what tells someone which account they are looking at,
        // so it is shown rather than a bare "Signed in".
        await waitFor(() => expect(screen.getByRole("button",
            {name: "Import recipes, sam@example.com"})).toBeTruthy());
        expect(screen.queryByRole("button", {name: /^Sign in/})).toBeNull();

        await fireEvent.press(screen.getByRole("button", {name: "Sign out"}));

        await waitFor(() => expect(mockSignOut).toHaveBeenCalled());
        // Signing out is not a navigation: it happens here, and the section
        // falls back to offering sign-in.
        await waitFor(() => expect(screen.getByRole("button",
            {name: "Sign in, Bring across the recipes you made in the xBloom app."})).toBeTruthy());
        expect(mockPush).not.toHaveBeenCalled();
    });

    it("says so when the keychain would not let go of the account", async () => {
        // `signOut` is undefended on purpose, so this call site must not
        // swallow it. Silence would leave someone believing they had signed out
        // of an account they had not -- the one failure here with a privacy
        // cost -- and the row correctly still says they are connected.
        mockLoadSession.mockResolvedValue({memberId: 7, token: "t", email: "sam@example.com"});
        mockSignOut.mockRejectedValue(new Error("keychain locked"));

        await renderWithProviders(<SettingsScreen settings={accountOn()}/>);
        await waitFor(() => expect(screen.getByRole("button", {name: "Sign out"})).toBeTruthy());

        await fireEvent.press(screen.getByRole("button", {name: "Sign out"}));

        await waitFor(() => expect(mockNotify).toHaveBeenCalledWith({
            tone:    "error",
            message: "Could not sign out. The account is still connected."
        }));
        expect(screen.getByRole("button",
            {name: "Import recipes, sam@example.com"})).toBeTruthy();
    });

    it("opens the importer from the connected account too", async () => {
        mockLoadSession.mockResolvedValue({memberId: 7, token: "t", email: "sam@example.com"});

        await renderWithProviders(<SettingsScreen settings={accountOn()}/>);

        await waitFor(() => expect(screen.getByRole("button",
            {name: "Import recipes, sam@example.com"})).toBeTruthy());
        await fireEvent.press(screen.getByRole("button",
            {name: "Import recipes, sam@example.com"}));

        expect(mockPush).toHaveBeenCalledWith("/importCloud");
    });

    it("offers a storage budget choice, including Unlimited", async () => {
        const {getByText} = await renderWithProviders(
            <SettingsScreen settings={new Settings(memoryStorage())}/>
        );
        expect(getByText("Unlimited")).toBeTruthy();
    });

    describe("Labs", () => {
        it("offers the account section to everybody", async () => {
            // No longer gated: the reason it was, an unorganised library, is
            // what M5 fixed.
            await renderWithProviders(<SettingsScreen settings={new Settings(memoryStorage())}/>);

            expect(screen.getByText("XBLOOM ACCOUNT")).toBeTruthy();
            expect(screen.getByRole("button", {name: /^Sign in/})).toBeTruthy();
        });

        it("reads the account on the way in", async () => {
            await renderWithProviders(<SettingsScreen settings={accountOn()}/>);

            await waitFor(() => expect(mockLoadSession).toHaveBeenCalled());
        });

        it("hides Labs until somebody has gone looking for it", async () => {
            const settings = new Settings(memoryStorage());
            settings.set("machineConsoleAcknowledged", true);
            await renderWithProviders(<SettingsScreen settings={settings}/>);

            expect(screen.queryByText("LABS")).toBeNull();
            expect(screen.queryByText("CARD DIAGNOSTICS")).toBeNull();
            expect(screen.queryByRole("button", {name: /^Machine console/})).toBeNull();
        });

        it("offers card diagnostics and the guarded console from Labs", async () => {
            const settings = new Settings(memoryStorage());
            settings.set("labsUnlocked", true);
            const rendered = await renderWithProviders(<SettingsScreen settings={settings}/>);
            const order = renderOrder(rendered.toJSON());
            expect(order.indexOf("CARD DIAGNOSTICS")).toBeGreaterThan(order.indexOf("LABS"));
            expect(order.indexOf("About XBRW++")).toBeGreaterThan(order.indexOf("CARD DIAGNOSTICS"));
            await fireEvent.press(screen.getByRole("button", {name: /^Machine console/}));
            expect(mockPush).toHaveBeenCalledWith("/machine");
            expect(settings.get("machineConsoleAcknowledged")).toBe(false);
        });

        it("offers a way back out once Labs is open", async () => {
            const settings = new Settings(memoryStorage());
            settings.set("labsUnlocked", true);

            await renderWithProviders(<SettingsScreen settings={settings}/>);

            expect(screen.getByText("LABS")).toBeTruthy();
            expect(screen.getByRole("button",
                {name: "Hide Labs, Anything you switched on here stays on."})).toBeTruthy();
        });

        it("switches the Beanconqueror handoff on from Labs", async () => {
            const settings = new Settings(memoryStorage());
            settings.set("labsUnlocked", true);

            await renderWithProviders(<SettingsScreen settings={settings}/>);

            // Named in terms of what goes wrong, because the failure lands in
            // somebody else's app where it reads as our bug.
            expect(screen.getByText(/can read the link/)).toBeTruthy();

            await fireEvent.press(screen.getByRole("switch",
                {name: "Send brews to Beanconqueror"}));

            expect(settings.get("beanconquerorHandoff")).toBe(true);
        });

        it("offers one default-off coffee bag experiment and marks old estimates before enabling", async () => {
            const settings = new Settings(memoryStorage());
            settings.set("labsUnlocked", true);
            const bags = new CoffeeBagDatabase();
            bags.create(bagFixture());
            expect(settings.get("bagExperimentEnabled")).toBe(false);
            await renderWithProviders(<SettingsScreen settings={settings}/>);
            await fireEvent.press(screen.getByRole("switch", {name: "Coffee bags"}));
            expect(settings.get("bagExperimentEnabled")).toBe(true);
            expect(bags.balance("bag-a", 18, "xbrw")).toEqual({kind: "needsCheck"});
            await fireEvent.press(screen.getByRole("button", {name: /^Hide Labs,/}));
            expect(settings.get("bagExperimentEnabled")).toBe(true);
        });

        it("does not claim the experiment is enabled when the baseline warning cannot be saved", async () => {
            jest.spyOn(console, "warn").mockImplementation(() => {});
            jest.spyOn(CoffeeBagDatabase.prototype, "markAllNeedsCheck").mockImplementation(() => {
                throw new Error("disk full");
            });
            const settings = new Settings(memoryStorage());
            settings.set("labsUnlocked", true);
            await renderWithProviders(<SettingsScreen settings={settings}/>);
            await fireEvent.press(screen.getByRole("switch", {name: "Coffee bags"}));
            expect(settings.get("bagExperimentEnabled")).toBe(false);
            expect(mockNotify).toHaveBeenCalledWith(expect.objectContaining({tone: "error"}));
        });

        it("can disable the experiment even if inventory access is broken", async () => {
            const access = jest.spyOn(CoffeeBagDatabase.prototype, "markAllNeedsCheck")
                .mockImplementation(() => { throw new Error("disk full"); });
            const settings = new Settings(memoryStorage());
            settings.set("labsUnlocked", true);
            settings.set("bagExperimentEnabled", true);
            await renderWithProviders(<SettingsScreen settings={settings}/>);
            await fireEvent.press(screen.getByRole("switch", {name: "Coffee bags"}));
            expect(settings.get("bagExperimentEnabled")).toBe(false);
            expect(access).not.toHaveBeenCalled();
        });

        it.each(["explicit", "auto"] as const)("requires a check when %s tracking returns to this app", async (mode) => {
            const settings = new Settings(memoryStorage());
            settings.set("labsUnlocked", true);
            settings.set("bagExperimentEnabled", true);
            settings.set("bagTracker", mode === "explicit" ? "beanconqueror" : "auto");
            settings.set("beanconquerorHandoff", true);
            const bags = new CoffeeBagDatabase();
            bags.create(bagFixture());
            await renderWithProviders(<SettingsScreen settings={settings}/>);
            await fireEvent.press(mode === "explicit" ? screen.getByText("XBRW++")
                : screen.getByRole("switch", {name: "Send brews to Beanconqueror"}));
            expect(bags.balance("bag-a", 18, "xbrw")).toEqual({kind: "needsCheck"});
            if (mode === "explicit") expect(settings.get("bagTracker")).toBe("xbrw");
            else expect(settings.get("beanconquerorHandoff")).toBe(false);
        });

        it.each(["explicit", "auto"] as const)("retains %s ownership if its required check cannot be saved", async (mode) => {
            jest.spyOn(console, "warn").mockImplementation(() => {});
            jest.spyOn(CoffeeBagDatabase.prototype, "markAllNeedsCheck").mockImplementation(() => {
                throw new Error("disk full");
            });
            const settings = new Settings(memoryStorage());
            settings.set("labsUnlocked", true);
            settings.set("bagExperimentEnabled", true);
            settings.set("bagTracker", mode === "explicit" ? "beanconqueror" : "auto");
            settings.set("beanconquerorHandoff", true);
            await renderWithProviders(<SettingsScreen settings={settings}/>);
            await fireEvent.press(mode === "explicit" ? screen.getByText("XBRW++")
                : screen.getByRole("switch", {name: "Send brews to Beanconqueror"}));
            expect(settings.get("bagTracker")).toBe(mode === "explicit" ? "beanconqueror" : "auto");
            expect(settings.get("beanconquerorHandoff")).toBe(true);
            expect(mockNotify).toHaveBeenCalledWith(expect.objectContaining({tone: "error"}));
        });

        it("closes Labs from inside it, and leaves the rest of settings alone", async () => {
            // The way in can afford to be undiscoverable because nobody
            // arrives at it by accident. A way out that nobody can find is
            // just a trap.
            const settings = new Settings(memoryStorage());
            settings.set("labsUnlocked", true);

            await renderWithProviders(<SettingsScreen settings={settings}/>);

            await fireEvent.press(screen.getByRole("button",
                {name: "Hide Labs, Anything you switched on here stays on."}));

            expect(settings.get("labsUnlocked")).toBe(false);
            expect(screen.queryByText("LABS")).toBeNull();
            expect(screen.queryByText("CARD DIAGNOSTICS")).toBeNull();
            // The section closing does not take the rest of the screen with it.
            expect(screen.getByText("XBLOOM ACCOUNT")).toBeTruthy();
        });

        it("will not let a backup file hand anybody Labs", async () => {
            // A backup is not private: it goes to the share sheet. The key is
            // held out of the snapshot so one cannot carry it, and left out
            // of the allowlist above so a hand-written one cannot either. This
            // is the second of those two locks -- the first is the compile-time
            // `BackupExcluded`, which no test can observe.
            const storage = memoryStorage();
            mockPickBackup.mockResolvedValue(backupOf(
                [recipeNamed("A", "u1")],
                {labsUnlocked: true, beanconquerorHandoff: true,
                 bagExperimentEnabled: true, bagTracker: "beanconqueror", readyToBrewDismissedOn: "2026-10-23",
                 dotMatrixProfile: true}
            ));
            mockApplyRestore.mockReturnValue({status: "restored", added: 1});
            await renderWithProviders(<SettingsScreen settings={new Settings(storage)}/>);

            await fireEvent.press(screen.getByRole("button",
                {name: "Restore from a backup, Adds anything your library does not already have."}));
            await settleSheet();
            await fireEvent(screen.getByLabelText(/settings from this backup/i),
                            "checkedChange", true);
            await fireEvent.press(screen.getByRole("button", {name: /add to my library/i}));

            const restored = new Settings(storage);
            expect(restored.get("labsUnlocked")).toBe(false);
            expect(restored.get("beanconquerorHandoff")).toBe(false);
            expect(restored.get("bagExperimentEnabled")).toBe(false);
            expect(restored.get("bagTracker")).toBe("auto");
            expect(restored.get("readyToBrewDismissedOn")).toBe("");
            // The rest of the block still landed, so this is the Labs keys
            // being refused and not the restore quietly failing.
            expect(restored.get("dotMatrixProfile")).toBe(true);
        });
    });
});
