import React from "react";
import {StyleSheet} from "react-native";
import {act, fireEvent, screen, waitFor} from "@testing-library/react-native";
import {router} from "expo-router";

import RoasterScreen from "@/app/roaster";
import RoasterCoffeeScreen from "@/app/roasterCoffee";
import RoastersScreen from "@/app/roasters";
import {parseHidden} from "@/library/hiddenShelves";
import {contentPrint} from "@/library/importRefresh";
import {parseRoasterFeed} from "@/library/roasterFeed";
import {forgetQueriesForTests} from "@/library/roasterFilters";
import {subscribe} from "@/library/roasterSync";
import {renderWithProviders, SHEET_PRESS_TIMEOUT, TEST_INSETS} from "@/test-utils/render";
import {FEED_URL, feedBody, feedJson, memoryLibrary, memorySettings} from "@/test-utils/roasterFeed";

jest.mock("expo-router", () => ({
    router: {push: jest.fn(), back: jest.fn()},
    useLocalSearchParams: () => ({})
}));

const mockNotify = jest.fn();
jest.mock("@/components/XbrwToast", () => ({
    __esModule: true,
    notify: (...args: unknown[]) => mockNotify(...args)
}));

function subscribed() {
    const settings = memorySettings();
    const {feed, body} = feedBody([{id: "a", available: false}, {id: "b"}]);
    subscribe(settings, FEED_URL, feed, body, 1000);
    return settings;
}

/**
 * A feed whose coffees carry the beans given, keyed by coffee id, so a test
 * can say what each one's country, roast or notes are.
 */
function subscribedTo(
    coffees: {id: string; available?: boolean}[],
    beans: Record<string, Record<string, unknown>> = {},
    roasts: Record<string, string> = {}
) {
    const parsed = JSON.parse(feedJson(coffees));
    for (const entry of parsed.coffees) {
        entry.bean = {...entry.bean, ...(beans[entry.id] ?? {})};
        if (roasts[entry.id] !== undefined) entry.roast = {...entry.roast, level: roasts[entry.id]};
    }
    const body = JSON.stringify(parsed);
    const settings = memorySettings();
    subscribe(settings, FEED_URL, parseRoasterFeed(body)!, body, 1000);
    return settings;
}

// Hidden elements too: the list is hidden from a screen reader while a sheet is up.
const rowIds = () => screen.queryAllByTestId(/^roaster-coffee-/, {includeHiddenElements: true})
    .map((node) => node.props.testID);

beforeEach(() => {
    forgetQueriesForTests();
    mockNotify.mockReset();
    (router.push as jest.Mock).mockReset();
});

describe("the roaster list", () => {
    it("explains itself when there are no subscriptions", async () => {
        await renderWithProviders(<RoastersScreen settings={memorySettings()}/>);
        expect(screen.getByTestId("roasters-empty")).toBeTruthy();
    });

    it("lists each roaster with its coffees and opens one", async () => {
        await renderWithProviders(<RoastersScreen settings={subscribed()} now={() => 1000}/>);
        expect(screen.getByLabelText("Test Roaster, 2 coffees · 1 sold out · Updated just now")).toBeTruthy();
        await fireEvent.press(screen.getByTestId("roaster-Test Roaster"));
        expect(router.push).toHaveBeenCalledWith({pathname: "/roaster", params: {feed: FEED_URL}});
    });
});

