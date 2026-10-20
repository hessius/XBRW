import React from "react";
import {Linking, Platform, StyleSheet} from "react-native";
import {DateTimePickerAndroid} from "@react-native-community/datetimepicker";
import {act, fireEvent, screen, waitFor} from "@testing-library/react-native";
import {router} from "expo-router";

import RoasterScreen from "@/app/roaster";
import RoasterCoffeeScreen from "@/app/roasterCoffee";
import RoastersScreen from "@/app/roasters";
import {TYPING_DEBOUNCE_MS} from "@/constants/motion";
import {parseHidden} from "@/library/hiddenShelves";
import {contentPrint} from "@/library/importRefresh";
import type {CoffeeBag} from "@/library/coffeeBag";
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
let mockRatingNoteOpen = false;
jest.mock("@/hooks/useLiveBrew", () => {
    const actual = jest.requireActual("@/hooks/useLiveBrew");
    return {
        ...actual,
        useLiveBrew: () => ({...actual.useLiveBrew(), ratingNoteOpen: mockRatingNoteOpen})
    };
});
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
    mockRatingNoteOpen = false;
    (router.push as jest.Mock).mockReset();
});

describe("catalogue screen-reader coverage", () => {
    it.each([
        ["roaster list", () => <RoastersScreen settings={subscribed()}/>, "roasters-scroll"],
        ["empty roaster list", () => <RoastersScreen settings={memorySettings()}/>, "roasters-empty"],
        ["roaster's coffees", () => <RoasterScreen settings={subscribed()} feedUrl={FEED_URL}/>,
         "roaster-list"],
        ["missing roaster", () => <RoasterScreen settings={memorySettings()} feedUrl={FEED_URL}/>,
         "roaster-missing"],
        ["coffee page", () =>
            <RoasterCoffeeScreen settings={subscribed()} feedUrl={FEED_URL} coffeeId="b"
                                 library={memoryLibrary().deps}/>, "roaster-coffee-scroll"],
        ["missing coffee", () =>
            <RoasterCoffeeScreen settings={subscribed()} feedUrl={FEED_URL} coffeeId="missing"
                                 library={memoryLibrary().deps}/>, "roaster-coffee-missing"]
    ])("hides and restores the %s while the live brew note is open", async (_name, page, content) => {
        const {rerender} = await renderWithProviders(page());
        expect(screen.getByTestId(content)).toBeTruthy();

        mockRatingNoteOpen = true;
        await rerender(page());
        expect(screen.queryByTestId(content)).toBeNull();
        expect(screen.getByTestId(content, {includeHiddenElements: true})).toBeTruthy();

        mockRatingNoteOpen = false;
        await rerender(page());
        expect(screen.getByTestId(content)).toBeTruthy();
    });
});

describe("the roaster list", () => {
    it.each([
        ["roaster list", (settings: ReturnType<typeof subscribed>) => <RoastersScreen settings={settings}/>],
        ["roaster's coffees", (settings: ReturnType<typeof subscribed>) =>
            <RoasterScreen settings={settings} feedUrl={FEED_URL}/>]
    ])("refreshes the %s cache age at midnight", async (_name, page) => {
        jest.useFakeTimers();
        const midnight = new Date(2026, 9, 20).getTime();
        jest.setSystemTime(midnight - 10_000);
        const settings = memorySettings();
        const {feed, body} = feedBody([{id: "a"}]);
        subscribe(settings, FEED_URL, feed, body, midnight - 3 * 86_400_000);
        try {
            await renderWithProviders(page(settings));
            expect(screen.getByText(/Updated 2 d ago/)).toBeTruthy();
            await act(async () => { jest.advanceTimersByTime(10_000); });
            expect(screen.getByText(/Updated 3 d ago/)).toBeTruthy();
        } finally {
            jest.useRealTimers();
        }
    });

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

    it("manages every subscription from the end of the list", async () => {
        await renderWithProviders(<RoastersScreen settings={subscribed()} now={() => 1000}/>);
        await fireEvent.press(screen.getByTestId("roasters-manage"));
        expect(router.push).toHaveBeenCalledWith("/subscriptions");
    });
});

