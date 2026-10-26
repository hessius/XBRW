import Recipe from "./Recipe";
import {adaptedModelFor, type MachineModel} from "@/library/machine/machineModel";
import {podCoffeeFromPodsVo, podImageUrl} from "@/library/podCoffee";
import type {ImportSource} from "./importInput";
import {normaliseXBloomRecipe, xbloomTitle} from "./xbloomRecipeData";

/**
 * Attach the pod's coffee to the recipe it brewed, if it named one.
 *
 * Exported so it can be tested without a network call, and so the one place
 * that reads `podsVo` for coffee is not buried inside a fetch.
 */
export function applyPodCoffee(recipe: Recipe, podsVo: unknown): void {
    const coffee = podCoffeeFromPodsVo(podsVo);
    if (coffee !== null) recipe.coffee = coffee;
}

export class XBloomRecipe {
    private xbRecipeJSON: any | null = null
    private name = "";
    private imageURL = "";
    private subtitle = "";
    private id = "";
    private byXid = false;
    private model: MachineModel;

    /**
     * @param model which machine the recipe is being fetched for. Consulted
     * only by the pod endpoint, which returns a different grind under each;
     * the share endpoint has no such field. Required rather than defaulted
     * because a forgotten call site silently asking for the Studio is #138.
     */
    constructor(source: ImportSource, model: MachineModel) {
        // Told, not guessed. The endpoint used to be chosen by `id.length <= 7`,
        // which sent a short share id to the pod endpoint; `parseImportInput`
        // has already distinguished the two by the time we get here.
        this.byXid = source.kind === "xid";
        this.id = source.kind === "xid" ? source.xid : source.id;
        this.model = model;
    }

    /**
     * Wrap a `recipeVo` this app already holds.
     *
     * The account list returns complete `recipeVo` objects — the #74 spike
     * checked every field `getRecipe` reads — so an account import is one
     * request, not one per recipe. The rows are entered as `xid` sources
     * because that path reads `shareRecipeLink`, which is where a row carries
     * its share id.
     */
    public static fromAccountRow(row: Record<string, unknown>): XBloomRecipe {
        const pods = row.podsVo as {id?: unknown} | undefined;
        const xid = typeof pods?.id === "string" ? pods.id : "";
        // Inert: this instance is handed its `recipeVo` outright and never
        // fetches, so no endpoint ever reads the model.
        const instance = new XBloomRecipe({kind: "xid", xid}, "studio");
        instance.xbRecipeJSON = {recipeVo: row};
        return instance;
    }

    private containsChineseCustomChars(inputString: string) {
        // Define the Unicode values for the characters
        const unicodeCharacters = [0x660E, 0x8C26]; // Unicode for "明" and "谦"

        // Check if the input string includes all the target Unicode characters
        return unicodeCharacters.every(unicode =>
            inputString.includes(String.fromCharCode(unicode))
        );
    }

    public getRecipe(): Recipe | null {
        try {
            let recipe = new Recipe(undefined, undefined);
            Object.assign(recipe, normaliseXBloomRecipe(this.xbRecipeJSON, this.getRecipeTitle()));

            if (this.byXid) {
                let shareLink = this.xbRecipeJSON.recipeVo?.shareRecipeLink ?? "";
                try {
                    const url = new URL(shareLink);
                    const id = url.searchParams.get('id');
                    if (id) {
                        recipe.shareId = decodeURIComponent(id);
                        console.log("Got shareId:", recipe.shareId);
                    }
                } catch (e) {
                    console.log("Error parsing share link:", e);
                }
            } else {
                recipe.shareId = this.id;
            }

            const row = this.xbRecipeJSON.recipeVo;
            console.log('cup:', row.cupType ?? 1, 'cupType:', recipe.cupType);
            for (let i = 0; i < recipe.pours.length; i++) {
                const original = row.pourList[i];
                const pour = recipe.pours[i];
                if (![1, 2, 3].includes(original.pattern)) {
                    console.log("Unknown pour pattern, will use Circular: " + original.pattern);
                }
                if (pour.volume !== original.volume) {
                    console.log("Fixing tea pour volume to 90ml, was: " + original.volume + "ml");
                }
                if (pour.temperature !== original.temperature) {
                    console.log(
                        "Fixing pour temperature to " + pour.temperature +
                        "C, was: " + original.temperature + "C"
                    );
                }
            }
            recipe.fixRatio();
            recipe.offline_backup = recipe.getData();
            return recipe;
        } catch (e) {
            console.log("Error Importing Recipe:" + e);
        }
        return null;
    }

    public getRecipeTitle() {
        return xbloomTitle(this.getName(), this.getSubtitle());
    }

    public getName() {
        return this.name;
    }

    public getSubtitle() {
        if (this.containsChineseCustomChars(this.subtitle)) {
            return ""
        } else {
            return this.subtitle;
        }
    }

    public getImageURL() {
        return this.imageURL;
    }

    /**
     * Fetch the recipe.
     *
     * The signal lets a superseded lookup actually stop rather than merely have
     * its result ignored: the import field can be edited while a request is in
     * flight, and the hook's generation counter is the braces to this belt.
     */
    public async fetchRecipeDetail(signal?: AbortSignal) {
        let apiEndpoint = this.byXid ?
            "https://client-api.xbloom.com/tRecipeDetailOfPods.thtml" :
            "https://client-api.xbloom.com/RecipeDetail.html";

        // Common parameters for both requests
        const baseBody = {
            interfaceVersion: 19700101,
            skey:             "testskey"
        };

        // Conditional body based on byXid flag
        const requestBody = this.byXid ? {
            ...baseBody,
            xid:               this.id,
            languageType:      0,
            // The pod carries one coffee and two recipes. Asking under the
            // wrong machine returns a grind on the other machine's scale,
            // which is what #138 was opened about.
            adaptedModel:      adaptedModelFor(this.model),
            isRefreshScanTime: 1,
            appVersion:        "2.1.2"
        } : {
            ...baseBody,
            tableIdOfRSA: this.id
        };

        const response = await fetch(apiEndpoint, {
            headers: {
                accept:            "application/json, text/plain, */*",
                "accept-language": "en-US,en;q=0.9",
                "content-type":    "application/json",
                Referer:           "https://share-h5.xbloom.com/"
            },
            body:    JSON.stringify(requestBody),
            method:  "POST",
            signal
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        if (data) {
            this.xbRecipeJSON = JSON.parse(JSON.stringify(data));
            console.log(JSON.stringify(this.xbRecipeJSON));
            let recipeVo = this.xbRecipeJSON.recipeVo;
            if (recipeVo) {
                this.name = recipeVo.theName;
                if (recipeVo.podsVo) {
                    this.subtitle = recipeVo.podsVo.subtitle;
                    this.imageURL = podImageUrl(recipeVo.podsVo.imagePath) ?? "";
                    console.log(this.name);
                    console.log(this.imageURL)
                }
            }
        }
        return data;
    }
}