describe("a roaster's coffees", () => {
    it("hides sold-out coffees until IN STOCK is turned off, from the cache alone", async () => {
        const library = memoryLibrary();
        await renderWithProviders(<RoasterScreen settings={subscribed()} feedUrl={FEED_URL}/>);
        expect(rowIds()).toEqual(["roaster-coffee-b"]);
        expect(screen.getByTestId("screen-title-count").props.children).toBe("1");

        await fireEvent.press(screen.getByTestId("roaster-filter-in-stock"));
        expect(rowIds()).toEqual(["roaster-coffee-b", "roaster-coffee-a"]);
        expect(screen.getAllByTestId("roaster-row-sold-out")).toHaveLength(1);
        expect(library.fetched).toEqual([]);

        await fireEvent.press(screen.getByTestId("roaster-coffee-b"));
        expect(router.push).toHaveBeenCalledWith({
            pathname: "/roasterCoffee", params: {feed: FEED_URL, coffee: "b"}
        });
    });

    it("says so when the roaster is not in the catalogue", async () => {
        await renderWithProviders(<RoasterScreen settings={memorySettings()} feedUrl={FEED_URL}/>);
        expect(screen.getByTestId("roaster-missing")).toBeTruthy();
    });
});

describe("searching and filtering a roaster's coffees", () => {
    function shelf() {
        return subscribedTo(
            [{id: "a"}, {id: "b"}, {id: "c"}],
            {
                a: {country: "Colombia", farmer: "Jhoan Vergara"},
                b: {country: "Peru", decaffeinated: true},
                c: {country: "Colombia"}
            },
            {b: "Decaf"}
        );
    }

    it("offers only the filters the feed has two values for", async () => {
        await renderWithProviders(<RoasterScreen settings={shelf()} feedUrl={FEED_URL}/>);
        expect(screen.getByTestId("roaster-filter-countries")).toBeTruthy();
        expect(screen.getByTestId("roaster-filter-roasts")).toBeTruthy();
        expect(screen.getByTestId("roaster-filter-decaf")).toBeTruthy();
        // Every coffee is Washed and on sale.
        expect(screen.queryByTestId("roaster-filter-processes")).toBeNull();
        expect(screen.queryByTestId("roaster-filter-in-stock")).toBeNull();
    });

    it("filters by a value from the sheet and counts what is shown of the whole", async () => {
        await renderWithProviders(<RoasterScreen settings={shelf()} feedUrl={FEED_URL}/>);
        await fireEvent.press(screen.getByTestId("roaster-filter-countries"));
        await waitFor(async () => {
            // Pressed until it lands, and never twice: a second press would
            // take the value off again.
            const row = screen.getByLabelText("Peru, 1 coffee");
            if (!row.props.accessibilityState?.selected) await fireEvent.press(row);
            expect(rowIds()).toEqual(["roaster-coffee-b"]);
        }, {timeout: SHEET_PRESS_TIMEOUT});
        expect(screen.getByTestId("screen-title-count", {includeHiddenElements: true})
            .props.children).toBe("1 OF 3");
    });

    it("toggles decaf", async () => {
        await renderWithProviders(<RoasterScreen settings={shelf()} feedUrl={FEED_URL}/>);
        await fireEvent.press(screen.getByTestId("roaster-filter-decaf"));
        expect(rowIds()).toEqual(["roaster-coffee-b"]);
    });

    it("searches the producer and says when nothing matches, with a way out", async () => {
        jest.useFakeTimers();
        try {
            await renderWithProviders(<RoasterScreen settings={shelf()} feedUrl={FEED_URL}/>);
            await fireEvent.press(screen.getByTestId("rail-search"));
            await fireEvent.changeText(screen.getByTestId("rail-search-input"), "vergara");
            await act(async () => { jest.runAllTimers(); });
            expect(rowIds()).toEqual(["roaster-coffee-a"]);

            await fireEvent.changeText(screen.getByTestId("rail-search-input"), "nothing like it");
            await act(async () => { jest.runAllTimers(); });
            expect(screen.getByText("No coffees match.")).toBeTruthy();
            await fireEvent.press(screen.getByTestId("roaster-no-matches-action"));
            expect(rowIds()).toEqual(["roaster-coffee-a", "roaster-coffee-b", "roaster-coffee-c"]);
        } finally {
            jest.useRealTimers();
        }
    });

    it("remembers a roaster's filters when the list is opened again", async () => {
        const settings = shelf();
        const first = await renderWithProviders(<RoasterScreen settings={settings} feedUrl={FEED_URL}/>);
        await fireEvent.press(screen.getByTestId("roaster-filter-decaf"));
        await first.unmount();
        await renderWithProviders(<RoasterScreen settings={settings} feedUrl={FEED_URL}/>);
        expect(rowIds()).toEqual(["roaster-coffee-b"]);
    });
});

