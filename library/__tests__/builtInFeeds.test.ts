import {BUILT_IN_FEEDS, isBuiltInOn, setBuiltInOn, type BuiltInFeed} from "@/library/builtInFeeds";
import {readSubscriptions, resetSyncLockForTests, subscribe, syncDue} from "@/library/roasterSync";
import {FEED_URL, feedBody, memorySettings} from "@/test-utils/roasterFeed";

jest.mock("@/library/XBloomRecipe", () => ({__esModule: true, XBloomRecipe: class {}}));
jest.mock("@/library/RecipeDatabase", () => ({
    __esModule: true, default: class { constructor() { throw new Error("must not open the recipe table"); } }
}));

const XBLOOM: BuiltInFeed = {
    feed: "https://approved.example/api/feeds/xbloom", roaster: "xBloom Collective", description: "New releases."
};
beforeEach(() => resetSyncLockForTests());

describe("opt-in built-in feeds", () => {
    it("does not expose an unconfigured production service", () => {
        if (!process.env.EXPO_PUBLIC_XBLOOM_FEED_URL) expect(BUILT_IN_FEEDS).toEqual([]);
    });

    it("starts off and causes no network request on the next foreground sync", async () => {
        const settings = memorySettings();
        const fetchBody = jest.fn(async () => feedBody([{id: "a"}]));
        expect(isBuiltInOn(settings, XBLOOM)).toBe(false);
        expect(await syncDue({settings, fetchBody, now: () => 2_000_000_000_000})).toEqual([]);
        expect(fetchBody).not.toHaveBeenCalled();
    });

    it("subscribes only by explicit choice and off stays off across later syncs", async () => {
        const settings = memorySettings();
        setBuiltInOn(settings, XBLOOM, true);
        expect(isBuiltInOn(settings, XBLOOM)).toBe(true);
        setBuiltInOn(settings, XBLOOM, false);
        const fetchBody = jest.fn();
        await syncDue({settings, fetchBody});
        expect(isBuiltInOn(settings, XBLOOM)).toBe(false);
        expect(fetchBody).not.toHaveBeenCalled();
    });

    it("preserves existing subscriptions and reads an explicitly enabled feed normally", async () => {
        const settings = memorySettings();
        const {feed, body} = feedBody([{id: "a"}]);
        subscribe(settings, FEED_URL, feed, body, 5);
        setBuiltInOn(settings, XBLOOM, true);
        setBuiltInOn(settings, XBLOOM, true);
        expect(readSubscriptions(settings)).toHaveLength(2);
        const fetchBody = jest.fn(async () => ({feed, body}));
        await syncDue({settings, fetchBody, now: () => 2_000_000_000_000});
        expect(fetchBody).toHaveBeenCalledWith(XBLOOM.feed, undefined);
        setBuiltInOn(settings, XBLOOM, false);
        expect(readSubscriptions(settings).map(sub => sub.feed)).toEqual([FEED_URL]);
    });
});
