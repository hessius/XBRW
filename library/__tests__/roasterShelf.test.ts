import {planRoasterSync, runRoasterSync, shelfName} from "@/library/roasterShelf";
import {brewable, feed, memoryLibrary} from "@/test-utils/roasterFeed";

describe("planRoasterSync", () => {
    it("adds only available coffees, the 18g recipe of each", () => {
        const plan = planRoasterSync(feed([{id: "a"}, {id: "b", available: false}]), []);
        expect(plan.shelf).toBe("Test Roaster");
        expect(plan.add.map((item) => item.shareId)).toEqual(["a-18g"]);
        expect(plan.add[0].recipeName).toBe("Coffee a - 18g");
        expect(plan.add[0].coffee.name).toBe("Coffee a");
    });

    it("falls back to the first recipe when a coffee has no 18g", () => {
        const plan = planRoasterSync(feed([{id: "a", sizes: ["15g", "20g"]}]), []);
        expect(plan.add[0].shareId).toBe("a-15g");
        expect(plan.add[0].recipeName).toBe("Coffee a - 15g");
    });

    it("puts a coffee the library already holds on the shelf instead of importing it", () => {
        const held = brewable("a-15g");
        const plan = planRoasterSync(feed([{id: "a"}, {id: "b"}]), [held]);
        expect(plan.add.map((item) => item.shareId)).toEqual(["b-18g"]);
        expect(plan.adopt).toEqual([{uuid: held.uuid, shareId: "a-15g", coffeeId: "a"}]);
    });

    it("leaves coffees the subscription already tracks alone", () => {
        const plan = planRoasterSync(feed([{id: "a"}, {id: "b"}]), [], [{shareId: "a-18g", coffeeId: "a"}]);
        expect(plan.add.map((item) => item.shareId)).toEqual(["b-18g"]);
        expect(plan.adopt).toEqual([]);
    });

    it("marks a tracked coffee sold out when unavailable or gone, and unmarks it when back", () => {
        const tracked = [
            {shareId: "a-18g", coffeeId: "a"},
            {shareId: "b-18g", coffeeId: "b"},
            {shareId: "c-18g", coffeeId: "c"}
        ];
        const out = planRoasterSync(feed([{id: "a"}, {id: "b", available: false}]), [], tracked);
        expect(out.soldOut).toEqual(["b-18g", "c-18g"]);

        const back = planRoasterSync(feed([{id: "a"}, {id: "b"}, {id: "c"}]), [], tracked);
        expect(back.soldOut).toEqual([]);
    });

    it("cuts a long roaster name to fit a tag", () => {
        expect(shelfName("  A   very long roaster name that runs past the tag cap  ").length)
            .toBeLessThanOrEqual(32);
    });
});

describe("runRoasterSync", () => {
    it("imports each new coffee, names it, decorates it and puts it on the shelf", async () => {
        const library = memoryLibrary();
        const plan = planRoasterSync(feed([{id: "a"}, {id: "b"}]), []);

        const outcome = await runRoasterSync(plan, library.deps);

        expect(outcome).toMatchObject({added: 2, adopted: 0, failed: [], cancelled: false});
        expect(outcome.tracked).toEqual([
            {shareId: "a-18g", coffeeId: "a"}, {shareId: "b-18g", coffeeId: "b"}
        ]);
        const a = library.find("a-18g")!;
        expect(a.name).toBe("Coffee a - 18g");
        expect(a.tags[0]).toBe("Test Roaster");
        expect(a.coffee?.name).toBe("Coffee a");
        expect(a.coffee?.imageUrl).toBe("https://roaster.example/cdn/a.png");
        expect(a.source).toBe("import");
    });

    it("only adds the shelf tag to a recipe already held, nothing else", async () => {
        const held = brewable("a-18g");
        held.name = "My tweaked one";
        held.dosage = 20;
        const library = memoryLibrary([held]);
        const plan = planRoasterSync(feed([{id: "a"}]), library.deps.stored());

        const outcome = await runRoasterSync(plan, library.deps);

        expect(outcome.adopted).toBe(1);
        const after = library.find("a-18g")!;
        expect(after.name).toBe("My tweaked one");
        expect(after.dosage).toBe(20);
        expect(after.tags).toEqual(["Test Roaster"]);
        expect(library.fetched).toEqual([]);
    });

    it("reports failures by name and carries on with the rest", async () => {
        const library = memoryLibrary([], new Set(["b-18g"]));
        const plan = planRoasterSync(feed([{id: "a"}, {id: "b"}, {id: "c"}]), []);

        const progress: number[] = [];
        const outcome = await runRoasterSync(plan, library.deps, {
            onProgress: (done) => progress.push(done)
        });

        expect(outcome.added).toBe(2);
        expect(outcome.failed).toEqual(["Coffee b"]);
        // Untracked, so the next sync tries it again.
        expect(outcome.tracked.map((item) => item.shareId)).toEqual(["a-18g", "c-18g"]);
        expect(progress).toEqual([1, 2, 3]);
    });

    it("runs no more than two lookups at once", async () => {
        const library = memoryLibrary();
        let live = 0;
        let peak = 0;
        const deps = {
            ...library.deps,
            fetchRecipe: async (link: string, signal: AbortSignal) => {
                live += 1;
                peak = Math.max(peak, live);
                await new Promise((resolve) => setTimeout(resolve, 5));
                live -= 1;
                return library.deps.fetchRecipe(link, signal);
            }
        };
        const plan = planRoasterSync(feed(["a", "b", "c", "d", "e"].map((id) => ({id}))), []);
        await runRoasterSync(plan, deps);
        expect(peak).toBe(2);
    });

    it("stops when cancelled, keeping what was already added", async () => {
        const library = memoryLibrary();
        const controller = new AbortController();
        const deps = {
            ...library.deps,
            fetchRecipe: async (link: string, signal: AbortSignal) => {
                const recipe = await library.deps.fetchRecipe(link, signal);
                if (library.fetched.length === 2) controller.abort();
                return recipe;
            }
        };
        const plan = planRoasterSync(feed(["a", "b", "c", "d", "e"].map((id) => ({id}))), []);

        const outcome = await runRoasterSync(plan, deps, {signal: controller.signal, concurrency: 1});

        expect(outcome.cancelled).toBe(true);
        expect(outcome.added).toBe(1);
        expect(library.all()).toHaveLength(1);
        expect(library.fetched).toHaveLength(2);
        expect(outcome.failed).toEqual([]);
    });
});