describe("tasting notes on a coffee", () => {
    async function openWith(aromatics: string) {
        const settings = subscribedTo([{id: "b"}], {b: {aromatics}});
        await renderWithProviders(
            <RoasterCoffeeScreen settings={settings} feedUrl={FEED_URL} coffeeId="b"
                                 library={memoryLibrary().deps} shelves={() => []}/>
        );
        await waitFor(() => expect(screen.queryByTestId("roaster-coffee-loading")).toBeNull());
    }

    it("draws a short list as chips", async () => {
        await openWith("Caramel | brown sugar | lemongrass");
        expect(screen.getByTestId("roaster-coffee-note-chips")).toBeTruthy();
        expect(screen.getByText("BROWN SUGAR")).toBeTruthy();
    });

    it("draws prose as a sentence, brackets and all", async () => {
        const notes = "Raspberry Mandarin Floral (2024 Harvest)";
        await openWith(notes);
        expect(screen.queryByTestId("roaster-coffee-note-chips")).toBeNull();
        expect(screen.getByTestId("roaster-coffee-notes").props.children).toBe(notes);
    });
});

describe("one coffee", () => {
    async function open(settings = subscribed(), library = memoryLibrary(), shelves = () => ["Pantry"]) {
        await renderWithProviders(
            <RoasterCoffeeScreen settings={settings} feedUrl={FEED_URL} coffeeId="b"
                                 library={library.deps} shelves={shelves}/>
        );
        await waitFor(() => expect(screen.queryByTestId("roaster-coffee-loading")).toBeNull());
        return {settings, library};
    }

    it("shows the bag's details and fetches the recipe from xBloom on opening", async () => {
        const {library} = await open();
        expect(screen.getByText("LIGHT ROAST")).toBeTruthy();
        expect(screen.getByTestId("roaster-coffee-advice").props.children)
            .toBe("Rest 11 days, peak day 28, best by day 42");
        expect(screen.getByText("Bags: 320 g · 160 g")).toBeTruthy();
        expect(screen.getByText("Peru")).toBeTruthy();
        expect(library.fetched).toEqual(["b-18g"]);
        expect(screen.getByText("18 g")).toBeTruthy();
    });

    it("writes the facts as ABOUT does and links out without magenta", async () => {
        await open();
        expect(screen.getByLabelText("ELEVATION, 1,590 m")).toBeTruthy();
        expect(screen.getByLabelText("SCORE, 88 points")).toBeTruthy();
        const page = screen.getByTestId("roaster-coffee-page");
        expect(page.props.accessibilityLabel).toBe("View the roaster's page. Opens in your browser.");
        expect(screen.queryByText("The roaster's page for this coffee")).toBeNull();
    });

    it("lets the name wrap and ends the scroll clear of the bottom bar", async () => {
        await open();
        expect(screen.getByTestId("screen-title-text").props.numberOfLines).toBe(3);
        expect(StyleSheet.flatten(screen.getByTestId("roaster-coffee-scroll")
            .props.contentContainerStyle).paddingBottom).toBe(TEST_INSETS.bottom + 24);
    });

    it("fetches the other size when it is chosen", async () => {
        const {library} = await open();
        await fireEvent.press(screen.getByTestId("roaster-coffee-size-15g"));
        await waitFor(() => expect(library.fetched).toEqual(["b-18g", "b-15g"]));
    });

    it("brews now without saving: the editor opens the fetched recipe", async () => {
        const {library} = await open();
        await fireEvent.press(screen.getByTestId("roaster-coffee-brew"));
        await waitFor(() => expect(router.push).toHaveBeenCalled());
        const call = (router.push as jest.Mock).mock.calls[0][0];
        expect(call.pathname).toBe("/editRecipe");
        expect(JSON.parse(call.params.recipeJSON).name).toBe("Coffee b - 18g");
        expect(library.all()).toEqual([]);
    });

    it("adds it to the library", async () => {
        const {library} = await open();
        await fireEvent.press(screen.getByTestId("roaster-coffee-add"));
        await waitFor(() => expect(library.all()).toHaveLength(1));
        expect(library.find("b-18g")?.name).toBe("Coffee b - 18g");
        expect(mockNotify).toHaveBeenCalledWith({tone: "success", message: "Added to your library."});
    });

    it("asks before replacing an edited copy, and KEEP MINE leaves it", async () => {
        const settings = subscribed();
        const library = memoryLibrary();
        // The user's earlier copy, since edited.
        const first = await (async () => {
            await open(settings, library);
            await fireEvent.press(screen.getByTestId("roaster-coffee-add"));
            await waitFor(() => expect(library.all()).toHaveLength(1));
            return library.find("b-18g")!;
        })();
        first.dosage = 20;
        library.deps.save(first);
        library.serve("b-18g", 61);

        await fireEvent.press(screen.getByTestId("roaster-coffee-add"));
        await waitFor(() => expect(screen.getByTestId("newer-version")).toBeTruthy());
        await fireEvent.press(screen.getByTestId("newer-version-keep"));

        expect(library.find("b-18g")).toMatchObject({dosage: 20, grindSize: 50});
        expect(library.all()).toHaveLength(1);
    });

    it("USE THE ROASTER'S LATEST takes the new recipe and keeps the user's name", async () => {
        const settings = subscribed();
        const library = memoryLibrary();
        await open(settings, library);
        await fireEvent.press(screen.getByTestId("roaster-coffee-add"));
        await waitFor(() => expect(library.all()).toHaveLength(1));
        const mine = library.find("b-18g")!;
        mine.dosage = 20;
        mine.name = "Mine";
        library.deps.save(mine);
        expect(JSON.parse(settings.get("importFingerprints"))[mine.uuid]).not.toBe(contentPrint(mine));
        library.serve("b-18g", 61);

        await fireEvent.press(screen.getByTestId("roaster-coffee-add"));
        await waitFor(() => expect(screen.getByTestId("newer-version")).toBeTruthy());
        await fireEvent.press(screen.getByTestId("newer-version-latest"));

        expect(library.find("b-18g")).toMatchObject({grindSize: 61, name: "Mine"});
    });

    it("adds it to a shelf the user picks", async () => {
        const {library, settings} = await open();
        await fireEvent.press(screen.getByTestId("roaster-coffee-shelf"));
        await waitFor(async () => {
            await fireEvent.press(screen.getByTestId("shelf-choice-Pantry"));
            expect(library.find("b-18g")?.tags[0]).toBe("Pantry");
        }, {timeout: SHEET_PRESS_TIMEOUT});
        expect(parseHidden(settings.get("myShelves"))).toEqual(["tag:pantry"]);
        expect(mockNotify).toHaveBeenCalledWith({tone: "success", message: "Added to Pantry."});
    });
});

describe("the bottom inset", () => {
    function endPadding(testID: string): number {
        return StyleSheet.flatten(screen.getByTestId(testID).props.contentContainerStyle).paddingBottom;
    }

    it("is cleared at the end of the roaster list", async () => {
        await renderWithProviders(<RoastersScreen settings={subscribed()} now={() => 1000}/>);
        expect(endPadding("roasters-scroll")).toBe(Math.max(48, TEST_INSETS.bottom + 24));
    });

    it("is cleared at the end of a roaster's coffees", async () => {
        await renderWithProviders(<RoasterScreen settings={subscribed()} feedUrl={FEED_URL}/>);
        expect(endPadding("roaster-list")).toBe(TEST_INSETS.bottom + 24);
    });
});
