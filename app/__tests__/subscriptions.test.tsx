import React from "react";
import {Linking, StyleSheet} from "react-native";
import {fireEvent, screen, waitFor} from "@testing-library/react-native";
import {router} from "expo-router";

import SubscriptionsScreen, {countLine, statusLine} from "@/app/subscriptions";
import {readCatalogue} from "@/library/roasterCatalogue";
import {readSubscriptions, resetSyncLockForTests, subscribe, updateSubscription} from "@/library/roasterSync";
import {renderWithProviders, SHEET_PRESS_TIMEOUT, TEST_INSETS} from "@/test-utils/render";
import {FEED_URL, feedBody, memorySettings} from "@/test-utils/roasterFeed";

jest.mock("expo-router", () => ({router: {push: jest.fn(), back: jest.fn()}}));

const mockNotify = jest.fn();
jest.mock("@/components/XbrwToast", () => ({
    __esModule: true,
    notify: (...args: unknown[]) => mockNotify(...args)
}));

const NOW = 2_000_000_000_000;
const HOUR = 60 * 60 * 1000;

function subscribed(patch: Parameters<typeof updateSubscription>[2] = (sub) => sub) {
    const settings = memorySettings();
    const {feed, body} = feedBody([{id: "a"}, {id: "b"}, {id: "c", available: false}]);
    subscribe(settings, FEED_URL, feed, body, NOW - 2 * HOUR);
    updateSubscription(settings, FEED_URL, patch);
    return settings;
}

async function draw(settings = memorySettings()) {
    const fetchBody = jest.fn(async () => feedBody([{id: "a"}, {id: "b"}, {id: "d"}]));
    await renderWithProviders(
        <SubscriptionsScreen settings={settings} fetchBody={fetchBody} now={() => NOW}/>
    );
    return {settings, fetchBody};
}

beforeEach(() => {
    mockNotify.mockReset();
    (router.push as jest.Mock).mockReset();
    resetSyncLockForTests();
});

describe("SubscriptionsScreen", () => {
    it("explains where subscriptions come from when there are none", async () => {
        await draw();
        expect(screen.getByText("Subscriptions appear here when you open a roaster's import link."))
            .toBeTruthy();
    });

    it("ends its scroll clear of the bottom bar", async () => {
        await draw(subscribed());
        const style = StyleSheet.flatten(screen.getByTestId("subscriptions-scroll").props.contentContainerStyle);
        expect(style.paddingBottom).toBe(Math.max(48, TEST_INSETS.bottom + 24));
    });

    it("shows each subscription's coffees and how fresh it is", async () => {
        await draw(subscribed());
        expect(screen.getByText("TEST ROASTER")).toBeTruthy();
        expect(screen.getByText("3 coffees · 1 sold out")).toBeTruthy();
        expect(screen.getByText("Updated 2 h ago.")).toBeTruthy();
    });

    it("says why the last update failed", async () => {
        await draw(subscribed((sub) => ({...sub, lastError: "network"})));
        expect(screen.getByText("Couldn't update: no connection to the roaster.")).toBeTruthy();
    });

    it("opens the roaster's coffees", async () => {
        await draw(subscribed());
        await fireEvent.press(screen.getByText("Browse coffees"));
        expect(router.push).toHaveBeenCalledWith({pathname: "/roaster", params: {feed: FEED_URL}});
    });

    it("refreshes the catalogue now", async () => {
        const {settings, fetchBody} = await draw(subscribed());

        await fireEvent.press(screen.getByText("Refresh now"));

        await waitFor(() => expect(mockNotify).toHaveBeenCalled());
        expect(fetchBody).toHaveBeenCalledTimes(1);
        expect(readCatalogue(settings, FEED_URL)?.feed.coffees.map((coffee) => coffee.id))
            .toEqual(["a", "b", "d"]);
        expect(mockNotify).toHaveBeenCalledWith({tone: "success", message: "Test Roaster: 3 coffees."});
    });

    it("pauses and resumes updates", async () => {
        const {settings} = await draw(subscribed());

        await fireEvent.press(screen.getByText("Pause updates"));
        expect(readSubscriptions(settings)[0].paused).toBe(true);
        expect(screen.getByText("Updates paused.")).toBeTruthy();

        await fireEvent.press(screen.getByText("Resume updates"));
        expect(readSubscriptions(settings)[0].paused).toBe(false);
    });

    it("asks before unsubscribing, then removes only the catalogue", async () => {
        const {settings} = await draw(subscribed());

        await fireEvent.press(screen.getByText("Unsubscribe"));
        expect(screen.getByText("Test Roaster's coffees leave the catalogue. Recipes in your library stay."))
            .toBeTruthy();
        await waitFor(async () => {
            await fireEvent.press(screen.getByTestId("unsubscribe-confirm"));
            expect(readSubscriptions(settings)).toEqual([]);
        }, {timeout: SHEET_PRESS_TIMEOUT});
        expect(readCatalogue(settings, FEED_URL)).toBeNull();
        expect(screen.getByTestId("subscriptions-empty")).toBeTruthy();
    });

    it("keeps the subscription when the question is dismissed", async () => {
        const {settings} = await draw(subscribed());

        await fireEvent.press(screen.getByText("Unsubscribe"));
        await waitFor(async () => {
            await fireEvent.press(screen.getByTestId("unsubscribe-cancel"));
            expect(screen.getByTestId("subscriptions-content", {includeHiddenElements: true})
                .props.importantForAccessibility).toBe("auto");
        }, {timeout: SHEET_PRESS_TIMEOUT});
        expect(readSubscriptions(settings)).toHaveLength(1);
    });

    it("opens the roaster's site", async () => {
        const open = jest.spyOn(Linking, "openURL").mockResolvedValue(true);
        await draw(subscribed());

        await fireEvent.press(screen.getByText("Open roaster's site"));

        expect(open).toHaveBeenCalledWith("https://roaster.example");
        open.mockRestore();
    });

    it("lists roasters the user said not to ask about, and can ask again", async () => {
        const settings = memorySettings();
        settings.set("roasterFeedOptOut", JSON.stringify(["https://other.example/feed"]));
        await draw(settings);

        await fireEvent.press(screen.getByText("other.example/feed"));

        expect(JSON.parse(settings.get("roasterFeedOptOut"))).toEqual([]);
        expect(screen.queryByText("other.example/feed")).toBeNull();
    });
});

describe("status wording", () => {
    it("says when a subscription has not updated yet, and counts what it holds", () => {
        const settings = subscribed((sub) => ({...sub, lastSync: 0}));
        expect(statusLine(readSubscriptions(settings)[0], NOW)).toBe("Not updated yet.");
        expect(countLine(null)).toBe("Not loaded yet");
    });
});
