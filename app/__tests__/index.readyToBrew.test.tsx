import React from "react";
import {act, fireEvent, screen} from "@testing-library/react-native";

import HomeScreen from "@/app/index";
import Recipe from "@/library/Recipe";
import {dayOf, newBag} from "@/library/coffeeBag";
import type {StoredBagReading} from "@/library/CoffeeBagDatabase";
import type {SettingsStorage} from "@/library/Settings";
import {Settings} from "@/library/Settings";
import {renderWithProviders} from "@/test-utils/render";

const mockPush = jest.fn();
let mockRemembered = "AA:BB:CC";

jest.mock("expo-router", () => {
    const actualReact = jest.requireActual("react");
    return {
        useRouter:      () => ({push: mockPush}),
        useNavigation:  () => ({setOptions: jest.fn()}),
        useFocusEffect: (cb: () => void) => {
            actualReact.useEffect(() => {
                cb();
            }, [cb]);
        }
    };
});
jest.mock("expo-share-intent", () => ({
    useShareIntentContext: () => ({
        hasShareIntent:   false,
        shareIntent:      {},
        resetShareIntent: jest.fn()
    })
}));
jest.mock("@/library/RecipeDatabase");
// A remembered machine reads the Easy Mode slots, which open the app database.
jest.mock("expo-sqlite", () => ({
    openDatabaseSync: () => jest.requireActual("@/test-utils/sqlite").createTestDatabase()
}));
jest.mock("@/library/XBloomRecipe", () => ({
    XBloomRecipe: jest.fn()
}));
jest.mock("expo-clipboard", () => ({
    hasStringAsync:         jest.fn(async () => false),
    getStringAsync:         jest.fn(async () => ""),
    isPasteButtonAvailable: false,
    ClipboardPasteButton:   () => null
}));
jest.mock("@/components/XbrwToast", () => ({
    notify: jest.fn()
}));
jest.mock("@/hooks/useShareRecipe", () => ({
    ...jest.requireActual("@/hooks/useShareRecipe"),
    useShareRecipe: () => ({
        state:        {status: "idle"},
        share:        jest.fn(),
        dismissError: jest.fn()
    })
}));
jest.mock("@/hooks/useMachine", () => ({
    __esModule: true,
    useMachine: () => ({
        machine: {
            get info() { return null; },
            isConnected:     () => false,
            onLink:          () => () => undefined,
            askHowItIsDoing: jest.fn(async () => false)
        },
        status:     "disconnected",
        error:      null,
        remembered: mockRemembered,
        connect:    jest.fn(),
        forget:     jest.fn()
    })
}));
jest.mock("@/hooks/useLiveBrew", () => ({
    __esModule:  true,
    useLiveBrew: () => ({
        run:     null,
        start:   jest.fn(),
        dismiss: jest.fn(),
        watch:   () => () => {},
        brew:    jest.fn(),
        error:   null
    })
}));
jest.mock("@/library/NFC", () => ({
    __esModule: true,
    default:    jest.fn().mockImplementation(() => ({
        getIsClosed:  jest.fn(() => true),
        wasCancelled: jest.fn(() => false),
        close:        jest.fn(),
        cancel:       jest.fn(),
        readCard:     jest.fn()
    })),
    setNfcAlertIOS: jest.fn()
}));
jest.mock("@/library/BrewDatabase", () => ({
    __esModule: true,
    default:    jest.fn().mockImplementation(() => ({
        beanVocabulary: () => []
    }))
}));

const DAY = 86_400_000;

function memoryStorage(raw: Record<string, unknown> = {}) {
    const values = new Map<string, string>(
        Object.entries(raw).map(([key, value]) => [key, JSON.stringify(value)])
    );
    const storage: SettingsStorage = {
        read:  (key) => values.get(key) ?? null,
        write: (key, value) => {
            values.set(key, value);
        }
    };
    return {storage, values};
}

function named(name: string): Recipe {
    const recipe = new Recipe();
    recipe.name = name;
    return recipe;
}

/** A bag at its peak: roasted 18 days ago, medium figures. */
function peakBag(recipe: Recipe): StoredBagReading {
    const now = Date.now();
    return {
        bag: newBag(recipe.uuid, {
            sizeGrams: 250, roastedOn: dayOf(now - 18 * DAY),
            restDays: 7, peakDay: 18, bestUntilDay: 27
        }, now - 20 * DAY),
        usedGrams: 38
    };
}

function store(recipes: Recipe[], bags: Record<string, StoredBagReading> = {}) {
    return {
        queryRecipes:         jest.fn(() => recipes),
        retrieveAllRecipes:   jest.fn(() => recipes),
        getRecipe:            jest.fn((uuid: string) =>
            recipes.find((recipe) => recipe.uuid === uuid) ?? null),
        countRecipes:         jest.fn(() => recipes.length),
        countRecipesByFilter: jest.fn((ids: readonly string[]) =>
            Object.fromEntries(ids.map((filter) => [filter, 0]))
        ),
        countRecipesByTag:    jest.fn(() => []),
        countRecipesByAuthor: jest.fn(() => []),
        shelfMembers:         jest.fn(() => ({})),
        coffeeBags:           jest.fn(() => bags),
        deleteRecipe:         jest.fn(),
        cloneRecipe:          jest.fn(),
        updateRecipe:         jest.fn()
    };
}

async function renderHome(recipes: Recipe[], bags: Record<string, StoredBagReading>,
                          raw: Record<string, unknown> = {}) {
    const memory = memoryStorage(raw);
    await renderWithProviders(
        <HomeScreen db={store(recipes, bags)} settings={new Settings(memory.storage)}/>
    );
    return memory;
}

beforeEach(() => {
    mockPush.mockClear();
    mockRemembered = "AA:BB:CC";
});

