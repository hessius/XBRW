/**
 * The subscription offer after an import link that names a roaster feed.
 *
 * The share endpoint and the recipe table are an in-memory library, and the
 * feed is handed in, so what is under test is when the question is asked,
 * when it is not, and what each answer does.
 */
import {act, renderHook, waitFor} from "@testing-library/react-native";

import {useRoasterShelf} from "@/hooks/useRoasterShelf";
import {readSubscriptions, resetSyncLockForTests, subscribe} from "@/library/roasterSync";
import {
    FEED_URL, brewable, feed, memoryLibrary, memorySettings, type CoffeeSpec
} from "@/test-utils/roasterFeed";

const mockNotify = jest.fn();
jest.mock("@/components/XbrwToast", () => ({
    __esModule: true,
    notify: (...args: unknown[]) => mockNotify(...args)
}));

function setup(coffees: CoffeeSpec[], options: {focused?: boolean; held?: string[]} = {}) {
    const settings = memorySettings();
    const library = memoryLibrary((options.held ?? []).map((id) => brewable(id)));
    const fetchFeed = jest.fn(async () => feed(coffees));
    const onChanged = jest.fn();
    let focused = options.focused ?? true;
    return {
        settings, library, fetchFeed, onChanged,
        setFocused: (next: boolean) => {
            focused = next;
        },
        render: () => renderHook(() => useRoasterShelf({
            stored:    library.deps.stored,
            canAsk:    () => focused,
            onChanged,
            settings,
            fetchFeed,
            deps:      library.deps
        }))
    };
}

async function importLink(result: {current: ReturnType<typeof useRoasterShelf>}) {
    await act(async () => {
        result.current.arm(FEED_URL);
        result.current.imported();
    });
}

beforeEach(() => {
    mockNotify.mockReset();
    resetSyncLockForTests();
});

describe("the offer", () => {
    it("asks once the import has worked and the library is in front", async () => {
        const t = setup([{id: "a"}, {id: "b"}]);
        const {result} = await t.render();

        await importLink(result);

        await waitFor(() => expect(result.current.state.phase).toBe("offer"));
        const state = result.current.state;
        expect(state.phase === "offer" && state.count).toBe(2);
        expect(state.phase === "offer" && state.plan.roaster).toBe("Test Roaster");
    });

    it("waits for the library to be in front before asking", async () => {
        const t = setup([{id: "a"}], {focused: false});
        const {result} = await t.render();

        await importLink(result);
        await waitFor(() => expect(t.fetchFeed).toHaveBeenCalled());
        expect(result.current.state.phase).toBe("idle");

        t.setFocused(true);
        await act(async () => result.current.ask());
        expect(result.current.state.phase).toBe("offer");
    });

    it("fetches nothing for a link whose import failed", async () => {
        const t = setup([{id: "a"}]);
        const {result} = await t.render();

        await act(async () => {
            result.current.arm(FEED_URL);
            result.current.disarm();
            result.current.imported();
        });

        expect(t.fetchFeed).not.toHaveBeenCalled();
    });

    it("does not ask when every available coffee is already held", async () => {
        const t = setup([{id: "a"}, {id: "b", available: false}], {held: ["a-18g"]});
        const {result} = await t.render();

        await importLink(result);
        await waitFor(() => expect(t.fetchFeed).toHaveBeenCalled());
        await act(async () => result.current.ask());

        expect(result.current.state.phase).toBe("idle");
    });

    it("does not fetch or ask about a feed the user opted out of", async () => {
        const t = setup([{id: "a"}]);
        t.settings.set("roasterFeedOptOut", JSON.stringify(["https://roaster.example/collections/coffee"]));
        const {result} = await t.render();

        await importLink(result);

        expect(t.fetchFeed).not.toHaveBeenCalled();
        expect(result.current.state.phase).toBe("idle");
    });

    it("asks nothing while subscribed, and syncs quietly instead", async () => {
        const t = setup([{id: "a"}, {id: "b"}]);
        subscribe(t.settings, FEED_URL, feed([]), "Test Roaster");
        const {result} = await t.render();

        await importLink(result);

        await waitFor(() => expect(t.library.all()).toHaveLength(2));
        expect(result.current.state.phase).toBe("idle");
        expect(mockNotify).toHaveBeenCalledWith({tone: "success", message: "Added 2 coffees to Test Roaster."});
    });
});

describe("the answers", () => {
    it("subscribe stores the subscription and adds only the new available coffees", async () => {
        const t = setup([{id: "a"}, {id: "b"}, {id: "c", available: false}], {held: ["a-18g"]});
        const {result} = await t.render();
        await importLink(result);
        await waitFor(() => expect(result.current.state.phase).toBe("offer"));

        await act(async () => result.current.accept(false));

        await waitFor(() => expect(result.current.state.phase).toBe("idle"));
        expect(t.library.all().map((recipe) => recipe.shareId).sort()).toEqual(["a-18g", "b-18g"]);
        expect(readSubscriptions(t.settings)).toHaveLength(1);
        expect(t.onChanged).toHaveBeenCalled();
        expect(mockNotify).toHaveBeenCalledWith({
            tone: "success", message: "Subscribed. 2 coffees on Test Roaster."
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

    it("reports a failed coffee by name without losing the rest", async () => {
        const t = setup([{id: "a"}, {id: "b"}]);
        t.library.deps.fetchRecipe = jest.fn(async (link: string) => {
            if (link.includes("b-18g")) throw new Error("offline");
            return brewable("a-18g");
        });
        const {result} = await t.render();
        await importLink(result);
        await waitFor(() => expect(result.current.state.phase).toBe("offer"));

        await act(async () => result.current.accept(false));

        await waitFor(() => expect(mockNotify).toHaveBeenCalled());
        expect(mockNotify).toHaveBeenCalledWith({
            tone: "error", message: "Subscribed. 1 coffee on Test Roaster. Could not add: Coffee b."
        });
    });

    it("cancel stops adding and keeps what landed", async () => {
        const t = setup([{id: "a"}, {id: "b"}, {id: "c"}]);
        const original = t.library.deps.fetchRecipe;
        let calls = 0;
        const {result} = await t.render();
        t.library.deps.fetchRecipe = async (link, signal) => {
            calls += 1;
            const first = calls === 1;
            const recipe = await original(link, signal);
            if (first) result.current.cancel();
            return recipe;
        };
        await importLink(result);
        await waitFor(() => expect(result.current.state.phase).toBe("offer"));

        await act(async () => result.current.accept(false));

        await waitFor(() => expect(result.current.state.phase).toBe("idle"));
        expect(t.library.all().length).toBeLessThan(3);
        expect(mockNotify.mock.calls[0][0].message).toMatch(/^Stopped\./);
    });
});
