import React from "react";
import {fireEvent, screen} from "@testing-library/react-native";

import RoasterScreen from "@/app/roaster";
import RoasterCoffeeScreen from "@/app/roasterCoffee";
import RoastersScreen from "@/app/roasters";
import {announceBack} from "@/hooks/useRoasterSubscriptions";
import {bagWatchKey, readAlerts, setWatch} from "@/library/roasterAlerts";
import {parseRoasterFeed} from "@/library/roasterFeed";
import {forgetQueriesForTests} from "@/library/roasterFilters";
import {resetSyncLockForTests, subscribe, syncSubscription} from "@/library/roasterSync";
import type {Settings} from "@/library/Settings";
import {renderWithProviders} from "@/test-utils/render";
import {
    FEED_URL, feedBody, feedJson, memoryLibrary, memorySettings, type CoffeeSpec
} from "@/test-utils/roasterFeed";

jest.mock("expo-router", () => ({
    router: {push: jest.fn(), back: jest.fn()},
    useLocalSearchParams: () => ({})
}));

const mockNotify = jest.fn();
jest.mock("@/components/XbrwToast", () => ({
    __esModule: true,
    notify: (...args: unknown[]) => mockNotify(...args)
}));

/** Subscribed to `before`, then synced to `after`. */
async function syncedTo(before: CoffeeSpec[], after: CoffeeSpec[], watch: string[] = []) {
    resetSyncLockForTests();
    const settings = memorySettings();
    const first = feedBody(before);
    subscribe(settings, FEED_URL, first.feed, first.body, 1000);
    for (const key of watch) setWatch(settings, FEED_URL, key, true);
    const next = feedBody(after);
    const result = await syncSubscription(FEED_URL, {settings, fetchBody: async () => next, now: () => 2000},
                                          {force: true});
    return {settings, result};
}

const badges = () => screen.queryAllByTestId("roaster-row-badge").map((node) => node.props.children);

async function openList(settings: Settings) {
    return renderWithProviders(<RoasterScreen settings={settings} feedUrl={FEED_URL}/>);
}

beforeEach(() => {
    forgetQueriesForTests();
    mockNotify.mockReset();
});

describe("NEW coffees on screen", () => {
    it("shows nothing NEW straight after subscribing", async () => {
        const settings = memorySettings();
        const {feed, body} = feedBody([{id: "a"}, {id: "b"}]);
        subscribe(settings, FEED_URL, feed, body, 1000);
        await renderWithProviders(<RoastersScreen settings={settings} now={() => 1000}/>);
        expect(screen.queryByTestId("roaster-Test Roaster-dot", {includeHiddenElements: true})).toBeNull();
        await openList(settings);
        expect(badges()).toEqual([]);
    });

    it("dots the roaster, tags the coffee for one visit, then lets it go", async () => {
        const {settings} = await syncedTo([{id: "a"}], [{id: "a"}, {id: "b"}]);

        await renderWithProviders(<RoastersScreen settings={settings} now={() => 2000}/>);
        expect(screen.getByTestId("roaster-Test Roaster-dot", {includeHiddenElements: true})).toBeTruthy();
        expect(screen.getByLabelText(/^Test Roaster, 1 new, 2 coffees/)).toBeTruthy();
        await screen.unmount();

        // First visit: tagged, and the dot no longer counts it.
        await openList(settings);
        expect(badges()).toEqual(["NEW"]);
        expect(screen.getByLabelText(/Coffee b, new,/)).toBeTruthy();
        await screen.unmount();
        await renderWithProviders(<RoastersScreen settings={settings} now={() => 2000}/>);
        expect(screen.queryByTestId("roaster-Test Roaster-dot", {includeHiddenElements: true})).toBeNull();
        await screen.unmount();

        // Second visit: gone.
        await openList(settings);
        expect(badges()).toEqual([]);
    });

    it("tags the coffee's own screen when it is opened, and clears it", async () => {
        const {settings} = await syncedTo([{id: "a"}], [{id: "a"}, {id: "b"}]);
        await renderWithProviders(
            <RoasterCoffeeScreen settings={settings} feedUrl={FEED_URL} coffeeId="b"
                                 library={memoryLibrary().deps} shelves={() => []}/>
        );
        expect(screen.getByTestId("roaster-coffee-badge").props.children).toBe("NEW");
        expect(readAlerts(settings, FEED_URL)?.fresh).toEqual([]);
        await screen.unmount();
        await openList(settings);
        expect(badges()).toEqual([]);
    });
});

