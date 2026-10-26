import {accents, onAccent, palette} from "../../constants/colourValues";
import {formatCuppingPoints, formatElevation, formatRoastingDate} from "../../library/coffeeDetails";
import type {PodCoffee} from "../../library/podCoffee";
import {InvalidImportDataError} from "../../library/xbloomRecipeData";
import type {ImportPageView} from "./importView";

export const DOWNLOADS = {
    ios: "https://apps.apple.com/app/id6806339475",
    android: "https://github.com/hessius/XBRW/releases/latest"
} as const;

export type ImportPageOptions = {
    nonce: string;
    userAgent: string;
    pageURL?: string;
    openAppURL?: string;
    xbloomURL?: string;
};

export function escapeHTML(value: string): string {
    const entities: Record<string, string> = {
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    };
    return value.replace(/[&<>"']/g, character => entities[character]);
}

function anchor(href: string, label: string, className = ""): string {
    return `<a href="${escapeHTML(href)}" rel="noopener noreferrer"${className ? ` class="${className}"` : ""}>${escapeHTML(label)}</a>`;
}

function httpsURL(raw: string | undefined): string | undefined {
    if (!raw) return undefined;
    try {
        return new URL(raw).protocol === "https:" ? raw : undefined;
    } catch {
        return undefined;
    }
}

function actionURL(raw: string | undefined, kind: "app" | "xbloom"): string | undefined {
    if (!raw) return undefined;
    try {
        const url = new URL(raw);
        if (url.username || url.password || url.port) return undefined;
        if (kind === "app") {
            return url.protocol === "xbrw:" && url.hostname === "import" && !url.pathname
                && url.searchParams.get("v") === "1" && url.searchParams.get("share")?.trim()
                ? raw : undefined;
        }
        return url.protocol === "https:" && url.hostname === "share-h5.xbloom.com"
            && url.searchParams.get("id")?.trim() ? raw : undefined;
    } catch {
        return undefined;
    }
}

function downloadURL(userAgent: string): string {
    if (/android/i.test(userAgent)) return DOWNLOADS.android;
    if (/iPhone|iPad|iPod/i.test(userAgent)) return DOWNLOADS.ios;
    return "#get-app";
}

function footer(options: ImportPageOptions): string {
    const open = actionURL(options.openAppURL, "app");
    const xbloom = actionURL(options.xbloomURL, "xbloom");
    return `<footer class="app-dock" aria-label="Recipe actions"><div class="dock-content">
${anchor(downloadURL(options.userAgent), "Get XBRW++", "get-app")}
<div class="dock-links">${open ? anchor(open, "Open app") : "<span>Open app unavailable</span>"}
${xbloom ? anchor(xbloom, "View on xBloom") : "<span>xBloom page unavailable</span>"}</div></div></footer>`;
}

function installHelp(): string {
    return `<section id="get-app" aria-labelledby="install-title"><h2 id="install-title">Get XBRW++</h2>
<p>After installing, return to this page and tap Open app.</p>
<div class="source-links">${anchor(DOWNLOADS.ios, "Download for iPhone and iPad")}
${anchor(DOWNLOADS.android, "Android releases on GitHub")}</div></section>`;
}

function pair(label: string, value: string | number): string {
    return `<div><dt>${escapeHTML(label)}</dt><dd>${escapeHTML(String(value))}</dd></div>`;
}

function folded(value: string): string {
    return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function coffeeFacts(coffee: PodCoffee | undefined): string {
    if (!coffee) return "";
    const rows: string[] = [];
    const places = new Set<string>();
    // Country wins an identical broad origin, but distinct geography is retained.
    const preferred = [coffee.country, coffee.origin, coffee.region];
    const kept = preferred.map(value => {
        if (!value?.trim() || places.has(folded(value))) return false;
        places.add(folded(value));
        return true;
    });
    for (const [field, label] of [
        ["origin", "Origin"], ["country", "Country"], ["region", "Region"],
        ["farm", "Farm"], ["farmer", "Farmer"], ["elevation", "Elevation"],
        ["processing", "Process"], ["fermentation", "Fermentation"], ["variety", "Varietal"],
        ["beanMix", "Type"], ["roast", "Roast"], ["roastingDate", "Roasted on"],
        ["flavours", "Flavours"], ["aromatics", "Tasting notes"], ["cupping_points", "Cupping score"],
        ["decaffeinated", "Caffeine"], ["restDays", "Rest"], ["peakDay", "Peak"], ["bestUntilDay", "Best until"]
    ] as const) {
        const raw = coffee[field];
        if (raw === undefined || raw === "" || (Array.isArray(raw) && raw.length === 0)) continue;
        const placeIndex = (["country", "origin", "region"] as string[]).indexOf(field);
        if (placeIndex !== -1 && !kept[placeIndex]) continue;
        let value: string;
        if (field === "elevation") value = formatElevation(coffee.elevation!);
        else if (field === "cupping_points") value = `${formatCuppingPoints(coffee.cupping_points!)} points`;
        else if (field === "roastingDate") value = formatRoastingDate(coffee.roastingDate!);
        else if (field === "decaffeinated") value = raw ? "Decaf" : "Caffeinated";
        else if (field === "restDays" || field === "peakDay" || field === "bestUntilDay") value = `${raw} days`;
        else value = Array.isArray(raw) ? raw.join(", ") : String(raw);
        if (value.trim()) rows.push(pair(label, value));
    }
    return `${rows.length ? `<section aria-labelledby="coffee-title"><h2 id="coffee-title">Coffee facts</h2><dl class="facts">${rows.join("")}</dl></section>` : ""}
${coffee.note?.trim() ? `<section aria-labelledby="notes-title"><h2 id="notes-title">Coffee notes</h2><p class="notes">${escapeHTML(coffee.note)}</p></section>` : ""}`;
}

function sourceLinks(view: ImportPageView): string {
    const destinations = new Map<string, string[]>();
    for (const [raw, label] of [
        [view.recipe.coffee?.url, "Coffee page"],
        [view.recipe.recipeUrl, "Producer's recipe page"],
        [view.link.feed, "Coffee catalogue"]
    ] as const) {
        const url = httpsURL(raw);
        if (!url) continue;
        const normalized = new URL(url).toString();
        const labels = destinations.get(normalized) ?? [];
        labels.push(label);
        destinations.set(normalized, labels);
    }
    if (!destinations.size) return "";
    return `<section aria-labelledby="destinations-title"><h2 id="destinations-title">Destinations</h2>
<div class="source-links">${[...destinations].map(([url, labels]) => anchor(url, labels.join(" / "))).join("")}</div></section>`;
}

function pictures(view: ImportPageView): {html: string; image?: string} {
    const images = new Map<string, {url: string; labels: string[]}>();
    for (const [raw, label] of [
        [view.recipe.imageURL, "Recipe artwork"], [view.recipe.coffee?.imageUrl, "Coffee photo"]
    ] as const) {
        const url = httpsURL(raw);
        if (!url) continue;
        const key = new URL(url).toString();
        const image = images.get(key) ?? {url, labels: []};
        image.labels.push(label);
        images.set(key, image);
    }
    const figures = [...images.values()].map(({url, labels}) => {
        const label = escapeHTML(labels.join(" / "));
        return `<figure><img src="${escapeHTML(url)}" alt="${label}" width="96" height="96" referrerpolicy="no-referrer"><figcaption>${label}</figcaption></figure>`;
    });
    return {
        html: figures.length ? `<div class="pictures">${figures.join("")}</div>` : "",
        image: images.values().next().value?.url
    };
}

function css(accent: string): string {
    return `
:root{color-scheme:dark;--accent:${accent};background:${palette.base};color:${palette.text};font:16px/1.5 system-ui,sans-serif}
*{box-sizing:border-box}
html,body{margin:0}
body{height:100dvh;display:grid;grid-template-rows:minmax(0,1fr) auto}
main{min-height:0;overflow:auto}
.content{max-width:740px;margin:0 auto;padding:24px max(20px,env(safe-area-inset-right)) 24px max(20px,env(safe-area-inset-left))}
p,dd,h1,h2,h3,a,figcaption,span{overflow-wrap:anywhere}
a{color:var(--accent);text-underline-offset:3px}
a:focus-visible,main:focus-visible{outline:2px solid var(--accent);outline-offset:-2px}
.brand{font-size:16px;font-weight:800;letter-spacing:1px;margin:0 0 24px}
.brand span{color:${palette.brand}}
.eyebrow,dt,figcaption,.disclaimer{color:${palette.dim}}
.eyebrow{font-size:14px}
h1{font-size:clamp(28px,6vw,42px);line-height:1.15;margin:8px 0 16px}
h2{font-size:21px;margin:0 0 12px}
h3{font-size:18px;margin:0 0 8px}
p{margin:8px 0 16px}
section{margin-block:28px}
.pictures,.metrics,.tags,.source-links{display:flex;flex-wrap:wrap}
.pictures{gap:16px;margin-block:20px}
figure{margin:0;max-width:100%}
img{width:96px;height:96px;object-fit:contain;background:${palette.surface};border-radius:10px}
figcaption{font-size:13px;max-width:150px}
dl{margin:0}
dd{margin:0}
.metrics{gap:24px;padding:20px 0;border-block:1px solid ${palette.line};margin-block:20px}
.metrics dd{font-size:22px}
.facts{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,190px),1fr));gap:16px 24px}
article{padding:16px 0;border-bottom:1px solid ${palette.line}}
article p{margin:4px 0}
.notes{white-space:pre-wrap}
.tags{gap:8px;list-style:none;padding:0}
.tags li{padding:4px 10px;border:1px solid ${palette.line};border-radius:8px;overflow-wrap:anywhere;max-width:100%}
.source-links{gap:8px 20px}
.source-links a{display:inline-flex;align-items:center;min-height:44px}
.app-dock{background:${palette.surface};border-top:1px solid ${palette.line};max-height:45dvh;overflow:auto;padding:12px max(20px,env(safe-area-inset-right)) max(16px,env(safe-area-inset-bottom)) max(20px,env(safe-area-inset-left))}
.dock-content{max-width:740px;margin:0 auto}
.get-app{display:flex;align-items:center;justify-content:center;width:100%;padding:14px;min-height:48px;border-radius:10px;background:var(--accent);color:${onAccent.text};text-decoration:none;font-weight:750}
.dock-links{display:flex;flex-wrap:wrap;justify-content:space-between;gap:8px 20px;margin-top:4px}
.dock-links a,.dock-links span{display:inline-flex;align-items:center;min-height:44px}
.dock-links span{color:${palette.dim}}
.disclaimer{font-size:14px}
@media(min-width:800px){.content{padding-block:36px}}
`;
}

function documentHTML(
    title: string, content: string, options: ImportPageOptions, accent: string,
    social?: {title: string; description: string; image?: string}
): string {
    return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="referrer" content="no-referrer"><title>${escapeHTML(title)} | XBRW++</title>
<meta name="description" content="${escapeHTML(social?.description ?? "Open this shared recipe in XBRW++ or check the link and try again.")}">
${social ? `<meta property="og:type" content="website"><meta property="og:title" content="${escapeHTML(social.title)}">
<meta property="og:description" content="${escapeHTML(social.description)}">
${httpsURL(options.pageURL) ? `<meta property="og:url" content="${escapeHTML(options.pageURL!)}">` : ""}
${social.image ? `<meta property="og:image" content="${escapeHTML(social.image)}">` : ""}` : ""}
<style nonce="${escapeHTML(options.nonce)}">${css(accent)}</style></head><body>
<main tabindex="0" aria-label="Import page content"><div class="content">
<p class="brand">XBRW<span>++</span></p>${content}${installHelp()}
<p class="disclaimer">Independent app. Not affiliated with xBloom.</p></div></main>
${footer(options)}</body></html>`;
}

export function renderImportPage(view: ImportPageView, options: ImportPageOptions): string {
    const {recipe} = view;
    const tea = recipe.cupType === 3;
    const title = recipe.name || recipe.xbloomName || "Shared recipe";
    const stageWater = recipe.pours.reduce((sum, pour) => sum + pour.volume, 0);
    const impliedWater = recipe.dosage * recipe.ratio;
    const totalWater = stageWater + (recipe.bypassEnabled ? recipe.bypassVolume : 0);
    // Finite operands can still overflow; never publish unusable brewing figures.
    if (![stageWater, impliedWater, totalWater].every(Number.isFinite)) throw new InvalidImportDataError();
    const group = accents[tea ? "tea" : "coffee"];
    const accent = group[recipe.accentIndex ?? 0] ?? group[0];
    const photos = pictures(view);
    const description = `Shared ${tea ? "tea" : "coffee"} recipe: ${title}. ${recipe.dosage} g, ${stageWater} ml stage water, ratio 1:${recipe.ratio}.`;
    const alternate = recipe.name && recipe.xbloomName && recipe.xbloomName !== recipe.name
        ? `<dl>${pair("xBloom recipe", recipe.xbloomName)}</dl>` : "";
    const metrics = [
        pair(tea ? "Tea" : "Coffee", `${recipe.dosage} g`), pair("Stage water", `${stageWater} ml`),
        pair("Ratio", `1:${recipe.ratio}`), pair("Grind", !recipe.grinder || recipe.grindSize === 81 ? "Off" : recipe.grindSize),
        pair("RPM", recipe.grindRPM), pair("Cup", ["xPod", "Other", "Omni", "Tea"][recipe.cupType] ?? "Unknown"),
        tea ? pair("Cups", recipe.defaultCups) : ""
    ].join("");
    const stages = recipe.pours.map(pour => `<article aria-label="Stage ${escapeHTML(String(pour.pourNumber))}">
<h3>Stage ${escapeHTML(String(pour.pourNumber))}</h3>
<p>${escapeHTML(`${pour.volume} ml · ${pour.temperature} °C · ${["Centered", "Circular", "Spiral"][pour.pourPattern] ?? "Unknown pattern"}`)}</p>
<p>${escapeHTML(`Flow: ${pour.flowRate / 10} ml/s · Pause: ${pour.pauseTime} seconds`)}</p>
<p>Agitation before: ${pour.getAgitationBefore() ? "On" : "Off"} · Agitation after: ${pour.getAgitationAfter() ? "On" : "Off"}</p></article>`).join("");
    const provenance = [
        view.link.source ? pair("Stated source", view.link.source) : "",
        recipe.sharedBy ? pair("Shared by", recipe.sharedBy) : "",
        recipe.xid ? pair("Pod ID", recipe.xid) : ""
    ].join("");
    const content = `<header><p class="eyebrow">Shared recipe · ${view.model === "original" ? "Original" : "Studio"}</p>
<h1>${escapeHTML(title)}</h1>${alternate}
${recipe.coffee?.name ? `<p class="coffee-name">${escapeHTML(recipe.coffee.name)}</p>` : ""}
${recipe.coffee?.roaster ? `<p>Roaster: ${escapeHTML(recipe.coffee.roaster)}</p>` : ""}</header>
${photos.html}<dl class="metrics">${metrics}</dl>
${Math.abs(stageWater - impliedWater) >= 1 ? `<p>Water mismatch: stages contain ${escapeHTML(String(stageWater))} ml; dose × ratio implies ${escapeHTML(String(impliedWater))} ml. The supplied recipe has not been adjusted.</p>` : ""}
${stages ? `<section aria-labelledby="stages-title"><h2 id="stages-title">Stages</h2>${stages}</section>` : ""}
<section aria-label="Bypass"><h2>Bypass</h2><p>${recipe.bypassEnabled ? escapeHTML(`${recipe.bypassVolume} ml · ${recipe.bypassTemp} °C`) : "Off"}</p>
<dl>${pair("Planned total water", `${totalWater} ml`)}</dl></section>
${coffeeFacts(recipe.coffee)}
${recipe.tags.length ? `<section aria-labelledby="tags-title"><h2 id="tags-title">Tags</h2><ul class="tags">${recipe.tags.map(tag => `<li>${escapeHTML(tag)}</li>`).join("")}</ul></section>` : ""}
${provenance ? `<section aria-labelledby="source-title"><h2 id="source-title">Source</h2><dl class="facts">${provenance}</dl></section>` : ""}
${sourceLinks(view)}`;
    return documentHTML(title, content, {...options, openAppURL: view.openAppURL, xbloomURL: view.xbloomURL},
        accent, {title, description, image: photos.image});
}

export function renderImportError(message: string, options: ImportPageOptions): string {
    return documentHTML("Could not load this recipe",
        `<h1>Could not load this recipe</h1><p>${escapeHTML(message)}</p><p>Check the link or try again.</p>`,
        options, accents.coffee[0]);
}
