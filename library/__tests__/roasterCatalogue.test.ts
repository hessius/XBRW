import {
    bagLine, chooseRecipe, coffeeRef, findCoffee, readCatalogue, roastAdvice, updatedAgo,
    writeCatalogue, dropCatalogue
} from "@/library/roasterCatalogue";
import {FEED_URL, feed, feedJson, memorySettings} from "@/test-utils/roasterFeed";

const HOUR = 60 * 60 * 1000;

describe("the cached catalogue", () => {
    it("round-trips a feed body and forgets it on request", () => {
        const settings = memorySettings();
        writeCatalogue(settings, FEED_URL, feedJson([{id: "a"}]), 5);
        expect(readCatalogue(settings, `${FEED_URL}&cache=1`)?.fetchedAt).toBe(5);
        dropCatalogue(settings, FEED_URL);
        expect(readCatalogue(settings, FEED_URL)).toBeNull();
    });

    it("names a coffee by id, or by place when the roaster gave none", () => {
        const body = JSON.parse(feedJson([{id: "a"}, {id: "b"}]));
        delete body.coffees[1].id;
        const settings = memorySettings();
        writeCatalogue(settings, FEED_URL, JSON.stringify(body), 1);
        const read = readCatalogue(settings, FEED_URL)!.feed;
        expect(read.coffees.map((coffee) => coffeeRef(read, coffee))).toEqual(["a", "#1"]);
        expect(findCoffee(read, "#1")?.name).toBe("Coffee b");
        expect(findCoffee(read, "a")?.name).toBe("Coffee a");
        expect(findCoffee(read, "nope")).toBeUndefined();
    });
});

describe("what a coffee says", () => {
    const [coffee] = feed([{id: "a"}]).coffees;

    it("chooses 18g first, the size asked for, or the first", () => {
        expect(chooseRecipe(coffee).size).toBe("18g");
        expect(chooseRecipe(coffee, "15 G").size).toBe("15g");
        expect(chooseRecipe(feed([{id: "b", sizes: ["20g"]}]).coffees[0]).size).toBe("20g");
    });

    it("puts the roast advice in one line", () => {
        expect(roastAdvice(coffee)).toBe("Rest 11 days, peak day 28, best by day 42");
        expect(roastAdvice({...coffee, roast: {peakDay: 35}})).toBe("Peak day 35");
        expect(roastAdvice({...coffee, roast: {level: "Light"}})).toBeNull();
    });

    it("lists bag sizes in grams and kilos", () => {
        expect(bagLine({...coffee, bagSizes: [1000, 320]})).toBe("1 kg · 320 g");
        expect(bagLine({...coffee, bagSizes: []})).toBeNull();
    });

    it("says how fresh it is", () => {
        expect(updatedAgo(0, 30_000)).toBe("Updated just now");
        expect(updatedAgo(0, 2 * HOUR)).toBe("Updated 2 h ago");
    });
});
