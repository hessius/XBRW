import React from "react";
import {Linking} from "react-native";
import {fireEvent, screen, waitFor} from "@testing-library/react-native";

import SubscriptionsScreen, {statusLine, updatedAgo} from "@/app/subscriptions";
import {readSubscriptions, resetSyncLockForTests, subscribe, updateSubscription} from "@/library/roasterSync";
import {renderWithProviders, SHEET_PRESS_TIMEOUT} from "@/test-utils/render";
import {FEED_URL, feed, memoryLibrary, memorySettings} from "@/test-utils/roasterFeed";

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
    subscribe(settings, FEED_URL, feed([]), "Test Roaster");
    updateSubscription(settings, FEED_URL, (sub) => patch({
        ...sub,
        lastSync:    NOW - 2 * HOUR,
        lastAttempt: NOW - 2 * HOUR,
        items:       [{shareId: "a-18g"}, {shareId: "b-18g"}, {shareId: "c-18g"}],
        soldOut:     ["c-18g"]
    }));
    return settings;
}

async function draw(settings = memorySettings()) {
    const library = memoryLibrary();
    const fetchFeed = jest.fn(async () => feed([{id: "a"}, {id: "b"}, {id: "d"}]));
    await renderWithProviders(
        <SubscriptionsScreen settings={settings} deps={library.deps}
                             fetchFeed={fetchFeed} now={() => NOW}/>
    );
    return {settings, library, fetchFeed};
}

beforeEach(() => {
    mockNotify.mockReset();
    resetSyncLockForTests();
});

describe("SubscriptionsScreen", () => {
    it("explains where subscriptions come from when there are none", async () => {
        await draw();
        expect(screen.getByTestId("subscriptions-empty")).toBeTruthy();
        expect(screen.getByText("Subscriptions appear here when you open a roaster's import link."))
            .toBeTruthy();
    });

    it("shows each subscription's coffees and how fresh it is", async () => {
        await draw(subscribed());
        expect(screen.getByText("TEST ROASTER")).toBeTruthy();
        expect(screen.getByText("2 coffees · 1 sold out")).toBeTruthy();
        expect(screen.getByText("Updated 2 h ago.")).toBeTruthy();
        expect(screen.queryByTestId("subscriptions-empty")).toBeNull();
    });

    it("says why the last update failed", async () => {
        await draw(subscribed((sub) => ({...sub, lastError: "network"})));
        expect(screen.getByText("Couldn't update: no connection to the roaster.")).toBeTruthy();
    });

    it("refreshes now, adding what is new and marking what sold out", async () => {
        const {fetchFeed, library} = await draw(subscribed());

        await fireEvent.press(screen.getByText("Refresh now"));

        await waitFor(() => expect(mockNotify).toHaveBeenCalled());
        expect(fetchFeed).toHaveBeenCalledTimes(1);
        expect(library.find("d-18g")).toBeDefined();
        expect(mockNotify).toHaveBeenCalledWith({tone: "success", message: "Added 1 coffee. 1 sold out."});
    });

    it("pauses and resumes updates", async () => {
        const {settings} = await draw(subscribed());

        await fireEvent.press(screen.getByText("Pause updates"));
        expect(readSubscriptions(settings)[0].paused).toBe(true);
        expect(screen.getByText("Updates paused.")).toBeTruthy();

        await fireEvent.press(screen.getByText("Resume updates"));
        expect(readSubscriptions(settings)[0].paused).toBe(false);
    });

    it("asks before unsubscribing, then keeps the shelf as an ordinary one", async () => {
        const {settings} = await draw(subscribed());

        await fireEvent.press(screen.getByText("Unsubscribe"));
        expect(screen.getByText("Test Roaster stops getting new coffees. Your shelf and recipes stay."))
            .toBeTruthy();
        await waitFor(async () => {
            await fireEvent.press(screen.getByTestId("unsubscribe-confirm"));
            expect(readSubscriptions(settings)).toEqual([]);
        }, {timeout: SHEET_PRESS_TIMEOUT});
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

        expect(screen.getByText("other.example/feed")).toBeTruthy();
        await fireEvent.press(screen.getByText("other.example/feed"));

        expect(JSON.parse(settings.get("roasterFeedOptOut"))).toEqual([]);
        expect(screen.queryByText("other.example/feed")).toBeNull();
    });
});

describe("status wording", () => {
    it("counts in the units a glance can read", () => {
        expect(updatedAgo(NOW - 10_000, NOW)).toBe("Updated just now");
        expect(updatedAgo(NOW - 5 * 60_000, NOW)).toBe("Updated 5 min ago");
        expect(updatedAgo(NOW - 3 * HOUR, NOW)).toBe("Updated 3 h ago");
        expect(updatedAgo(NOW - 50 * HOUR, NOW)).toBe("Updated 2 d ago");
    });

    it("says when a subscription has not updated yet", () => {
        const settings = memorySettings();
        subscribe(settings, FEED_URL, feed([]), "Test Roaster");
        expect(statusLine(readSubscriptions(settings)[0], NOW)).toBe("Not updated yet.");
    });
});
