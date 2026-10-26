import {parseImportInput, type ImportSource} from "../../library/importInput";
import type {BrewMindLink} from "../../library/brewmindLink";
import {decorateImport, type ImportCandidate} from "../../library/importDecoration";
import {CUP_TYPE, normaliseRecipeTags} from "../../library/recipeIdentity";
import {InvalidImportDataError, normaliseXBloomRecipe, recordOf, type XBloomRecipeData} from "../../library/xbloomRecipeData";
import type {MachineModel} from "../../library/machine/machineModel";

export type ImportPageView = {
    recipe: XBloomRecipeData & ImportCandidate;
    link: BrewMindLink;
    model: MachineModel;
    openAppURL: string;
    xbloomURL?: string;
};

export function canonicalShareURL(id: string): string {
    const url = new URL("https://share-h5.xbloom.com/");
    url.searchParams.set("id", id);
    return url.toString();
}

export function sourcePageURL(source: ImportSource, supplied: string, podShare?: unknown): string | undefined {
    if (source.kind === "share") {
        const candidate = new URL(supplied);
        if (candidate.protocol === "https:" && candidate.hostname === "share-h5.xbloom.com"
            && !candidate.port && !candidate.username && !candidate.password) return candidate.toString();
        return canonicalShareURL(source.id);
    }
    if (typeof podShare !== "string") return undefined;
    const parsed = parseImportInput(podShare);
    return parsed?.kind === "share" ? canonicalShareURL(parsed.id) : undefined;
}

export function buildImportView(
    detail: unknown, link: BrewMindLink, source: ImportSource, rawSearch: string,
    requestedModel: MachineModel = "studio"
): ImportPageView {
    const root = recordOf(detail), row = recordOf(root.recipeVo);
    const model = row.adaptedModel === 2 ? "original" : row.adaptedModel === 1 ? "studio" : requestedModel;
    if (row.adaptedModel !== undefined && row.adaptedModel !== 1 && row.adaptedModel !== 2) {
        throw new InvalidImportDataError();
    }
    // The app mapper defaults absent values, but wrong-type scalars must not
    // silently become plausible numbers on the browser page.
    if ([row.grinderSize, row.cupType, row.rpm].some(value => value !== undefined && !Number.isFinite(value))) {
        throw new InvalidImportDataError();
    }
    const fields = normaliseXBloomRecipe(detail);
    if (Array.isArray(row.pourList)) {
        for (const stage of row.pourList.slice(0, fields.pours.length)) {
            const pour = recordOf(stage);
            if ([pour.pattern, pour.isEnableVibrationBefore, pour.isEnableVibrationAfter]
                .some(value => value !== undefined && !Number.isFinite(value))) {
                throw new InvalidImportDataError();
            }
        }
    }
    const recipe: XBloomRecipeData & ImportCandidate = {
        ...fields, name: "", tags: [],
        isTea() { return this.cupType === CUP_TYPE.TEA; },
        setTags(tags) { this.tags = normaliseRecipeTags(tags); }
    };
    decorateImport(recipe, {
        coffee: link.coffee, recipeUrl: link.recipeUrl, recipeName: link.recipeName, tags: link.tags,
        colour: link.colour, feed: link.feed, source: link.source === "brewmind" ? "brewmind" : "import"
    });
    if (!Number.isFinite(recipe.dosage) || recipe.dosage <= 0 || !Number.isFinite(recipe.ratio)
        || ![recipe.grindSize, recipe.grindRPM, recipe.defaultCups, recipe.cupType,
            recipe.bypassVolume, recipe.bypassTemp].every(Number.isFinite)
        || recipe.pours.some(pour => ![pour.pourNumber, pour.volume, pour.temperature, pour.flowRate,
            pour.pauseTime, pour.pourPattern, pour.agitation].every(Number.isFinite))) {
        throw new InvalidImportDataError();
    }
    return {
        recipe, link, model, openAppURL: `xbrw://import${rawSearch}`,
        xbloomURL: sourcePageURL(source, link.share, row.shareRecipeLink)
    };
}
