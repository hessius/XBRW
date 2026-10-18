import {parseBrewMindLink} from "@/library/brewmindLink";
import {MAX_LABELS, readLabels} from "@/library/coffeeLabels";
import {decorateImport} from "@/library/importDecoration";
import Recipe from "@/library/Recipe";
import {parseRoasterFeed} from "@/library/roasterFeed";
import {feedJson} from "@/test-utils/roasterFeed";

describe("readLabels", () => {
    it("reads an array or a comma separated string, trimmed and de-duplicated", () => {
        expect(readLabels(["Dark Chocolate", " Blueberry ", "blueberry", 5, ""]))
            .toEqual(["Dark Chocolate", "Blueberry"]);
        expect(readLabels("Berry, Sweet ,Filter")).toEqual(["Berry", "Sweet", "Filter"]);
    });

    it("drops a label too long to be one and caps the list", () => {
        expect(readLabels(["x".repeat(33), "ok"])).toEqual(["ok"]);
        expect(readLabels(Array.from({length: 20}, (_, i) => `t${i}`))).toHaveLength(MAX_LABELS);
        expect(readLabels(undefined)).toEqual([]);
    });
});

describe("flavours and tags at both doors", () => {
    it("reads bean.flavours and bean.tags off an import link", () => {
        const link = parseBrewMindLink(
            "xbrw://import?v=1&share=https%3A%2F%2Fshare-h5.xbloom.com%2F%3Fid%3Dabc" +
            "&bean.name=Peru&bean.flavours=Cacao%2C%20Blueberry&bean.tags=Berry%2CFilter"
        )!;
        expect(link.flavours).toEqual(["Cacao", "Blueberry"]);
        expect(link.tags).toEqual(["Berry", "Filter"]);
        // Not in the coffee block, which is Beanconqueror's contract.
        expect(link.coffee).not.toHaveProperty("flavours");
    });

    it("reads them from a feed coffee's bean block", () => {
        const parsed = JSON.parse(feedJson([{id: "a"}]));
        parsed.coffees[0].bean.flavours = ["Dark Chocolate", "Vanilla"];
        parsed.coffees[0].bean.tags = ["Chocolate", "Rare & Premium"];
        const coffee = parseRoasterFeed(JSON.stringify(parsed))!.coffees[0];
        expect(coffee.flavours).toEqual(["Dark Chocolate", "Vanilla"]);
        expect(coffee.tags).toEqual(["Chocolate", "Rare & Premium"]);
        expect(coffee.coffee).not.toHaveProperty("tags");
    });

    it("adds the tags to a recipe after its own, never removing one", () => {
        const recipe = new Recipe();
        recipe.setTags(["Mornings", "berry"]);
        decorateImport(recipe, {tags: ["Berry", "Filter"]});
        expect(recipe.tags).toEqual(["Mornings", "berry", "Filter"]);
    });
});
