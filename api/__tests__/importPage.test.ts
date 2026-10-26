import {accents, onAccent, palette} from "../../constants/colourValues";
import {parseBrewMindLink} from "../../library/brewmindLink";
import {parseImportInput} from "../../library/importInput";
import {InvalidImportDataError} from "../../library/xbloomRecipeData";
import {fullImportURL, importDetail} from "../../test-utils/importPageFixtures";
import {buildImportView} from "../_lib/importView";
import {DOWNLOADS, escapeHTML, renderImportError, renderImportPage} from "../_lib/importPage";

const options = {nonce: "fixtureNonce", userAgent: "Mozilla/5.0 Android"};

function viewFor(url = fullImportURL(), detail: unknown = importDetail()) {
    const link = parseBrewMindLink(url.toString());
    expect(link).not.toBeNull();
    const source = parseImportInput(link!.share);
    expect(source).not.toBeNull();
    return buildImportView(detail, link!, source!, url.search);
}

function body(html: string): string {
    return html.split("<body>")[1].split("</body>")[0];
}

function decode(html: string): string {
    const entities: Record<string, string> = {
        "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'"
    };
    return html.replace(/&(?:amp|lt|gt|quot|#39);/g, entity => entities[entity]);
}

function text(html: string): string {
    return decode(html.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
}

function links(html: string) {
    return [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)].map(match => ({
        href: decode(/\bhref="([^"]*)"/.exec(match[1])![1]),
        label: text(match[2]),
        attributes: match[1]
    }));
}

function fact(html: string, label: string, value: string) {
    expect(html).toContain(`<dt>${escapeHTML(label)}</dt><dd>${escapeHTML(value)}</dd>`);
}

describe("full import page", () => {
    it("renders ALL supplied metadata in the actual visible body, not only the head or payload", () => {
        const url = fullImportURL();
        const html = renderImportPage(viewFor(url), {...options, pageURL: url.toString()});
        const content = body(html);
        expect(content).toContain("Producer&#39;s morning recipe");
        for (const value of [
            "Example Roastery", "Bag coffee", "East Africa", "Ethiopia", "Guji", "Example Farm",
            "Example Farmer", "1,798 m", "Natural", "Anaerobic", "Heirloom", "Single Origin",
            "Light", "2026-10-01", "Stone fruit and jasmine", "Apricot", "Jasmine", "86.5 points",
            "Caffeinated", "0 days", "14 days", "35 days", "A complete description.",
            "A second paragraph.", "Morning", "Filter", "brewmind", "Get XBRW++", "Open app",
            "View on xBloom"
        ]) expect(text(content)).toContain(value);
        expect(content).toContain('src="https://images.example.test/pod.jpg"');
        expect(content).toContain('src="https://images.example.test/bag.jpg"');
        expect(links(content)).toContainEqual(expect.objectContaining({
            label: "Coffee catalogue", href: "https://producer.example.test/feed.json"
        }));
        expect(html).not.toMatch(/<script\b/i);
        expect(content).not.toMatch(/\bhidden\b|display:\s*none|<details\b/i);
    });

    it("labels every coffee field, including independent tasting notes and zero-day guidance", () => {
        const html = body(renderImportPage(viewFor(), options));
        for (const [label, value] of [
            ["Origin", "East Africa"], ["Country", "Ethiopia"], ["Region", "Guji"], ["Farm", "Example Farm"],
            ["Farmer", "Example Farmer"], ["Elevation", "1,798 m"], ["Process", "Natural"],
            ["Fermentation", "Anaerobic"], ["Varietal", "Heirloom"], ["Type", "Single Origin"],
            ["Roast", "Light"], ["Roasted on", "2026-10-01"], ["Flavours", "Apricot, Jasmine"],
            ["Tasting notes", "Stone fruit and jasmine"], ["Cupping score", "86.5 points"],
            ["Caffeine", "Caffeinated"], ["Rest", "0 days"], ["Peak", "14 days"], ["Best until", "35 days"]
        ]) fact(html, label, value);
    });

    it.each([["1", "Decaf"], ["0", "Caffeinated"]])("states explicit caffeine %s", (flag, expected) => {
        const url = fullImportURL();
        url.searchParams.set("bean.decaffeinated", flag);
        fact(body(renderImportPage(viewFor(url), options)), "Caffeine", expected);
    });

    it("omits empty coffee groups, tags, photographs and unstated caffeine without empty headings", () => {
        const url = new URL("https://preview.example.test/import?v=1&share=XB0001");
        const detail = importDetail();
        const view = viewFor(url, {...detail, recipeVo: {...detail.recipeVo, podsVo: undefined}});
        const html = body(renderImportPage(view, options));
        expect(html).not.toContain("<img");
        expect(html).not.toMatch(/Coffee facts|Coffee notes|Tags|Destinations|Caffeinated|Decaf|<dl><\/dl>/);
        expect(html).toContain("<h1>Morning coffee</h1>");
        expect(html).not.toContain("<dt>xBloom recipe</dt>");
        view.recipe.name = "";
        view.recipe.xbloomName = "";
        expect(renderImportPage(view, options)).toContain("<h1>Shared recipe</h1>");
    });

    it("keeps the complete 2000-character note and written roast date without timezone conversion", () => {
        const url = fullImportURL();
        const note = "A".repeat(990) + "\n\n" + "B".repeat(1008);
        url.searchParams.set("bean.note", note);
        url.searchParams.set("bean.roastingDate", "2026-10-01T00:05:00+14:00");
        const html = body(renderImportPage(viewFor(url), options));
        expect(html).toContain(note);
        fact(html, "Roasted on", "2026-10-01");
        expect(html).not.toMatch(/<details|<summary/);
    });

    it("uses real parser aliases without a second interpretation", () => {
        const canonical = fullImportURL();
        const aliases = fullImportURL();
        for (const [alias, key] of [
            ["image", "imageUrl"], ["roastDate", "roastingDate"], ["roastLevel", "roast"],
            ["process", "processing"], ["cuppingScore", "cupping_points"], ["decaf", "decaffeinated"],
            ["rest_days", "restDays"], ["peak_day", "peakDay"], ["best_until_day", "bestUntilDay"],
            ["color", "colour"]
        ]) {
            const value = canonical.searchParams.get(`bean.${key}`) ?? canonical.searchParams.get(`bean.${alias}`)!;
            canonical.searchParams.delete(`bean.${alias}`);
            canonical.searchParams.set(`bean.${key}`, value);
            aliases.searchParams.delete(`bean.${key}`);
            aliases.searchParams.set(`bean.${alias}`, value);
        }
        const a = viewFor(canonical), b = viewFor(aliases);
        b.openAppURL = a.openAppURL;
        const original = body(renderImportPage(a, options));
        const aliased = body(renderImportPage(b, options));
        expect(text(aliased)).toBe(text(original));
        expect(links(aliased)).toEqual(links(original));
        expect(aliased.match(/<img\b[^>]*>/g)).toEqual(original.match(/<img\b[^>]*>/g));
    });

    it("preserves distinct places but folds identical origin/country/region, preferring Country", () => {
        const url = fullImportURL();
        url.searchParams.set("bean.origin", "  ETHIOPIA ");
        url.searchParams.set("bean.region", "ethiopia");
        const html = body(renderImportPage(viewFor(url), options));
        fact(html, "Country", "Ethiopia");
        expect(html).not.toContain("<dt>Origin</dt>");
        expect(html).not.toContain("<dt>Region</dt>");
        url.searchParams.set("bean.origin", "East Africa");
        url.searchParams.set("bean.region", "Guji");
        const distinct = body(renderImportPage(viewFor(url), options));
        fact(distinct, "Origin", "East Africa");
        fact(distinct, "Country", "Ethiopia");
        fact(distinct, "Region", "Guji");
    });

    it("shows three distinct producer destinations separately from xBloom", () => {
        const content = body(renderImportPage(viewFor(), options));
        for (const [label, href] of [
            ["Coffee page", "https://producer.example.test/coffee"],
            ["Producer's recipe page", "https://producer.example.test/recipe?one=1&two=2"],
            ["Coffee catalogue", "https://producer.example.test/feed.json"]
        ]) expect(links(content)).toContainEqual(expect.objectContaining({label, href}));
        expect(links(content).find(link => link.label === "View on xBloom")?.href)
            .toBe(fullImportURL().searchParams.get("share"));
    });

    it("deduplicates normalized producer destinations with all role labels", () => {
        const url = fullImportURL();
        url.searchParams.set("bean.url", "https://PRODUCER.example.test");
        url.searchParams.set("recipe.url", "https://producer.example.test/");
        url.searchParams.set("feed", "https://producer.example.test/");
        const destinations = links(body(renderImportPage(viewFor(url), options)))
            .filter(link => link.href === "https://producer.example.test/");
        expect(destinations).toHaveLength(1);
        for (const role of ["Coffee page", "Producer's recipe page", "Coffee catalogue"]) {
            expect(destinations[0].label).toContain(role);
        }
    });

    it("labels distinct images with compact dimensions and no referrer or event handlers", () => {
        const html = body(renderImportPage(viewFor(), options));
        const images = [...html.matchAll(/<img\b[^>]*>/g)].map(match => match[0]);
        expect(images).toHaveLength(2);
        expect(images[0]).toContain('alt="Recipe artwork"');
        expect(images[1]).toContain('alt="Coffee photo"');
        for (const image of images) {
            expect(image).toContain('width="96" height="96"');
            expect(image).toContain('referrerpolicy="no-referrer"');
            expect(image).not.toMatch(/\bon\w+=/);
        }
        expect(html).toContain("<figcaption>Recipe artwork</figcaption>");
        expect(html).toContain("<figcaption>Coffee photo</figcaption>");
    });

    it("shows identical image URLs only once while retaining both roles", () => {
        const url = fullImportURL();
        url.searchParams.set("bean.image", "https://images.example.test/pod.jpg");
        const html = body(renderImportPage(viewFor(url), options));
        expect(html.match(/<img\b/g)).toHaveLength(1);
        expect(text(html)).toContain("Recipe artwork / Coffee photo");
    });

    it("does not resurrect an optional image stripped by the parser", () => {
        const url = fullImportURL();
        url.searchParams.set("bean.image", "http://images.example.test/invalid.jpg");
        const html = body(renderImportPage(viewFor(url), options));
        expect(html.match(/<img\b/g)).toHaveLength(1);
        expect(html.match(/<img\b[^>]*>/g)?.join("")).not.toContain("invalid.jpg");
        expect(text(html)).not.toContain("invalid.jpg");
    });

    it("shows stated source, captured sharer and pod ID without endorsement or unknown claims", () => {
        const url = fullImportURL();
        url.searchParams.set("source", "Independent <producer>");
        url.searchParams.set("unknownClaim", "Verified official partner");
        const detail = {...importDetail(), shareMemberName: 'Person "A" & B'};
        const html = body(renderImportPage(viewFor(url, detail), options));
        fact(html, "Stated source", "Independent <producer>");
        fact(html, "Shared by", 'Person "A" & B');
        fact(html, "Pod ID", "XB0001");
        expect(html).toContain("<h1>Producer&#39;s morning recipe</h1>");
        fact(html, "xBloom recipe", "Morning coffee");
        expect(text(html)).toContain("Independent app. Not affiliated with xBloom.");
        expect(html).not.toContain("Verified official partner");
    });
});

describe("brewing figures", () => {
    it("renders actual stage water, unchanged grind, RPM, cup and every stage's full settings", () => {
        const html = body(renderImportPage(viewFor(), options));
        for (const [label, value] of [
            ["Coffee", "15 g"], ["Stage water", "240 ml"], ["Ratio", "1:16"],
            ["Grind", "54"], ["RPM", "90"], ["Cup", "Omni"], ["Planned total water", "270 ml"]
        ]) fact(html, label, value);
        for (const [index, values] of [
            [1, ["40 ml", "93 °C", "Centered", "3 ml/s", "30 seconds", "Agitation before: Off", "Agitation after: Off"]],
            [2, ["120 ml", "93 °C", "Spiral", "3.5 ml/s", "15 seconds", "Agitation before: On", "Agitation after: Off"]],
            [3, ["80 ml", "92 °C", "Circular", "3 ml/s", "0 seconds", "Agitation before: Off", "Agitation after: On"]]
        ] as const) {
            const stage = new RegExp(`<article aria-label="Stage ${index}">([\\s\\S]*?)</article>`).exec(html)![1];
            for (const value of values) expect(text(stage)).toContain(value);
        }
        const bypass = /<section aria-label="Bypass">([\s\S]*?)<\/section>/.exec(html)![1];
        expect(text(bypass)).toContain("30 ml");
        expect(text(bypass)).toContain("93 °C");
    });

    it.each([[1, "xPod"], [2, "Omni"], [3, "Other"], [4, "Tea"]] as const)(
        "uses normalized cup labels for upstream type %s", (cupType, label) => {
            const detail = importDetail();
            const html = renderImportPage(viewFor(fullImportURL(), {
                ...detail, recipeVo: {...detail.recipeVo, cupType, grinderSize: 26, adaptedModel: 2}
            }), options);
            fact(body(html), "Cup", label);
            fact(body(html), "Grind", "26");
            expect(text(body(html))).toContain("Original");
            if (cupType === 4) {
                fact(body(html), "Tea", "15 g");
                fact(body(html), "Cups", "3");
                expect(html).toMatch(/name="description" content="[^"]*tea/);
            }
        }
    );

    it("honors grinder off including the sentinel and states bypass off", () => {
        const view = viewFor();
        view.recipe.grindSize = 81;
        view.recipe.bypassEnabled = false;
        fact(body(renderImportPage(view, options)), "Grind", "Off");
        view.recipe.grindSize = 54;
        view.recipe.grinder = false;
        const html = body(renderImportPage(view, options));
        fact(html, "Grind", "Off");
        expect(text(html)).toContain("Bypass Off");
        fact(html, "Planned total water", "240 ml");
    });

    it("explains mismatch using actual stage water and dose × ratio without mutating the recipe", () => {
        const view = viewFor();
        view.recipe.ratio = 17;
        const html = body(renderImportPage(view, options));
        fact(html, "Stage water", "240 ml");
        expect(text(html)).toContain("Water mismatch");
        expect(text(html)).toContain("240 ml");
        expect(text(html)).toContain("255 ml");
        expect(view.recipe.ratio).toBe(17);
        expect(view.recipe.pours.map(pour => pour.volume)).toEqual([40, 120, 80]);
        view.recipe.ratio = 16 + 0.5 / 15;
        expect(body(renderImportPage(view, options))).not.toContain("Water mismatch");
    });

    it.each(["implied", "stage", "total"] as const)("rejects finite inputs with %s water overflow", kind => {
        const view = viewFor();
        if (kind === "implied") {
            const detail = importDetail();
            const input = {...detail, recipeVo: {...detail.recipeVo, dose: 1e308,
                pourList: detail.recipeVo.pourList.map(pour => ({...pour, volume: 5e307}))}};
            const built = viewFor(fullImportURL(), input);
            expect(built.recipe.ratio).toBe(2);
            expect(() => renderImportPage(built, options)).toThrow(InvalidImportDataError);
            return;
        }
        if (kind === "stage") {
            view.recipe.pours.forEach(pour => { pour.volume = -1e308; });
        } else {
            view.recipe.pours.forEach(pour => { pour.volume = 0; });
            view.recipe.pours[0].volume = Number.MAX_VALUE;
            view.recipe.dosage = 1;
            view.recipe.ratio = 1;
            view.recipe.bypassVolume = Number.MAX_VALUE;
        }
        expect(() => renderImportPage(view, options)).toThrow(InvalidImportDataError);
    });
});

