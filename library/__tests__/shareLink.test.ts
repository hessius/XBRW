import {parseBrewMindLink} from "@/library/brewmindLink";
import {decorateImport, decorationFromLink} from "@/library/importDecoration";
import Recipe from "@/library/Recipe";
import {buildShareUrl} from "@/library/shareLink";

const UPSTREAM = "https://share-h5.xbloom.com/?id=abc123";

describe("buildShareUrl", () => {
    it("wraps an upstream xBloom share URL in an xbrw.app/import link", () => {
        const recipe = new Recipe();
        recipe.name = "Ethiopia Guji";

        const url = buildShareUrl(recipe, UPSTREAM);
        const parsed = new URL(url);

        expect(parsed.origin + parsed.pathname).toBe("https://xbrw.app/import");
        expect(parsed.searchParams.get("v")).toBe("1");
        expect(parsed.searchParams.get("share")).toBe(UPSTREAM);
        expect(parsed.searchParams.get("recipe.name")).toBe("Ethiopia Guji");
    });

    it("round-trips every recipe and coffee metadata field through parseBrewMindLink and decorateImport", () => {
        const sender = new Recipe();
        sender.name = "Colombia | Las Flores | Chiroso Natural - 18g";
        sender.description = "Sweet cherry and jasmine notes";
        sender.xid = "COL120";
        sender.recipeUrl = "https://example.com/recipes/chiroso";
        sender.imageURL = "https://example.com/pod-artwork.png";
        sender.accentIndex = 2;
        sender.setTags(["Morning", "Sweet", "Washed"]);
        sender.coffee = {
            name: "Finca Las Flores",
            roaster: "Manhattan Coffee Roasters",
            roastingDate: "2026-10-15",
            roast: "Light",
            country: "Colombia",
            region: "Huila",
            farm: "Las Flores",
            farmer: "Jhoan Vergara",
            elevation: 1750,
            processing: "Washed",
            fermentation: "Thermal Shock",
            variety: "Chiroso",
            beanMix: "Single Origin",
            aromatics: "Cherry, jasmine, cacao nibs",
            note: "Rest at least 14 days before brewing.",
            cupping_points: 88.5,
            decaffeinated: false,
            url: "https://example.com/beans/las-flores",
            imageUrl: "https://example.com/bag-photo.png",
            origin: "Colombia, Huila",
            flavours: ["Cherry", "Jasmine"],
            restDays: 14,
            peakDay: 28,
            bestUntilDay: 45
        };

        const url = buildShareUrl(sender, UPSTREAM);
        const link = parseBrewMindLink(url);
        expect(link).not.toBeNull();
        expect(link?.share).toBe(UPSTREAM);

        const receiver = new Recipe();
        decorateImport(receiver, decorationFromLink(link!));

        expect(receiver.name).toBe(sender.name);
        expect(receiver.description).toBe(sender.description);
        expect(receiver.xid).toBe(sender.xid);
        expect(receiver.recipeUrl).toBe(sender.recipeUrl);
        expect(receiver.imageURL).toBe(sender.imageURL);
        expect(receiver.accentIndex).toBe(sender.accentIndex);
        expect(receiver.coffee).toEqual(sender.coffee);
        expect(receiver.tags).toEqual(["Morning", "Sweet", "Washed", "Light"]);
    });

    it("preserves a standalone recipe image even when the recipe has no coffee record", () => {
        const sender = new Recipe();
        sender.name = "Pod Recipe";
        sender.imageURL = "https://example.com/pod.png";

        const url = buildShareUrl(sender, UPSTREAM);
        const link = parseBrewMindLink(url);
        expect(link?.recipeImage).toBe("https://example.com/pod.png");
        expect(link?.coffee).toBeUndefined();

        const receiver = new Recipe();
        decorateImport(receiver, decorationFromLink(link!));
        expect(receiver.imageURL).toBe("https://example.com/pod.png");
    });

    it("uses recipe.imageURL as bean.image when the coffee has no separate imageUrl", () => {
        const sender = new Recipe();
        sender.imageURL = "https://example.com/bag.png";
        sender.coffee = {name: "Guji", roaster: "Tim Wendelboe"};

        const url = buildShareUrl(sender, UPSTREAM);
        const parsed = new URL(url);
        expect(parsed.searchParams.get("bean.image")).toBe("https://example.com/bag.png");
        expect(parsed.searchParams.get("recipe.image")).toBeNull();

        const link = parseBrewMindLink(url);
        const receiver = new Recipe();
        decorateImport(receiver, decorationFromLink(link!));
        expect(receiver.imageURL).toBe("https://example.com/bag.png");
        expect(receiver.coffee?.imageUrl).toBe("https://example.com/bag.png");
    });

    it("omits bean.* fields when the coffee has no valid name", () => {
        const sender = new Recipe();
        sender.name = "Unnamed Bean Recipe";
        sender.coffee = {name: "   ", roaster: "Orphan Roaster"};

        const url = buildShareUrl(sender, UPSTREAM);
        const parsed = new URL(url);
        expect(parsed.searchParams.get("bean.roaster")).toBeNull();
        expect(parseBrewMindLink(url)?.coffee).toBeUndefined();
    });
});