describe("a roaster's coffees", () => {
    it("hides sold-out coffees until IN STOCK is turned off, from the cache alone", async () => {
        const library = memoryLibrary();
        await renderWithProviders(<RoasterScreen settings={subscribed()} feedUrl={FEED_URL}/>);
        expect(rowIds()).toEqual(["roaster-coffee-b"]);
        expect(screen.getByTestId("screen-header-subtitle").props.children).toBe("1 coffee");
        // The count is a line of its own, not a superscript a long name clips.
        expect(screen.queryByTestId("screen-title-count")).toBeNull();

        await fireEvent.press(screen.getByTestId("roaster-filter-in-stock"));
        expect(rowIds()).toEqual(["roaster-coffee-b", "roaster-coffee-a"]);
        expect(screen.getAllByTestId("roaster-row-sold-out")).toHaveLength(1);
        expect(library.fetched).toEqual([]);

        await fireEvent.press(screen.getByTestId("roaster-coffee-b"));
        expect(router.push).toHaveBeenCalledWith({
            pathname: "/roasterCoffee", params: {feed: FEED_URL, coffee: "b"}
        });
    });

    it("ends with a way to this roaster's own subscription", async () => {
        await renderWithProviders(<RoasterScreen settings={subscribed()} feedUrl={FEED_URL}/>);
        await fireEvent.press(screen.getByLabelText("Manage feed"));
        expect(router.push).toHaveBeenCalledWith({pathname: "/subscription", params: {feed: FEED_URL}});
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
        expect(screen.getByTestId("screen-header-subtitle", {includeHiddenElements: true})
            .props.children).toBe("1 of 3 coffees");
    });

    it("keeps the first chip clear of the edge and fades whichever end is cut off", async () => {
        await renderWithProviders(<RoasterScreen settings={shelf()} feedUrl={FEED_URL}/>);
        const rail = screen.getByTestId("roaster-rail");
        expect(StyleSheet.flatten(rail.props.contentContainerStyle).paddingHorizontal).toBe(13);
        // At rest with everything showing, no fade.
        expect(screen.queryByTestId("rail-fade-start")).toBeNull();
        expect(screen.queryByTestId("rail-fade-end")).toBeNull();

        await fireEvent(rail, "layout", {nativeEvent: {layout: {x: 0, y: 0, width: 360, height: 48}}});
        await fireEvent(rail, "contentSizeChange", 600, 48);
        expect(screen.queryByTestId("rail-fade-start")).toBeNull();
        expect(screen.getByTestId("rail-fade-end")).toBeTruthy();

        await fireEvent.scroll(rail, {nativeEvent: {contentOffset: {x: 120, y: 0}}});
        expect(screen.getByTestId("rail-fade-start")).toBeTruthy();
        expect(screen.getByTestId("rail-fade-end")).toBeTruthy();

        await fireEvent.scroll(rail, {nativeEvent: {contentOffset: {x: 240, y: 0}}});
        expect(screen.getByTestId("rail-fade-start")).toBeTruthy();
        expect(screen.queryByTestId("rail-fade-end")).toBeNull();
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
            await act(async () => { jest.advanceTimersByTime(TYPING_DEBOUNCE_MS); });
            expect(rowIds()).toEqual(["roaster-coffee-a"]);

            await fireEvent.changeText(screen.getByTestId("rail-search-input"), "nothing like it");
            await act(async () => { jest.advanceTimersByTime(TYPING_DEBOUNCE_MS); });
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

describe("buying a bag", () => {
    const NativeNumberFormat = Intl.NumberFormat;

    beforeEach(() => {
        jest.spyOn(Intl, "NumberFormat").mockImplementation((locales, options) =>
            new NativeNumberFormat(locales ?? "en-AU", options)
        );
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    function shop() {
        const parsed = JSON.parse(feedJson([{id: "b"}]));
        parsed.roaster.add_to_cart = "https://roaster.example/cart/add?id={variant_id}&quantity=1";
        parsed.coffees[0].variants = [
            {id: 11, grams: 320, price: 53, currency: "AUD", available: false},
            {id: 22, grams: 160, price: 28, currency: "AUD", available: true}
        ];
        const text = JSON.stringify(parsed);
        const settings = memorySettings();
        subscribe(settings, FEED_URL, parseRoasterFeed(text)!, text, 1000);
        return settings;
    }

    it("lists each bag with its price, buys one in the browser and says sold out", async () => {
        const open = jest.spyOn(Linking, "openURL").mockResolvedValue(true);
        await renderWithProviders(
            <RoasterCoffeeScreen settings={shop()} feedUrl={FEED_URL} coffeeId="b"
                                 library={memoryLibrary().deps} shelves={() => []}/>
        );
        expect(screen.getByText("320 g · $53")).toBeTruthy();
        expect(screen.getByText("160 g · $28")).toBeTruthy();
        // The plain size list steps aside for the priced one.
        expect(screen.queryByTestId("roaster-coffee-bags")).toBeNull();

        // Sold out while the coffee is on sale: it says so, and offers to
        // say when this size is back.
        expect(screen.getByText("SOLD OUT")).toBeTruthy();
        expect(screen.getByTestId("buy-11-watch")).toBeTruthy();
        expect(screen.queryByTestId("buy-11-link")).toBeNull();
        await fireEvent.press(screen.getByTestId("buy-22-link"));
        expect(open).toHaveBeenCalledWith("https://roaster.example/cart/add?id=22&quantity=1");
        open.mockRestore();
    });

    it("keeps the plain size list when the feed sells nothing", async () => {
        await renderWithProviders(
            <RoasterCoffeeScreen settings={subscribed()} feedUrl={FEED_URL} coffeeId="b"
                                 library={memoryLibrary().deps} shelves={() => []}/>
        );
        expect(screen.queryByTestId("roaster-coffee-buy")).toBeNull();
        expect(screen.getByTestId("roaster-coffee-bags")).toBeTruthy();
    });
});

describe("adding to a shelf with a bag", () => {
    function shop(tracker?: string) {
        const parsed = JSON.parse(feedJson([{id: "b"}]));
        parsed.coffees[0].variants = [
            {id: 11, grams: 320, price: 53, currency: "AUD", available: true},
            {id: 22, grams: 160, price: 28, currency: "AUD", available: true}
        ];
        const text = JSON.stringify(parsed);
        const settings = memorySettings();
        if (tracker !== undefined) settings.set("bagTracker", tracker);
        subscribe(settings, FEED_URL, parseRoasterFeed(text)!, text, 1000);
        return settings;
    }

    /** Press until the sheet takes it: its entrance discards early presses. */
    async function pressUntil(testID: string, landed: () => void) {
        await waitFor(async () => {
            await fireEvent.press(screen.getByTestId(testID));
            landed();
        }, {timeout: SHEET_PRESS_TIMEOUT});
    }

    const shelfOffered = () => expect(screen.getByTestId("shelf-choice-Pantry")).toBeTruthy();

    it("asks for the bag first, from the roaster's sizes and prices, then makes it on the shelf", async () => {
        const settings = shop();
        const library = memoryLibrary();
        const saved: CoffeeBag[] = [];
        await renderWithProviders(
            <RoasterCoffeeScreen settings={settings} feedUrl={FEED_URL} coffeeId="b"
                                 library={library.deps} shelves={() => ["Pantry"]}
                                 bagStore={{save: (bag) => saved.push(bag)}}/>
        );
        await waitFor(() => expect(screen.queryByTestId("roaster-coffee-loading")).toBeNull());
        await fireEvent.press(screen.getByTestId("roaster-coffee-shelf"));

        // The catalogue's sizes, not the usual presets, and the price follows.
        await waitFor(() => expect(screen.getByTestId("bag-size-160")).toBeTruthy());
        expect(screen.queryByTestId("roaster-coffee-scroll")).toBeNull();
        expect(screen.getByTestId("roaster-coffee-scroll", {includeHiddenElements: true})).toBeTruthy();
        expect(screen.queryByTestId("bag-size-250")).toBeNull();
        expect(screen.getByTestId("bag-price-field").props.value).toBe("53");
        await pressUntil("bag-size-160",
                         () => expect(screen.getByTestId("bag-price-field").props.value).toBe("28"));
        // The same calendar as the editor's sheet, starting on today.
        expect(screen.getByTestId("bag-roasted-value")).toHaveTextContent(/^Today, \d+ \w+$/);
        await fireEvent.press(screen.getByTestId("bag-roasted-field"));
        const pick = Platform.OS === "android"
            ? (DateTimePickerAndroid.open as jest.Mock).mock.calls.at(-1)[0].onValueChange
            : screen.getByTestId("bag-roasted-calendar").props.onValueChange;
        await act(() => pick({nativeEvent: {}}, new Date(2026, 9, 12, 21, 30)));
        await pressUntil("bag-save", shelfOffered);

        await waitFor(async () => {
            await fireEvent.press(screen.getByTestId("shelf-choice-Pantry"));
            expect(library.find("b-18g")?.tags[0]).toBe("Pantry");
        }, {timeout: SHEET_PRESS_TIMEOUT});
        expect(saved).toHaveLength(1);
        expect(saved[0]).toMatchObject({
            recipeUuid: library.find("b-18g")!.uuid, sizeGrams: 160, price: 28, roastedOn: "2026-10-12"
        });
        expect(saved[0].beanName).toBeUndefined();
        expect(screen.getByTestId("roaster-coffee-scroll")).toBeTruthy();
    });

    it("hands the bag to Beanconqueror in that mode, as the editor does", async () => {
        const open = jest.spyOn(Linking, "openURL").mockResolvedValue(true);
        const settings = shop("beanconqueror");
        const library = memoryLibrary();
        const saved: CoffeeBag[] = [];
        await renderWithProviders(
            <RoasterCoffeeScreen settings={settings} feedUrl={FEED_URL} coffeeId="b"
                                 library={library.deps} shelves={() => ["Pantry"]}
                                 bagStore={{save: (bag) => saved.push(bag)}}/>
        );
        await waitFor(() => expect(screen.queryByTestId("roaster-coffee-loading")).toBeNull());
        await fireEvent.press(screen.getByTestId("roaster-coffee-shelf"));
        await waitFor(() => expect(screen.getByTestId("bag-save")).toBeTruthy());
        expect(screen.queryByTestId("bag-bean-name-field")).toBeNull();
        expect(screen.getByTestId("bag-bean-name")).toHaveTextContent("Coffee b");
        await pressUntil("bag-save", shelfOffered);
        await waitFor(async () => {
            await fireEvent.press(screen.getByTestId("shelf-choice-Pantry"));
            expect(saved).toHaveLength(1);
        }, {timeout: SHEET_PRESS_TIMEOUT});
        expect(saved[0].beanName).toBeTruthy();
        expect(open).toHaveBeenCalledWith(expect.stringMatching(/beanconqueror|^https:/i));
        open.mockRestore();
    });

    it("makes no bag when the shelf is never chosen", async () => {
        const settings = shop();
        const saved: CoffeeBag[] = [];
        await renderWithProviders(
            <RoasterCoffeeScreen settings={settings} feedUrl={FEED_URL} coffeeId="b"
                                 library={memoryLibrary().deps} shelves={() => ["Pantry"]}
                                 bagStore={{save: (bag) => saved.push(bag)}}/>
        );
        await waitFor(() => expect(screen.queryByTestId("roaster-coffee-loading")).toBeNull());
        await fireEvent.press(screen.getByTestId("roaster-coffee-shelf"));
        await pressUntil("bag-save", shelfOffered);
        expect(saved).toHaveLength(0);
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
                                 library={library.deps} shelves={shelves}
                                 bagStore={{save: () => {}}}/>
        );
        await waitFor(() => expect(screen.queryByTestId("roaster-coffee-loading")).toBeNull());
        return {settings, library};
    }

    /**
     * ADD TO SHELF onto Pantry, the one way a coffee is saved from here: it
     * goes to the library first, then onto the shelf.
     */
    /** Saves the bag sheet ADD TO SHELF opens here, until `next` holds. */
    async function bagThen(next: () => void): Promise<void> {
        await waitFor(async () => {
            const save = screen.queryByTestId("bag-save");
            if (save !== null) await fireEvent.press(save);
            next();
        }, {timeout: SHEET_PRESS_TIMEOUT});
    }

    async function shelve(): Promise<void> {
        const before = mockNotify.mock.calls.length;
        await fireEvent.press(screen.getByTestId("roaster-coffee-shelf"));
        // The bag comes first on this branch; see "adding to a shelf with a bag".
        await bagThen(() => expect(screen.getByTestId("shelf-choice-Pantry")).toBeTruthy());
        await waitFor(async () => {
            if (mockNotify.mock.calls.length === before) {
                await fireEvent.press(screen.getByTestId("shelf-choice-Pantry"));
            }
            expect(mockNotify).toHaveBeenLastCalledWith({tone: "success", message: "Added to Pantry."});
            expect(mockNotify.mock.calls.length).toBeGreaterThan(before);
        }, {timeout: SHEET_PRESS_TIMEOUT});
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

    it("names a copy that followed xBloom's own name when it is added again", async () => {
        const settings = subscribed();
        const library = memoryLibrary();
        await open(settings, library);
        await shelve();
        expect(library.all()).toHaveLength(1);
        // The copy an earlier link left, following xBloom's name.
        const held = library.find("b-18g")!;
        held.name = "";
        library.deps.save(held);

        await shelve();
        expect(library.find("b-18g")?.name).toBe("Coffee b - 18g");
        expect(library.all()).toHaveLength(1);
    });

    it("never renames a copy the user named", async () => {
        const settings = subscribed();
        const library = memoryLibrary();
        await open(settings, library);
        await shelve();
        expect(library.all()).toHaveLength(1);
        const held = library.find("b-18g")!;
        held.name = "Saturday Peru";
        library.deps.save(held);

        await shelve();
        expect(mockNotify).toHaveBeenCalledTimes(2);
        expect(library.find("b-18g")?.name).toBe("Saturday Peru");
    });

    it("tags the recipe with the roaster's tags and draws its flavours", async () => {
        const settings = subscribedTo([{id: "b"}], {b: {
            flavours: ["Dark Chocolate", "Vanilla"], tags: ["Berry", "Filter"]
        }});
        const library = memoryLibrary();
        await renderWithProviders(
            <RoasterCoffeeScreen settings={settings} feedUrl={FEED_URL} coffeeId="b"
                                 library={library.deps} shelves={() => ["Pantry"]}/>
        );
        await waitFor(() => expect(screen.queryByTestId("roaster-coffee-loading")).toBeNull());
        expect(screen.getByText("DARK CHOCOLATE")).toBeTruthy();
        expect(screen.getByTestId("roaster-coffee-tags").props.children).toBe("Berry · Filter");

        await shelve();
        expect(library.all()).toHaveLength(1);
        expect(library.find("b-18g")?.tags).toEqual(expect.arrayContaining(["Berry", "Filter"]));
        expect(library.find("b-18g")?.name).toBe("Coffee b - 18g");
    });

    it("offers BREW NOW and ADD TO SHELF, and no separate ADD TO LIBRARY", async () => {
        await open();
        expect(screen.getByTestId("roaster-coffee-brew")).toBeTruthy();
        expect(screen.getByTestId("roaster-coffee-shelf")).toBeTruthy();
        expect(screen.queryByTestId("roaster-coffee-add")).toBeNull();
        expect(screen.queryByText("ADD TO LIBRARY")).toBeNull();
    });

    it("asks before replacing an edited copy, and KEEP MINE leaves it", async () => {
        const settings = subscribed();
        const library = memoryLibrary();
        // The user's earlier copy, since edited.
        const first = await (async () => {
            await open(settings, library);
            await shelve();
            expect(library.all()).toHaveLength(1);
            return library.find("b-18g")!;
        })();
        first.dosage = 20;
        library.deps.save(first);
        library.serve("b-18g", 61);

        await fireEvent.press(screen.getByTestId("roaster-coffee-shelf"));
        await bagThen(() => expect(screen.getByTestId("newer-version")).toBeTruthy());
        await fireEvent.press(screen.getByTestId("newer-version-keep"));

        expect(library.find("b-18g")).toMatchObject({dosage: 20, grindSize: 50});
        expect(library.all()).toHaveLength(1);
    });

    it("USE THE ROASTER'S LATEST takes the new recipe and keeps the user's name", async () => {
        const settings = subscribed();
        const library = memoryLibrary();
        await open(settings, library);
        await shelve();
        expect(library.all()).toHaveLength(1);
        const mine = library.find("b-18g")!;
        mine.dosage = 20;
        mine.name = "Mine";
        library.deps.save(mine);
        expect(JSON.parse(settings.get("importFingerprints"))[mine.uuid]).not.toBe(contentPrint(mine));
        library.serve("b-18g", 61);

        await fireEvent.press(screen.getByTestId("roaster-coffee-shelf"));
        await bagThen(() => expect(screen.getByTestId("newer-version")).toBeTruthy());
        await fireEvent.press(screen.getByTestId("newer-version-latest"));

        expect(library.find("b-18g")).toMatchObject({grindSize: 61, name: "Mine"});
    });

    it("adds it to a shelf the user picks", async () => {
        const {library, settings} = await open();
        await fireEvent.press(screen.getByTestId("roaster-coffee-shelf"));
        // The bag comes first on this branch; see "adding to a shelf with a bag".
        await waitFor(async () => {
            await fireEvent.press(screen.getByTestId("bag-save"));
            expect(screen.getByTestId("shelf-choice-Pantry")).toBeTruthy();
        }, {timeout: SHEET_PRESS_TIMEOUT});
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
