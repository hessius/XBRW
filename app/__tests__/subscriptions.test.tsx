import React from "react";
import {Linking, StyleSheet} from "react-native";
import {fireEvent, screen, waitFor} from "@testing-library/react-native";
import {router} from "expo-router";

import SubscriptionScreen from "@/app/subscription";
import SubscriptionsScreen from "@/app/subscriptions";
import {refreshAllMessage} from "@/hooks/useRoasterSubscriptions";
import {readCatalogue} from "@/library/roasterCatalogue";
import {readSubscriptions, resetSyncLockForTests, subscribe, updateSubscription} from "@/library/roasterSync";
import {countLine, rowLine, statusLine} from "@/library/subscriptionStatus";
import {renderWithProviders, SHEET_PRESS_TIMEOUT, TEST_INSETS} from "@/test-utils/render";
import {FEED_URL, feedBody, memorySettings} from "@/test-utils/roasterFeed";

jest.mock("expo-router", () => ({
    router: {push: jest.fn(), back: jest.fn(), dismissTo: jest.fn()},
    useLocalSearchParams: () => ({})
}));

const mockNotify = jest.fn();
jest.mock("@/components/XbrwToast", () => ({
    __esModule: true,
    notify: (...args: unknown[]) => mockNotify(...args)
}));

const NOW = 2_000_000_000_000;
const HOUR = 60 * 60 * 1000;
const OTHER_URL = "https://other-roaster.example/feed";

function subscribed(patch: Parameters<typeof updateSubscription>[2] = (sub) => sub) {
    const settings = memorySettings();
    const {feed, body} = feedBody([{id: "a"}, {id: "b"}, {id: "c", available: false}]);
    subscribe(settings, FEED_URL, feed, body, NOW - 2 * HOUR);
    updateSubscription(settings, FEED_URL, patch);
    return settings;
}

/** Two roasters, the second one paused. */
function twoRoasters() {
    const settings = subscribed();
    const {feed, body} = feedBody([{id: "x"}], "Other Roaster");
    subscribe(settings, OTHER_URL, feed, body, NOW - 2 * HOUR);
    updateSubscription(settings, OTHER_URL, (sub) => ({...sub, paused: true}));
    return settings;
}

const fetched = () => jest.fn(async () => feedBody([{id: "a"}, {id: "b"}, {id: "d"}]));

async function drawList(settings = memorySettings(), fetchBody = fetched()) {
    await renderWithProviders(
        <SubscriptionsScreen settings={settings} fetchBody={fetchBody} now={() => NOW}/>
    );
    return {settings, fetchBody};
}

async function drawDetail(settings = memorySettings(), fetchBody = fetched()) {
    await renderWithProviders(
        <SubscriptionScreen settings={settings} feedUrl={FEED_URL} fetchBody={fetchBody} now={() => NOW}/>
    );
    return {settings, fetchBody};
}

beforeEach(() => {
    mockNotify.mockReset();
    (router.push as jest.Mock).mockReset();
    (router.dismissTo as jest.Mock).mockReset();
    resetSyncLockForTests();
});

describe("the subscriptions list", () => {
    it("is titled Roaster feeds and explains where roasters come from when there are none", async () => {
        await drawList();
        expect(screen.getByText("Roaster feeds")).toBeTruthy();
        expect(screen.getByText("Roasters appear here when you subscribe from a roaster's import link."))
            .toBeTruthy();
        expect(screen.queryByText("Refresh all")).toBeNull();
    });

    it("ends its scroll clear of the bottom bar", async () => {
        await drawList(subscribed());
        const style = StyleSheet.flatten(screen.getByTestId("subscriptions-scroll").props.contentContainerStyle);
        expect(style.paddingBottom).toBe(Math.max(48, TEST_INSETS.bottom + 24));
    });

    it("draws one row per roaster with its coffees and how fresh they are", async () => {
        await drawList(twoRoasters());
        expect(screen.getByText("YOUR ROASTERS")).toBeTruthy();
        expect(screen.getByLabelText("Test Roaster, 3 coffees · Updated 2 h ago")).toBeTruthy();
        expect(screen.getByLabelText("Other Roaster, 1 coffee · Paused")).toBeTruthy();
        // The actions live on each roaster's own screen now, not in the list.
        expect(screen.queryByText("Unsubscribe")).toBeNull();
        expect(screen.queryByText("Browse coffees")).toBeNull();
    });

    it("says when a roaster could not be updated", async () => {
        await drawList(subscribed((sub) => ({...sub, lastError: "network"})));
        expect(screen.getByText("3 coffees · Couldn't update")).toBeTruthy();
    });

    it("opens a roaster's own screen", async () => {
        await drawList(subscribed());
        await fireEvent.press(screen.getByText("Test Roaster"));
        expect(router.push).toHaveBeenCalledWith({pathname: "/subscription", params: {feed: FEED_URL}});
    });

    it("refreshes every roaster that is not paused, with one toast", async () => {
        const settings = twoRoasters();
        // A second roaster that is not paused, so the run covers two.
        const third = "https://third.example/feed";
        const {feed, body} = feedBody([{id: "t"}], "Third Roaster");
        subscribe(settings, third, feed, body, NOW - 2 * HOUR);
        const fetchBody = fetched();
        await drawList(settings, fetchBody);

        expect(screen.getByText("Checks every roaster that isn't paused.")).toBeTruthy();
        await fireEvent.press(screen.getByText("Refresh all"));

        await waitFor(() => expect(mockNotify).toHaveBeenCalled());
        expect(fetchBody.mock.calls.map((call) => (call as unknown[])[0])).toEqual([FEED_URL, third]);
        expect(mockNotify).toHaveBeenCalledTimes(1);
        expect(mockNotify).toHaveBeenCalledWith({tone: "success", message: "2 roasters updated."});
        expect(readCatalogue(settings, FEED_URL)?.feed.coffees.map((coffee) => coffee.id))
            .toEqual(["a", "b", "d"]);
        // The paused roaster kept its catalogue as it was.
        expect(readCatalogue(settings, OTHER_URL)?.feed.coffees.map((coffee) => coffee.id))
            .toEqual(["x"]);
    });

    it("is not offered when every roaster is paused", async () => {
        await drawList(subscribed((sub) => ({...sub, paused: true})));
        expect(screen.queryByText("Refresh all")).toBeNull();
    });

    it("lists roasters the user asked not to be asked about, and can ask again", async () => {
        const settings = memorySettings();
        settings.set("roasterFeedOptOut", JSON.stringify(["https://other.example/feed"]));
        await drawList(settings);

        expect(screen.getByText("ASKED NOT TO")).toBeTruthy();
        await fireEvent.press(screen.getByText("other.example/feed"));

        expect(JSON.parse(settings.get("roasterFeedOptOut"))).toEqual([]);
        expect(screen.queryByText("other.example/feed")).toBeNull();
    });
});

