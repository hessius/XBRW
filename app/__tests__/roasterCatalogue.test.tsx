import React from "react";
import {fireEvent, screen, waitFor} from "@testing-library/react-native";
import {router} from "expo-router";

import RoasterScreen from "@/app/roaster";
import RoasterCoffeeScreen from "@/app/roasterCoffee";
import RoastersScreen from "@/app/roasters";
import {parseHidden} from "@/library/hiddenShelves";
import {contentPrint} from "@/library/importRefresh";
import {subscribe} from "@/library/roasterSync";
import {renderWithProviders, SHEET_PRESS_TIMEOUT} from "@/test-utils/render";
import {FEED_URL, feedBody, memoryLibrary, memorySettings} from "@/test-utils/roasterFeed";

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

beforeEach(() => {
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
    it("lists coffees on sale first and sold out after, from the cache alone", async () => {
        const library = memoryLibrary();
        await renderWithProviders(<RoasterScreen settings={subscribed()} feedUrl={FEED_URL}/>);
        const rows = screen.getAllByTestId(/^roaster-coffee-/).map((node) => node.props.testID);
        expect(rows).toEqual(["roaster-coffee-b", "roaster-coffee-a"]);
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
