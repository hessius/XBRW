import {bagBeanName, bagShareBean, handoffBeanName} from "@/library/brew/handoff/bagBean";
import {ADD_USER_BEAN_PREFIX, beanconquerorDate, beanLink} from "@/library/brew/handoff/beanLink";
import {buildEnvelope} from "@/library/brew/handoff/envelope";
import type {StoredBrew} from "@/library/BrewDatabase";
import {newBag} from "@/library/coffeeBag";
import Recipe from "@/library/Recipe";

/**
 * A protobuf reader written for this test, independent of the encoder, that
 * decodes the wire format the way Beanconqueror's generated `BeanProto.decode`
 * does: by field number and wire type, keeping the last value of a field.
 * Field names are Beanconqueror's, from `src/classes/bean/bean.proto`.
 */
const BEAN_FIELDS: Record<number, string> = {
    1: "name", 2: "buyDate", 3: "roastingDate", 4: "note", 5: "roaster",
    12: "weight", 13: "finished", 14: "cost", 18: "url", 21: "bean_information"
};
const INFO_FIELDS: Record<number, string> = {
    1: "country", 2: "region", 3: "farm", 4: "farmer", 5: "elevation",
    7: "variety", 8: "processing"
};

function decode(bytes: Uint8Array, names: Record<number, string>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    let at = 0;
    const varint = (): number => {
        let result = 0;
        let scale = 1;
        for (;;) {
            const byte = bytes[at++];
            result += (byte & 0x7f) * scale;
            if ((byte & 0x80) === 0) return result;
            scale *= 128;
        }
    };
    while (at < bytes.length) {
        const key = varint();
        const field = Math.floor(key / 8);
        const wire = key % 8;
        const name = names[field] ?? `field${field}`;
        if (wire === 0) out[name] = varint();
        else if (wire === 1) {
            out[name] = new DataView(bytes.buffer, bytes.byteOffset + at, 8).getFloat64(0, true);
            at += 8;
        } else if (wire === 2) {
            const length = varint();
            const slice = bytes.subarray(at, at + length);
            at += length;
            out[name] = field === 21
                ? decode(slice, INFO_FIELDS)
                : Buffer.from(slice).toString("utf8");
        } else {
            throw new Error(`unexpected wire type ${wire}`);
        }
    }
    return out;
}

/** What Beanconqueror's intent handler does with an ADD_USER_BEAN link. */
function receive(url: string): Record<string, unknown> {
    expect(url.startsWith(`${ADD_USER_BEAN_PREFIX}?`)).toBe(true);
    const params = new URLSearchParams(url.split("?")[1]);
    const chunks = url.match(/shareUserBean[0-9]+(?==)/g) ?? [];
    const joined = chunks.map((name) => String(params.get(name))).join("").replace(/ /g, "+");
    return decode(Uint8Array.from(Buffer.from(joined, "base64")), BEAN_FIELDS);
}

const NOW = new Date(2026, 9, 18, 10).getTime();

function recipeNamed(name: string): Recipe {
    const recipe = new Recipe();
    recipe.name = name;
    return recipe;
}

describe("the bag as a Beanconqueror bean", () => {
    it("round-trips name, weight, dates and price through the link", () => {
        const recipe = recipeNamed("Ethiopia Guji - Drop Coffee");
        const bag = newBag(recipe.uuid, {sizeGrams: 250, roastedOn: "2026-10-12", price: 24.5}, NOW);
        const name = bagBeanName(recipe);
        const bean = receive(beanLink(bagShareBean(recipe, bag, name)));

        expect(bean.name).toBe("Ethiopia Guji");
        expect(bean.weight).toBe(250);
        expect(bean.cost).toBe(24.5);
        expect(bean.finished).toBe(0);
        expect(bean.roastingDate).toBe(beanconquerorDate("2026-10-12"));
        expect(bean.buyDate).toBe(beanconquerorDate("2026-10-18"));
        expect(String(bean.roastingDate).startsWith("2026-10-12T00:00:00")).toBe(true);
    });

    it("names the bean exactly as the brew handoff names this recipe's brews", () => {
        const recipe = recipeNamed("Kenya Nyeri AA v3 hotter");
        const brew = {
            id: "b1", recipeUuid: recipe.uuid, recipeName: recipe.displayName(),
            accent: "#ff8800", startedAt: NOW, pouringAt: NOW, endedAt: NOW + 1000,
            outcome: "done", failure: null, pours: 1, waterTotal: 250, cupTotal: 230,
            heldSeconds: 0, hasStream: false
        } as StoredBrew;
        const envelope = buildEnvelope(brew, []);
        expect(bagBeanName(recipe)).toBe(envelope.bean?.name);
    });

    it("uses a pod's coffee name, which the brew handoff always sends", () => {
        const recipe = recipeNamed("My tweak");
        recipe.coffee = {
            name: "Sidra Natural", roaster: "Drop", country: "Ecuador", processing: "Natural",
            elevation: 1900, url: "https://drop.example/sidra"
        };
        const bag = newBag(recipe.uuid, {sizeGrams: 160}, NOW);
        const bean = receive(beanLink(bagShareBean(recipe, bag, bagBeanName(recipe))));
        expect(bean.name).toBe("Sidra Natural");
        expect(bean.roaster).toBe("Drop");
        expect(bean.url).toBe("https://drop.example/sidra");
        expect(bean.bean_information).toEqual({
            country: "Ecuador", processing: "Natural", elevation: "1900"
        });
    });

    it("splits a long payload into 400-character parameters and survives UTF-8", () => {
        const recipe = recipeNamed("Café Ñuñoa");
        recipe.coffee = {name: "Café Ñuñoa", farm: "x".repeat(600)};
        const bag = newBag(recipe.uuid, {sizeGrams: 1000}, NOW);
        const url = beanLink(bagShareBean(recipe, bag, bagBeanName(recipe)));
        expect(url).toContain("&shareUserBean1=");
        const bean = receive(url);
        expect(bean.name).toBe("Café Ñuñoa");
        expect((bean.bean_information as Record<string, unknown>).farm).toBe("x".repeat(600));
    });

    it("leaves out what the bag does not know", () => {
        const recipe = recipeNamed("House");
        const bag = newBag(recipe.uuid, {sizeGrams: 250}, NOW);
        const bean = receive(beanLink(bagShareBean(recipe, bag, "House")));
        expect(bean.roastingDate).toBeUndefined();
        expect(bean.cost).toBeUndefined();
        expect(bean.bean_information).toBeUndefined();
    });

    it("offers a bag's stored name to the brew handoff, and nothing for a blank one", () => {
        expect(handoffBeanName({beanName: "Guji"})).toBe("Guji");
        expect(handoffBeanName({beanName: "  "})).toBeUndefined();
        expect(handoffBeanName(null)).toBeUndefined();
    });
});
