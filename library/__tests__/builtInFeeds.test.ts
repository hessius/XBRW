import {
    BUILT_IN_FEEDS, XBLOOM_FEED_URL, isBuiltInOn, seedBuiltInFeeds, setBuiltInOn, type BuiltInFeed
} from "@/library/builtInFeeds";
import {parseSubscriptions} from "@/library/roasterSubscription";
import {readSubscriptions, resetSyncLockForTests, subscribe, syncDue} from "@/library/roasterSync";
import {FEED_URL, feedBody, memorySettings} from "@/test-utils/roasterFeed";

jest.mock("@/library/XBloomRecipe", () => ({__esModule: true, XBloomRecipe: class {}}));
jest.mock("@/library/RecipeDatabase", () => ({
    __esModule: true,
    default: class {
        constructor() { throw new Error("seeding must not open the recipe table"); }
    }
}));

const XBLOOM: BuiltInFeed = BUILT_IN_FEEDS[0];

beforeEach(() => resetSyncLockForTests());

describe("built-in feeds", () => {
    it("ships xBloom's releases from the XBRW++ endpoint", () => {
        expect(XBLOOM).toMatchObject({roaster: "xBloom Collective", feed: XBLOOM_FEED_URL});
        expect(XBLOOM_FEED_URL).toBe("https://xbrwplusplus.vercel.app/api/feeds/xbloom");
    });

    it("switches a built-in feed on the first time, unsynced so the next sync reads it", () => {
        const settings = memorySettings();
        expect(seedBuiltInFeeds(settings)).toBe(true);
        expect(readSubscriptions(settings)).toEqual([{
            feed: XBLOOM_FEED_URL, roaster: "xBloom Collective", lastSync: 0, lastAttempt: 0, paused: false
        }]);
        expect(isBuiltInOn(settings, XBLOOM)).toBe(true);
    });

    it("never switches it back on once it has been met, so off stays off", () => {
        const settings = memorySettings();
        seedBuiltInFeeds(settings);
        setBuiltInOn(settings, XBLOOM, false);
        expect(seedBuiltInFeeds(settings)).toBe(false);
        expect(isBuiltInOn(settings, XBLOOM)).toBe(false);
    });

    it("leaves a subscription to the same feed alone, and keeps other roasters", () => {
        const settings = memorySettings();
        const {feed, body} = feedBody([{id: "a"}]);
        subscribe(settings, FEED_URL, feed, body, 5);
        subscribe(settings, `${XBLOOM_FEED_URL}?v=2`, {...feed, roaster: {name: "Mine"}}, body, 5);
        seedBuiltInFeeds(settings);
        expect(readSubscriptions(settings).map((sub) => sub.roaster)).toEqual(["Test Roaster", "Mine"]);
    });

    it("turns back on from the switch, and off is an ordinary unsubscribe", () => {
        const settings = memorySettings();
        settings.set("builtInFeedsSeeded", JSON.stringify(["https://xbrwplusplus.vercel.app/api/feeds/xbloom"]));
        setBuiltInOn(settings, XBLOOM, true);
        expect(isBuiltInOn(settings, XBLOOM)).toBe(true);
        setBuiltInOn(settings, XBLOOM, false);
        expect(parseSubscriptions(settings.get("roasterSubscriptions"))).toEqual([]);
    });

    it("is read by the next foreground sync like any other subscription", async () => {
        const settings = memorySettings();
        seedBuiltInFeeds(settings);
        const fetchBody = jest.fn(async () => feedBody([{id: "a"}]));
        const results = await syncDue({settings, fetchBody, now: () => 2_000_000_000_000});
        expect(fetchBody).toHaveBeenCalledWith(XBLOOM_FEED_URL, undefined);
        expect(results[0]?.ok).toBe(true);
    });

    it("survives a corrupt seeded list by treating it as empty", () => {
        const settings = memorySettings();
        settings.set("builtInFeedsSeeded", "{not json");
        expect(seedBuiltInFeeds(settings)).toBe(true);
    });
});