describe("safe document and persistent actions", () => {
    it.each([
        ["Android", DOWNLOADS.android], ["iPhone", DOWNLOADS.ios], ["iPad", DOWNLOADS.ios],
        ["iPod", DOWNLOADS.ios], ["Mozilla/5.0 X11", "#get-app"], ["", "#get-app"]
    ])("chooses an honest install destination for %j", (userAgent, expected) => {
        const html = body(renderImportPage(viewFor(), {...options, userAgent}));
        expect(links(html).find(link => link.label === "Get XBRW++")?.href).toBe(expected);
        expect(links(html).some(link => link.href === DOWNLOADS.ios)).toBe(true);
        expect(links(html).some(link => link.href === DOWNLOADS.android)).toBe(true);
        expect(html).toContain('id="get-app"');
        expect(text(html)).toContain("After installing, return to this page and tap Open app.");
        expect(html).not.toMatch(/play\.google|deferred/i);
    });

    it("uses the verified public downloads", () => {
        expect(DOWNLOADS).toEqual({
            ios: "https://apps.apple.com/app/id6806339475",
            android: "https://github.com/hessius/XBRW/releases/latest"
        });
    });

    it("retains the original full query exactly in the escaped app href, ignoring option overrides", () => {
        const url = fullImportURL();
        url.search += "&duplicate=first&duplicate=second&literal=a+b%2Bc%2Fd%3De%25%26"
            + "&nested=https%3A%2F%2Fexample.test%2F%3Fid%3Da%252Bb%252F%253D&unicode=%C3%A9";
        const view = viewFor(url);
        const html = renderImportPage(view, {...options, openAppURL: "xbrw://wrong", xbloomURL: "https://wrong.test"});
        expect(links(body(html)).find(link => link.label === "Open app")?.href).toBe(`xbrw://import${url.search}`);
        expect(links(body(html)).find(link => link.label === "View on xBloom")?.href).toBe(view.xbloomURL);
        for (const link of links(html)) expect(link.attributes).toContain('rel="noopener noreferrer"');
    });

    it("builds metadata from the same view and escapes page URL, nonce and photo attributes", () => {
        const url = fullImportURL();
        const image = 'https://images.example.test/bag.jpg?a="&b=\'';
        url.searchParams.set("bean.image", image);
        const view = viewFor(url);
        const html = renderImportPage(view, {...options, nonce: 'n"&<', pageURL: url.toString()});
        expect(html).toMatch(/^<!doctype html><html lang="en">/);
        expect(html).toContain('<meta charset="utf-8">');
        expect(html).toContain('content="width=device-width, initial-scale=1, viewport-fit=cover"');
        expect(html).toContain('<meta name="referrer" content="no-referrer">');
        expect(html).toContain("<title>Producer&#39;s morning recipe | XBRW++</title>");
        expect(html).toContain('<meta property="og:type" content="website">');
        expect(html).toContain('<meta property="og:title" content="Producer&#39;s morning recipe">');
        expect(html).toContain(`<meta property="og:url" content="${escapeHTML(url.toString())}">`);
        expect(html).toContain(`<meta property="og:image" content="${escapeHTML(view.recipe.imageURL!)}">`);
        const description = /name="description" content="([^"]*)"/.exec(html)![1];
        expect(html).toContain(`<meta property="og:description" content="${description}">`);
        expect(decode(description)).toContain("coffee");
        expect(html).toContain('<style nonce="n&quot;&amp;&lt;">');
        expect(body(html)).toContain(`src="${escapeHTML(image)}"`);
    });

    it("omits unavailable OG URL/image and uses the coffee image when it is the only image", () => {
        const view = viewFor();
        view.recipe.imageURL = undefined;
        expect(renderImportPage(view, options)).toContain(
            '<meta property="og:image" content="https://images.example.test/bag.jpg">');
        view.recipe.coffee = undefined;
        const html = renderImportPage(view, options);
        expect(html).not.toContain('property="og:image"');
        expect(html).not.toContain('property="og:url"');
    });

    it("escapes all HTML metacharacters and malicious names, notes and provenance without scripts", () => {
        expect(escapeHTML('&<>"\'')).toBe("&amp;&lt;&gt;&quot;&#39;");
        const malicious = '"><script>alert(1)</script>';
        const url = fullImportURL();
        for (const key of ["recipe.name", "bean.name", "bean.roaster", "bean.note", "source"]) {
            url.searchParams.set(key, malicious);
        }
        const html = renderImportPage(viewFor(url, {...importDetail(), shareMemberName: malicious}), options);
        expect(body(html)).toContain(`<h1>${escapeHTML(malicious)}</h1>`);
        expect(body(html)).toContain(escapeHTML(malicious));
        expect(html).not.toMatch(/<script\b|<iframe\b|\bon(?:load|error|click)=|http-equiv=["']?refresh/i);
        expect(html).not.toMatch(/window\.|setTimeout|location\.|analytics|autolaunch/);
    });

    it("uses a separate footer grid row, real content scrolling and canonical CSS without overlays", () => {
        const view = viewFor();
        const html = renderImportPage(view, options);
        const css = /<style[^>]*>([\s\S]*?)<\/style>/.exec(html)![1];
        expect(body(html)).toMatch(/<main tabindex="0" aria-label="Import page content">/);
        expect(body(html)).toMatch(/<\/main>\s*<footer class="app-dock" aria-label="Recipe actions">/);
        for (const rule of [
            "height:100dvh", "display:grid", "grid-template-rows:minmax(0,1fr) auto",
            "min-height:0", "overflow:auto", "max-height:45dvh", "min-height:48px",
            "min-height:44px", "env(safe-area-inset-bottom)", "env(safe-area-inset-left)",
            "max-width:740px", "white-space:pre-wrap", "overflow-wrap:anywhere",
            "object-fit:contain", ":focus-visible", "clamp(28px,6vw,42px)"
        ]) expect(css).toContain(rule);
        expect(css).not.toMatch(/position:\s*(fixed|absolute)|animation|@import|url\(/);
        expect(css).toContain(`--accent:${accents.coffee[view.recipe.accentIndex ?? 0]}`);
        expect(css).toContain(palette.base);
        expect(css).toContain(palette.text);
        expect(css).toContain(onAccent.text);
        expect(css).not.toContain(view.link.colour);
        view.recipe.accentIndex = 10000;
        expect(renderImportPage(view, options)).toContain(`--accent:${accents.coffee[0]}`);
        view.recipe.cupType = 3;
        expect(renderImportPage(view, options)).toContain(`--accent:${accents.tea[0]}`);
    });

    it.each([undefined, "javascript:alert(1)", "https://other.test/import", "xbrw://wrong"])(
        "does not invent an app launch for unavailable/invalid error action %j", openAppURL => {
            const html = renderImportError('Bad <link> & "message"', {...options, openAppURL});
            expect(body(html)).toContain("<h1>Could not load this recipe</h1>");
            expect(body(html)).toContain("Bad &lt;link&gt; &amp; &quot;message&quot;");
            expect(text(body(html))).toContain("Check the link or try again.");
            expect(text(body(html))).toContain("Open app unavailable");
            expect(text(body(html))).toContain("xBloom page unavailable");
            expect(links(html).some(link => link.label === "Open app")).toBe(false);
            expect(html).not.toMatch(/Stage water|og:image|og:description|<script/);
            expect(html).toContain(`--accent:${accents.coffee[0]}`);
            expect(text(body(html))).toContain("After installing, return to this page and tap Open app.");
        }
    );

    it("can keep validated error actions but rejects falsely labelled xBloom destinations", () => {
        const view = viewFor();
        const html = renderImportError("Try again", {...options, openAppURL: view.openAppURL, xbloomURL: view.xbloomURL});
        expect(links(body(html))).toEqual(expect.arrayContaining([
            expect.objectContaining({label: "Open app", href: view.openAppURL}),
            expect.objectContaining({label: "View on xBloom", href: view.xbloomURL})
        ]));
        for (const xbloomURL of ["https://evil.test", "http://share-h5.xbloom.com/?id=one",
            "https://share-h5.xbloom.com.evil.test/?id=one", "https://share-h5.xbloom.com/"]) {
            const invalid = renderImportError("Try again", {...options, xbloomURL});
            expect(text(body(invalid))).toContain("xBloom page unavailable");
        }
    });
});