afterEach(() => {
    jest.useRealTimers();
});

describe("Ready to brew card", () => {
    it("is not drawn without an open bag", async () => {
        await renderHome([named("Vinka")], {});
        expect(screen.getByText("Vinka")).toBeTruthy();
        expect(screen.queryByTestId("ready-to-brew")).toBeNull();
    });

    it("offers the open bag with its freshness and what is left", async () => {
        const vinka = named("Vinka");
        await renderHome([vinka, named("Other")], {[vinka.uuid]: peakBag(vinka)});
        expect(screen.getByTestId("ready-to-brew-name")).toHaveTextContent("Vinka");
        expect(screen.getByTestId("ready-to-brew-freshness")).toHaveTextContent("At its peak");
        // The default dose is 15 g: 212 g is 14 brews.
        expect(screen.getByTestId("ready-to-brew-bag"))
            .toHaveTextContent(`212 g left, about ${Math.floor(212 / vinka.dosage)} brews`);
    });

    it("brews from BREW through the same push as the row's BREW", async () => {
        const vinka = named("Vinka");
        await renderHome([vinka], {[vinka.uuid]: peakBag(vinka)});
        // By test id: the row's own swipe tray carries a "Brew Vinka" too.
        await fireEvent.press(screen.getByTestId("ready-to-brew-brew"));
        expect(mockPush).toHaveBeenCalledTimes(1);
        const call = mockPush.mock.calls[0][0];
        expect(call).toEqual(expect.objectContaining({pathname: "/brew"}));
        expect(JSON.parse(call.params.recipeJSON).uuid).toBe(vinka.uuid);
    });

    it("steps through the other ready coffees from +1 more ready", async () => {
        const vinka = named("Vinka");
        const guji = named("Guji");
        await renderHome([vinka, guji], {
            [vinka.uuid]: peakBag(vinka),
            [guji.uuid]: {...peakBag(guji), bag: {...peakBag(guji).bag, addedAt: Date.now()}}
        });
        // Neither brewed, so the newer bag leads.
        expect(screen.getByTestId("ready-to-brew-name")).toHaveTextContent("Guji");
        await fireEvent.press(screen.getByText("+1 more ready"));
        expect(screen.getByTestId("ready-to-brew-name")).toHaveTextContent("Vinka");
        await fireEvent.press(screen.getByText("+1 more ready"));
        expect(screen.getByTestId("ready-to-brew-name")).toHaveTextContent("Guji");
    });

    it("draws no BREW without a machine", async () => {
        mockRemembered = "";
        const vinka = named("Vinka");
        await renderHome([vinka], {[vinka.uuid]: peakBag(vinka)});
        expect(screen.getByTestId("ready-to-brew")).toBeTruthy();
        expect(screen.queryByTestId("ready-to-brew-brew")).toBeNull();
    });

    it("opens the recipe when the card is tapped", async () => {
        const vinka = named("Vinka");
        await renderHome([vinka], {[vinka.uuid]: peakBag(vinka)});
        await fireEvent.press(screen.getByTestId("ready-to-brew-open"));
        const call = mockPush.mock.calls[0][0];
        expect(call).toEqual(expect.objectContaining({pathname: "/editRecipe"}));
        expect(JSON.parse(call.params.recipeJSON).uuid).toBe(vinka.uuid);
    });

    it("hides once closed and remembers the day", async () => {
        const vinka = named("Vinka");
        const memory = await renderHome([vinka], {[vinka.uuid]: peakBag(vinka)});
        await fireEvent.press(screen.getByLabelText("Hide until tomorrow"));
        expect(screen.queryByTestId("ready-to-brew")).toBeNull();
        expect(JSON.parse(memory.values.get("readyToBrewDismissedOn") ?? "\"\""))
            .toBe(dayOf(Date.now()));
    });

    it("stays hidden on the day it was closed", async () => {
        const vinka = named("Vinka");
        const bags = {[vinka.uuid]: peakBag(vinka)};
        await renderHome([vinka], bags, {readyToBrewDismissedOn: dayOf(Date.now())});
        expect(screen.queryByTestId("ready-to-brew")).toBeNull();
    });

    it("comes back on a day after the one it was closed on", async () => {
        const vinka = named("Vinka");
        const bags = {[vinka.uuid]: peakBag(vinka)};
        await renderHome([vinka], bags, {readyToBrewDismissedOn: dayOf(Date.now() - DAY)});
        expect(screen.getByTestId("ready-to-brew")).toBeTruthy();
    });

    it("comes back at midnight without requiring the app to leave the foreground", async () => {
        const before = new Date(2026, 9, 19, 23, 59, 50).getTime();
        jest.useFakeTimers({now: before});
        const vinka = named("Vinka");
        await renderHome([vinka], {[vinka.uuid]: peakBag(vinka)},
            {readyToBrewDismissedOn: dayOf(before)});
        expect(screen.queryByTestId("ready-to-brew")).toBeNull();
        await act(async () => { jest.advanceTimersByTime(10_000); });
        expect(screen.getByTestId("ready-to-brew")).toBeTruthy();
    });

    it("records the new day when hidden after a mounted midnight rollover", async () => {
        const before = new Date(2026, 9, 19, 23, 59, 50).getTime();
        jest.useFakeTimers({now: before});
        const vinka = named("Vinka");
        const memory = await renderHome([vinka], {[vinka.uuid]: peakBag(vinka)});
        await act(async () => { jest.advanceTimersByTime(10_000); });
        await fireEvent.press(screen.getByLabelText("Hide until tomorrow"));
        expect(JSON.parse(memory.values.get("readyToBrewDismissedOn") ?? "\"\""))
            .toBe("2026-10-20");
    });
});
