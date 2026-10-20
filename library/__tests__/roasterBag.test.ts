import Recipe from "@/library/Recipe";
import {bagFormFor, catalogueBag} from "@/library/roasterBag";
import {parseRoasterFeed} from "@/library/roasterFeed";
import {feedJson} from "@/test-utils/roasterFeed";

function coffeeWith(variants: unknown) {
    const parsed = JSON.parse(feedJson([{id: "a"}]));
    parsed.coffees[0].variants = variants;
    return parseRoasterFeed(JSON.stringify(parsed))!.coffees[0];
}

describe("the bag form for a catalogue coffee", () => {
    it("offers the variants' sizes, starts on one on sale, and knows each price", () => {
        const form = bagFormFor(coffeeWith([
            {id: "1", grams: 1000, price: 146, available: false},
            {id: "2", grams: 160, price: 28, available: true}
        ]));
        expect(form.sizes).toEqual([1000, 160]);
        expect(form.suggestedSize).toBe(160);
        expect(form.priceFor(1000)).toBe(146);
        expect(form.priceFor(250)).toBeUndefined();
    });

    it("falls back to bag_sizes_g, and to the form's own presets", () => {
        expect(bagFormFor(coffeeWith([])).sizes).toEqual([320, 160]);
        const bare = {...coffeeWith([]), bagSizes: []};
        expect(bagFormFor(bare).sizes).toEqual([]);
        expect(bagFormFor(bare).suggestedSize).toBeUndefined();
    });
});

describe("the bag made on shelving", () => {
    it("keeps a known coffee's name aligned with subsequent brew handoffs", () => {
        const recipe = new Recipe();
        recipe.coffee = {name: "Peru El Palto"};
        const bag = catalogueBag(recipe, {sizeGrams: 160, beanName: "A different bean"}, "beanconqueror", 1000);
        expect(bag.beanName).toBe(recipe.coffee.name);
    });

    it("retains an editable bean name when the recipe has no coffee metadata", () => {
        const recipe = new Recipe();
        recipe.name = "Peru - 18g";
        expect(catalogueBag(recipe, {sizeGrams: 160, beanName: "My bean"}, "beanconqueror", 1000).beanName)
            .toBe("My bean");
    });

    it("is the editor's bag, named for Beanconqueror only in that mode", () => {
        const recipe = new Recipe();
        recipe.uuid = "r1";
        recipe.name = "Peru - 18g";
        const input = {sizeGrams: 160, price: 28, roastedOn: "2026-10-12"};
        expect(catalogueBag(recipe, input, "xbrw", 1000)).toMatchObject({
            recipeUuid: "r1", sizeGrams: 160, price: 28, roastedOn: "2026-10-12", gramsAtCount: 160
        });
        expect(catalogueBag(recipe, input, "xbrw", 1000).beanName).toBeUndefined();
        expect(catalogueBag(recipe, input, "beanconqueror", 1000).beanName).toBeTruthy();
    });
});
