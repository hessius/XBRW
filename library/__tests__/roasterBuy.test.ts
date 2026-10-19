import {
    bagChoices, bagGramsLabel, buyLink, buyOptions, formatPrice, reorderLink, variantForGrams
} from "@/library/roasterBuy";
import {parseRoasterFeed, type RoasterFeed} from "@/library/roasterFeed";
import {subscribe} from "@/library/roasterSync";
import {FEED_URL, feedJson, memorySettings} from "@/test-utils/roasterFeed";

const TEMPLATE = "https://shop.example/cart/add?id={variant_id}&quantity=1";
const NativeNumberFormat = Intl.NumberFormat;

/** The test feed with a roaster block and per-coffee variants patched in. */
function body(roaster: Record<string, unknown>, variants: unknown, coffee: Record<string, unknown> = {}) {
    const parsed = JSON.parse(feedJson([{id: "a"}]));
    parsed.roaster = {...parsed.roaster, ...roaster};
    parsed.coffees[0] = {...parsed.coffees[0], variants, ...coffee};
    return JSON.stringify(parsed);
}

function read(roaster: Record<string, unknown>, variants: unknown, coffee?: Record<string, unknown>): RoasterFeed {
    return parseRoasterFeed(body(roaster, variants, coffee))!;
}

describe("reading variants and the cart template", () => {
    it("reads a Shopify-shaped variant list and template", () => {
        const feed = read({add_to_cart: TEMPLATE}, [
            {id: 42227047268388, grams: 160, price: 28.0, currency: "aud", available: true},
            {id: "v-320", grams: 320, price: "53", currency: "AUD", available: false}
        ]);
        expect(feed.roaster.addToCart).toBe(TEMPLATE);
        expect(feed.coffees[0].variants).toEqual([
            {id: "42227047268388", grams: 160, price: 28, currency: "AUD", available: true},
            {id: "v-320", grams: 320, price: 53, currency: "AUD", available: false}
        ]);
    });

    it("refuses a template that is not https or has nowhere to put the id", () => {
        expect(read({add_to_cart: "http://shop.example/cart/add?id={variant_id}"}, []).roaster.addToCart)
            .toBeUndefined();
        expect(read({add_to_cart: "https://shop.example/cart"}, []).roaster.addToCart).toBeUndefined();
    });

    it("drops bad values one field at a time and empty variants whole", () => {
        const feed = read({}, [
            {id: 7, grams: -1, price: "free", currency: "dollars", url: "http://x.example"},
            {available: true},
            "nonsense",
            {grams: 250, url: "https://roaster.example/buy/250"}
        ]);
        expect(feed.coffees[0].variants).toEqual([
            {id: "7", available: false},
            {grams: 250, url: "https://roaster.example/buy/250", available: false}
        ]);
    });

    it("needs nothing: a coffee without variants has none", () => {
        expect(read({}, undefined).coffees[0].variants).toEqual([]);
    });
});

describe("buy links", () => {
    const roaster = {name: "R", addToCart: TEMPLATE};

    it("fills the template with the encoded variant id", () => {
        expect(buyLink(roaster, {id: "42", available: true}))
            .toBe("https://shop.example/cart/add?id=42&quantity=1");
        expect(buyLink(roaster, {id: "a&b#c", available: true}))
            .toBe("https://shop.example/cart/add?id=a%26b%23c&quantity=1");
    });

    it("prefers the variant's own link, for a shop with no template", () => {
        const url = "https://small-roaster.example/shop/peru-250g";
        expect(buyLink(roaster, {id: "42", url, available: true})).toBe(url);
        expect(buyLink({name: "R"}, {url, available: true})).toBe(url);
    });

    it("has none without a link or an id and template", () => {
        expect(buyLink({name: "R"}, {id: "42", available: true})).toBeUndefined();
        expect(buyLink(roaster, {grams: 250, available: true})).toBeUndefined();
    });
});

describe("the BUY rows", () => {
    beforeEach(() => {
        jest.spyOn(Intl, "NumberFormat").mockImplementation((locales, options) =>
            new NativeNumberFormat(locales ?? "en-AU", options)
        );
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it("labels each bag with its size and price, and its link", () => {
        const feed = read({add_to_cart: TEMPLATE}, [
            {id: "1", grams: 1000, price: 146, currency: "AUD", available: true},
            {id: "2", grams: 160, price: 28.5, currency: "AUD", available: false},
            {grams: 250, available: true}
        ]);
        const options = buyOptions(feed.roaster, feed.coffees[0]);
        expect(options.map((option) => option.label)).toEqual(["1 kg · $146", "160 g · $28.50", "250 g"]);
        expect(options[0].url).toBe("https://shop.example/cart/add?id=1&quantity=1");
        expect(options[1].available).toBe(false);
        expect(options[2].url).toBeUndefined();
    });

    it("marks every bag sold out when the coffee is", () => {
        const feed = read({add_to_cart: TEMPLATE}, [{id: "1", grams: 160, available: true}],
                          {available: false});
        expect(buyOptions(feed.roaster, feed.coffees[0])[0].available).toBe(false);
    });

    it("writes a price with the currency, or names it when it cannot", () => {
        expect(formatPrice(28, "AUD")).toBe("$28");
        expect(formatPrice(28.5, "AUD")).toBe("$28.50");
        expect(formatPrice(28, "ZZZ")).toMatch(/28/);
        expect(formatPrice(28)).toBe("$28");
        expect(bagGramsLabel(480)).toBe("480 g");
    });

    it("keeps the phone's locale for currency placement and decimals", () => {
        jest.spyOn(Intl, "NumberFormat").mockImplementation((locales, options) => {
            expect(locales).toBeUndefined();
            return new NativeNumberFormat("sv-SE", options);
        });
        expect(formatPrice(28.5, "AUD")).toBe("28,50\u00a0$");
    });
});

describe("bag sizes and reorders", () => {
    it("offers the variants' sizes, then bag_sizes_g", () => {
        const withVariants = read({}, [{id: "1", grams: 480}, {id: "2", grams: 160}]);
        expect(bagChoices(withVariants.coffees[0])).toEqual([480, 160]);
        expect(bagChoices(read({}, []).coffees[0])).toEqual([320, 160]);
        expect(variantForGrams(withVariants.coffees[0], 160)?.id).toBe("2");
    });

    it("reorders the same size from a subscribed catalogue, by the coffee's page", () => {
        const settings = memorySettings();
        const text = body({add_to_cart: TEMPLATE}, [
            {id: "320", grams: 320, available: true},
            {id: "160", grams: 160, available: true}
        ]);
        subscribe(settings, FEED_URL, parseRoasterFeed(text)!, text, 1);

        const page = "https://roaster.example/products/a/";
        expect(reorderLink(settings, page, 160)).toBe("https://shop.example/cart/add?id=160&quantity=1");
        // A size the roaster no longer sells, or a coffee it does not list.
        expect(reorderLink(settings, page, 1000)).toBeUndefined();
        expect(reorderLink(settings, "https://roaster.example/products/zz", 160)).toBeUndefined();
        expect(reorderLink(settings, undefined, 160)).toBeUndefined();
    });
});
