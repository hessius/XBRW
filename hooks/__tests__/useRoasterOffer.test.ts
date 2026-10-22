/**
 * The subscription offer after an import link that names a roaster feed.
 *
 * The feed is handed in, so what is under test is when the question is asked,
 * when it is not, and what each answer does. Subscribing must add nothing to
 * the library: it only puts the roaster in the catalogue.
 */
import {act, renderHook, waitFor} from "@testing-library/react-native";

import {useRoasterOffer} from "@/hooks/useRoasterOffer";
import {readCatalogue} from "@/library/roasterCatalogue";
import {readSubscriptions, resetSyncLockForTests, subscribe} from "@/library/roasterSync";
import {FEED_URL, feedBody, memorySettings, type CoffeeSpec} from "@/test-utils/roasterFeed";

const mockNotify = jest.fn();
jest.mock("@/components/XbrwToast", () => ({
    __esModule: true,
    notify: (...args: unknown[]) => mockNotify(...args)
}));
const mockConstructed = jest.fn();
jest.mock("@/library/XBloomRecipe", () => ({
    __esModule: true,
    XBloomRecipe: class {
        constructor(...args: unknown[]) { mockConstructed(...args); }
    }
}));

function setup(coffees: CoffeeSpec[], options: {focused?: boolean} = {}) {
    const settings = memorySettings();
    const fetchBody = jest.fn(async () => feedBody(coffees));
    let focused = options.focused ?? true;
    return {
        settings, fetchBody,
        setFocused: (next: boolean) => {
            focused = next;
        },
        render: () => renderHook(() => useRoasterOffer({
            canAsk: () => focused, settings, fetchBody, now: () => 1000
        }))
    };
}

async function importLink(result: {current: ReturnType<typeof useRoasterOffer>}) {
    await act(async () => {
        result.current.arm(FEED_URL);
        result.current.imported();
    });
}

beforeEach(() => {
    mockNotify.mockReset();
    mockConstructed.mockReset();
    resetSyncLockForTests();
});