describe("back in stock on screen", () => {
    it("offers the switch on a sold-out coffee and records the watch", async () => {
        const settings = memorySettings();
        const {feed, body} = feedBody([{id: "a", available: false}]);
        subscribe(settings, FEED_URL, feed, body, 1000);
        await renderWithProviders(
            <RoasterCoffeeScreen settings={settings} feedUrl={FEED_URL} coffeeId="a"
                                 library={memoryLibrary().deps} shelves={() => []}/>
        );
        const toggle = screen.getByTestId("roaster-coffee-watch");
        expect(toggle.props.accessibilityState).toMatchObject({checked: false});
        await fireEvent(toggle, "checkedChange", true);
        expect(readAlerts(settings, FEED_URL)?.watch).toEqual(["a"]);
        expect(screen.getByTestId("roaster-coffee-watch").props.accessibilityState)
            .toMatchObject({checked: true});
        await fireEvent(screen.getByTestId("roaster-coffee-watch"), "checkedChange", false);
        expect(readAlerts(settings, FEED_URL)?.watch).toEqual([]);
    });

    it("has no switch on a coffee that is on sale", async () => {
        const settings = memorySettings();
        const {feed, body} = feedBody([{id: "a"}]);
        subscribe(settings, FEED_URL, feed, body, 1000);
        await renderWithProviders(
            <RoasterCoffeeScreen settings={settings} feedUrl={FEED_URL} coffeeId="a"
                                 library={memoryLibrary().deps} shelves={() => []}/>
        );
        expect(screen.queryByTestId("roaster-coffee-watch")).toBeNull();
    });

    it("watches one sold-out bag of a coffee on sale", async () => {
        const parsed = JSON.parse(feedJson([{id: "b"}]));
        parsed.coffees[0].variants = [
            {id: 11, grams: 320, price: 53, currency: "AUD", available: false},
            {id: 22, grams: 160, price: 28, currency: "AUD", available: true}
        ];
        const text = JSON.stringify(parsed);
        const feed = parseRoasterFeed(text)!;
        const settings = memorySettings();
        subscribe(settings, FEED_URL, feed, text, 1000);
        await renderWithProviders(
            <RoasterCoffeeScreen settings={settings} feedUrl={FEED_URL} coffeeId="b"
                                 library={memoryLibrary().deps} shelves={() => []}/>
        );
        expect(screen.getByText("TELL ME")).toBeTruthy();
        await fireEvent.press(screen.getByTestId("buy-11-watch"));
        expect(readAlerts(settings, FEED_URL)?.watch).toEqual([bagWatchKey(feed.coffees[0], "11")]);
        expect(screen.getByText("WATCHING")).toBeTruthy();
        expect(screen.queryByTestId("buy-22-watch")).toBeNull();
    });

    it("tags the coffee, dots the roaster and announces it once", async () => {
        const {settings, result} = await syncedTo([{id: "a", available: false}, {id: "b"}],
                                                  [{id: "a"}, {id: "b"}], ["a"]);
        announceBack(result);
        expect(mockNotify).toHaveBeenCalledWith({tone: "success", message: "Coffee a is back at Test Roaster."});

        // The next sync has nothing to announce: the watch became a flag.
        const again = await syncSubscription(FEED_URL, {
            settings, fetchBody: async () => feedBody([{id: "a"}, {id: "b"}]), now: () => 3000
        }, {force: true});
        mockNotify.mockReset();
        announceBack(again);
        expect(mockNotify).not.toHaveBeenCalled();

        await renderWithProviders(<RoastersScreen settings={settings} now={() => 3000}/>);
        expect(screen.getByLabelText(/^Test Roaster, 1 back in stock,/)).toBeTruthy();
        await screen.unmount();
        await openList(settings);
        expect(badges()).toEqual(["BACK IN STOCK"]);
        await screen.unmount();

        // Opening it clears it everywhere.
        await renderWithProviders(
            <RoasterCoffeeScreen settings={settings} feedUrl={FEED_URL} coffeeId="a"
                                 library={memoryLibrary().deps} shelves={() => []}/>
        );
        expect(screen.getByTestId("roaster-coffee-badge").props.children).toBe("BACK IN STOCK");
        await screen.unmount();
        await openList(settings);
        expect(badges()).toEqual([]);
    });
});