describe("a roaster's subscription", () => {
    it("makes Show in Import an explicit, persistent choice that can be removed", async () => {
        const settings = subscribed();
        await drawDetail(settings);
        expect(screen.getByRole("switch", {name: "Show in Import", checked: false})).toBeTruthy();
        await fireEvent.press(screen.getByRole("switch", {name: "Show in Import"}));
        expect(readSubscriptions(settings)[0].pinnedAt).toBe(NOW);
        expect(screen.getByRole("switch", {name: "Show in Import", checked: true})).toBeTruthy();
        await fireEvent.press(screen.getByRole("switch", {name: "Show in Import"}));
        expect(readSubscriptions(settings)[0].pinnedAt).toBeUndefined();
    });

    it("visibly refuses a fourth choice without changing any subscription", async () => {
        const settings = subscribed();
        const {feed, body} = feedBody([{id: "a"}]);
        for (let i = 1; i <= 3; i++) {
            const url = `https://other${i}.example/feed`;
            subscribe(settings, url, feed, body, NOW);
            updateSubscription(settings, url, (s) => ({...s, pinnedAt: i}));
        }
        const before = settings.get("roasterSubscriptions");
        await drawDetail(settings);
        await fireEvent.press(screen.getByRole("switch", {name: "Show in Import"}));
        expect(settings.get("roasterSubscriptions")).toBe(before);
        expect(mockNotify).toHaveBeenCalledWith({
            tone: "info", message: "Choose up to 3 roasters for Import. Remove a choice first."
        });
        expect(screen.getByRole("switch", {name: "Show in Import", checked: false})).toBeTruthy();
    });

    it("exposes a legacy fourth choice as selected and still allows removal", async () => {
        const settings = subscribed((s) => ({...s, pinnedAt: 4}));
        const {feed, body} = feedBody([{id: "a"}]);
        for (let i = 1; i <= 3; i++) {
            const url = `https://other${i}.example/feed`;
            subscribe(settings, url, feed, body, NOW);
            updateSubscription(settings, url, (s) => ({...s, pinnedAt: i}));
        }
        await drawDetail(settings);
        expect(screen.getByRole("switch", {name: "Show in Import", checked: true})).toBeTruthy();
        await fireEvent.press(screen.getByRole("switch", {name: "Show in Import"}));
        expect(readSubscriptions(settings).filter((s) => s.pinnedAt !== undefined)).toHaveLength(3);
    });

    it("names the roaster and says what it holds and how fresh it is", async () => {
        await drawDetail(subscribed());
        expect(screen.getByText("Test Roaster")).toBeTruthy();
        expect(screen.getByText("3 coffees · 1 sold out")).toBeTruthy();
        expect(screen.getByText("Updated 2 h ago.")).toBeTruthy();
    });

    it("says why the last update failed", async () => {
        await drawDetail(subscribed((sub) => ({...sub, lastError: "network"})));
        expect(screen.getByText("Couldn't update: no connection to the roaster.")).toBeTruthy();
    });

    it("opens the roaster's coffees", async () => {
        await drawDetail(subscribed());
        await fireEvent.press(screen.getByText("Browse coffees"));
        expect(router.push).toHaveBeenCalledWith({pathname: "/roaster", params: {feed: FEED_URL}});
    });

    it("opens the roaster's site, named for the roaster", async () => {
        const open = jest.spyOn(Linking, "openURL").mockResolvedValue(true);
        await drawDetail(subscribed());

        await fireEvent.press(screen.getByText("Open Test Roaster's site"));

        expect(open).toHaveBeenCalledWith("https://roaster.example");
        open.mockRestore();
    });

    it("offers no site row when the feed names no site", async () => {
        await drawDetail(subscribed((sub) => {
            const next = {...sub};
            delete next.roasterUrl;
            return next;
        }));
        expect(screen.queryByText(/'s site$/)).toBeNull();
    });

    it("refreshes the catalogue now", async () => {
        const {settings, fetchBody} = await drawDetail(subscribed());

        await fireEvent.press(screen.getByText("Refresh now"));

        await waitFor(() => expect(mockNotify).toHaveBeenCalled());
        expect(fetchBody).toHaveBeenCalledTimes(1);
        expect(readCatalogue(settings, FEED_URL)?.feed.coffees.map((coffee) => coffee.id))
            .toEqual(["a", "b", "d"]);
        expect(mockNotify).toHaveBeenCalledWith({tone: "success", message: "Test Roaster: 3 coffees."});
    });

    it("pauses and resumes updates", async () => {
        const {settings} = await drawDetail(subscribed());

        await fireEvent.press(screen.getByText("Pause updates"));
        expect(readSubscriptions(settings)[0].paused).toBe(true);
        expect(screen.getByText("Updates paused.")).toBeTruthy();

        await fireEvent.press(screen.getByText("Resume updates"));
        expect(readSubscriptions(settings)[0].paused).toBe(false);
    });

    it("asks before unsubscribing, removes only the catalogue, and goes back to the list", async () => {
        const {settings} = await drawDetail(subscribed());

        await fireEvent.press(screen.getByText("Unsubscribe"));
        expect(screen.getByText("Test Roaster's coffees leave the catalogue. Recipes in your library stay."))
            .toBeTruthy();
        await waitFor(async () => {
            await fireEvent.press(screen.getByTestId("unsubscribe-confirm"));
            expect(readSubscriptions(settings)).toEqual([]);
        }, {timeout: SHEET_PRESS_TIMEOUT});
        expect(readCatalogue(settings, FEED_URL)).toBeNull();
        expect(router.dismissTo).toHaveBeenCalledWith("/subscriptions");
    });

    it("keeps the subscription when the question is dismissed", async () => {
        const {settings} = await drawDetail(subscribed());

        await fireEvent.press(screen.getByText("Unsubscribe"));
        await waitFor(async () => {
            await fireEvent.press(screen.getByTestId("unsubscribe-cancel"));
            expect(screen.getByTestId("subscription-content", {includeHiddenElements: true})
                .props.importantForAccessibility).toBe("auto");
        }, {timeout: SHEET_PRESS_TIMEOUT});
        expect(readSubscriptions(settings)).toHaveLength(1);
        expect(router.dismissTo).not.toHaveBeenCalled();
    });

    it("says so when the roaster is no longer subscribed", async () => {
        await drawDetail(memorySettings());
        expect(screen.getByTestId("subscription-missing")).toBeTruthy();
    });
});

describe("status wording", () => {
    it("says when a subscription has not updated yet, and counts what it holds", () => {
        const settings = subscribed((sub) => ({...sub, lastSync: 0}));
        expect(statusLine(readSubscriptions(settings)[0], NOW)).toBe("Not updated yet.");
        expect(countLine(null)).toBe("Not loaded yet");
    });

    it("gives a row a single line in every state", () => {
        const sub = readSubscriptions(subscribed())[0];
        const feed = readCatalogue(subscribed(), FEED_URL)!.feed;
        expect(rowLine(sub, feed, NOW)).toBe("3 coffees · Updated 2 h ago");
        expect(rowLine({...sub, paused: true}, feed, NOW)).toBe("3 coffees · Paused");
        expect(rowLine({...sub, lastError: "unreadable"}, feed, NOW)).toBe("3 coffees · Couldn't update");
        expect(rowLine({...sub, lastSync: 0}, feed, NOW)).toBe("3 coffees · Not updated yet");
        expect(rowLine(sub, null, NOW)).toBe("Loading coffees");
        expect(rowLine({...sub, lastError: "network"}, null, NOW)).toBe("Couldn't update");
    });

    it("reports REFRESH ALL once, naming what failed", () => {
        const ok = {ok: true, feed: feedBody([{id: "a"}]).feed, back: []} as never;
        const down = {ok: false, reason: "network"} as const;
        expect(refreshAllMessage([])).toBeNull();
        expect(refreshAllMessage([{roaster: "A", result: ok}]))
            .toEqual({tone: "success", message: "A: 1 coffee."});
        expect(refreshAllMessage([{roaster: "A", result: ok}, {roaster: "B", result: down}]))
            .toEqual({tone: "error", message: "Couldn't update B."});
        expect(refreshAllMessage([{roaster: "A", result: down}, {roaster: "B", result: down}]))
            .toEqual({tone: "error", message: "Couldn't update your roasters. Check your connection."});
    });
});