describe("the offer", () => {
    it("does not report an obsolete subscribed refresh after disarming", async () => {
        const t = setup([{id: "a"}]);
        const cached = feedBody([{id: "a"}]);
        subscribe(t.settings, FEED_URL, cached.feed, cached.body, 100);
        let reject: ((error: Error) => void) | undefined;
        t.fetchBody.mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail; }));
        const {result} = await t.render();
        await importLink(result);
        await act(() => result.current.disarm());
        await act(async () => reject?.(new Error("old feed failed")));
        expect(mockNotify).not.toHaveBeenCalled();
    });

    it("reports a feed follow-up failure without undoing the imported recipe", async () => {
        const t = setup([{id: "a"}]);
        t.fetchBody.mockRejectedValueOnce(new Error("server-controlled detail"));
        const {result} = await t.render();
        await importLink(result);
        await waitFor(() => expect(mockNotify).toHaveBeenCalledWith({
            tone: "error",
            message: "Recipe imported, but the roaster's feed couldn't be loaded. Try the import link again."
        }));
        expect(result.current.state.phase).toBe("idle");
    });

    it("discards an in-flight or waiting offer when its import is replaced", async () => {
        const t = setup([{id: "a"}], {focused: false});
        const {result} = await t.render();
        await importLink(result);
        await act(() => result.current.disarm());
        t.setFocused(true);
        await act(() => result.current.ask());
        expect(result.current.state.phase).toBe("idle");
    });

    it("asks once the import has worked and the library is in front", async () => {
        const t = setup([{id: "a"}, {id: "b", available: false}]);
        const {result} = await t.render();

        await importLink(result);

        await waitFor(() => expect(result.current.state.phase).toBe("offer"));
        expect(result.current.state).toEqual({phase: "offer", roaster: "Test Roaster", count: 2});
    });

    it("waits for the library to be in front before asking", async () => {
        const t = setup([{id: "a"}], {focused: false});
        const {result} = await t.render();

        await importLink(result);
        await waitFor(() => expect(t.fetchBody).toHaveBeenCalled());
        expect(result.current.state.phase).toBe("idle");
        await act(() => result.current.ask());
        expect(result.current.state.phase).toBe("idle");

        t.setFocused(true);
        await act(async () => result.current.ask());
        expect(result.current.state.phase).toBe("offer");
    });

    it("reports a subscribed feed's failed refresh after import", async () => {
        const t = setup([{id: "a"}]);
        const cached = feedBody([{id: "a"}]);
        subscribe(t.settings, FEED_URL, cached.feed, cached.body, 100);
        t.fetchBody.mockRejectedValueOnce(new Error("private server detail"));
        const {result} = await t.render();
        await importLink(result);
        await waitFor(() => expect(mockNotify).toHaveBeenCalledWith(expect.objectContaining({
            tone: "error", message: expect.stringContaining("feed couldn't be loaded")
        })));
        expect(result.current.state.phase).toBe("idle");
    });

    it("fetches nothing for a link whose import failed", async () => {
        const t = setup([{id: "a"}]);
        const {result} = await t.render();

        await act(async () => {
            result.current.arm(FEED_URL);
            result.current.disarm();
            result.current.imported();
        });

        expect(t.fetchBody).not.toHaveBeenCalled();
    });

    it("does not fetch or ask about a feed the user opted out of", async () => {
        const t = setup([{id: "a"}]);
        t.settings.set("roasterFeedOptOut", JSON.stringify(["https://roaster.example/collections/coffee"]));
        const {result} = await t.render();

        await importLink(result);

        expect(t.fetchBody).not.toHaveBeenCalled();
        expect(result.current.state.phase).toBe("idle");
    });

    it("asks nothing while subscribed, and quietly refreshes the catalogue instead", async () => {
        const t = setup([{id: "a"}, {id: "b"}]);
        const first = feedBody([{id: "a"}]);
        subscribe(t.settings, FEED_URL, first.feed, first.body, 0);
        const {result} = await t.render();

        await importLink(result);

        await waitFor(() => expect(readCatalogue(t.settings, FEED_URL)?.feed.coffees).toHaveLength(2));
        expect(result.current.state.phase).toBe("idle");
        expect(mockConstructed).not.toHaveBeenCalled();
    });
});

describe("the answers", () => {
    it("subscribe adds the roaster to the catalogue and imports nothing", async () => {
        const t = setup([{id: "a"}, {id: "b"}]);
        const {result} = await t.render();
        await importLink(result);
        await waitFor(() => expect(result.current.state.phase).toBe("offer"));

        await act(async () => result.current.accept(false));

        expect(result.current.state.phase).toBe("idle");
        expect(readSubscriptions(t.settings)).toHaveLength(1);
        expect(readCatalogue(t.settings, FEED_URL)?.feed.coffees).toHaveLength(2);
        expect(t.settings.get("importFingerprints")).toBe("");
        expect(t.settings.get("myShelves")).toBe("");
        expect(mockConstructed).not.toHaveBeenCalled();
        expect(mockNotify).toHaveBeenCalledWith({
            tone: "success", message: "Subscribed. 2 coffees from Test Roaster are in the catalogue."
        });
    });

    it("not now with the box ticked stops the question for that roaster", async () => {
        const t = setup([{id: "a"}]);
        const {result} = await t.render();
        await importLink(result);
        await waitFor(() => expect(result.current.state.phase).toBe("offer"));

        await act(async () => result.current.decline(true));

        expect(result.current.state.phase).toBe("idle");
        expect(JSON.parse(t.settings.get("roasterFeedOptOut")))
            .toEqual(["https://roaster.example/collections/coffee"]);
        expect(readSubscriptions(t.settings)).toEqual([]);
    });

    it("not now without the box asks again next time", async () => {
        const t = setup([{id: "a"}]);
        const {result} = await t.render();
        await importLink(result);
        await waitFor(() => expect(result.current.state.phase).toBe("offer"));
        await act(async () => result.current.decline(false));

        await importLink(result);

        await waitFor(() => expect(result.current.state.phase).toBe("offer"));
    });
});
