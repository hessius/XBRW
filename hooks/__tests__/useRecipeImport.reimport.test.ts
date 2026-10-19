/**
 * Importing a link the library already holds, after its author changed it.
 *
 * The rules are `library/importRefresh.ts`; this pins how the import sheet
 * applies them: quietly for an untouched copy, with a question for an edited
 * one, and never at the cost of the user's name, notes or tags.
 */
import {act, renderHook, waitFor} from "@testing-library/react-native";

import Pour, {POUR_PATTERN} from "@/library/Pour";
import Recipe, {CUP_TYPE} from "@/library/Recipe";
import {sharedSettings} from "@/hooks/useSetting";
import {useRecipeImport} from "@/hooks/useRecipeImport";
import {contentPrint} from "@/library/importRefresh";

jest.mock("@/hooks/useSetting", () =>
    require("@/test-utils/settingsMock").settingsMock());

function fromXBloom(grind = 50): Recipe {
    const recipe = new Recipe();
    recipe.cupType = CUP_TYPE.XPOD;
    recipe.shareId = "share-1";
    recipe.dosage = 15;
    recipe.ratio = 15;
    recipe.grinder = true;
    recipe.grindSize = grind;
    recipe.grindRPM = 120;
    recipe.pours = [new Pour(1, 225, 93, 30, 0, POUR_PATTERN.CIRCULAR, 0)];
    return recipe;
}

const mockGetRecipe = jest.fn<Recipe | null, []>(() => fromXBloom());
jest.mock("@/library/XBloomRecipe", () => ({
    XBloomRecipe: jest.fn().mockImplementation(() => {
        const recipe = mockGetRecipe();
        return {
            fetchRecipeDetail: async () => {},
            getRecipe:   () => recipe,
            getName:     () => "Shared",
            getSubtitle: () => "",
            getImageURL: () => ""
        };
    })
}));

/** The user's copy, imported earlier, with its print on file. */
function stored(): Recipe {
    const mine = fromXBloom(50);
    mine.name = "My Monday coffee";
    mine.description = "My notes";
    mine.setTags(["Mornings"]);
    sharedSettings().set("importFingerprints", JSON.stringify({[mine.uuid]: contentPrint(mine)}));
    return mine;
}

async function importAgain(library: Recipe[]) {
    const onOpenRecipe = jest.fn();
    const onSaveExisting = jest.fn();
    const hook = await renderHook(() => useRecipeImport({stored: library, onOpenRecipe, onSaveExisting}));
    await act(async () => hook.result.current.resolveNow({kind: "share", id: "share-1"}, "shared"));
    return {...hook, onOpenRecipe, onSaveExisting};
}

beforeEach(() => {
    sharedSettings().set("importFingerprints", "");
    mockGetRecipe.mockReset().mockImplementation(() => fromXBloom());
});

describe("importing a held link again", () => {
    it("opens an unchanged copy as it is", async () => {
        const mine = stored();
        const {onOpenRecipe, onSaveExisting} = await importAgain([mine]);
        await waitFor(() => expect(onOpenRecipe).toHaveBeenCalled());
        expect(onOpenRecipe).toHaveBeenCalledWith(mine, true, false);
        expect(onSaveExisting).not.toHaveBeenCalled();
    });

    it("opens local edits without offering an unchanged author version as newer", async () => {
        const mine = stored();
        const originalPrints = sharedSettings().get("importFingerprints");
        mine.grindSize = 55;
        const {onOpenRecipe, onSaveExisting} = await importAgain([mine]);
        await waitFor(() => expect(onOpenRecipe).toHaveBeenCalledWith(mine, true, false));
        expect(mine.grindSize).toBe(55);
        expect(onSaveExisting).not.toHaveBeenCalled();
        expect(sharedSettings().get("importFingerprints")).toBe(originalPrints);
    });

    it("updates an untouched copy quietly and keeps the name, notes and tags", async () => {
        const mine = stored();
        mockGetRecipe.mockImplementation(() => fromXBloom(62));

        const {onOpenRecipe, onSaveExisting} = await importAgain([mine]);

        await waitFor(() => expect(onOpenRecipe).toHaveBeenCalled());
        expect(onOpenRecipe).toHaveBeenCalledWith(mine, true, true);
        expect(onSaveExisting).toHaveBeenCalledWith(mine);
        expect(mine).toMatchObject({grindSize: 62, name: "My Monday coffee", description: "My notes"});
        expect(mine.tags).toEqual(["Mornings"]);
    });

    it("asks before touching an edited copy, and USE THE ROASTER'S LATEST takes it", async () => {
        const mine = stored();
        mine.dosage = 16;
        mockGetRecipe.mockImplementation(() => fromXBloom(62));

        const {result, onOpenRecipe, onSaveExisting} = await importAgain([mine]);

        await waitFor(() => expect(result.current.state.status).toBe("newer"));
        expect(mine.grindSize).toBe(50);
        expect(onOpenRecipe).not.toHaveBeenCalled();

        await act(async () => result.current.acceptLatest());
        expect(mine).toMatchObject({grindSize: 62, name: "My Monday coffee"});
        expect(onSaveExisting).toHaveBeenCalledWith(mine);
        expect(onOpenRecipe).toHaveBeenCalledWith(mine, true, true);
    });

    it("KEEP MINE opens the user's copy unchanged", async () => {
        const mine = stored();
        mine.dosage = 16;
        mockGetRecipe.mockImplementation(() => fromXBloom(62));

        const {result, onOpenRecipe, onSaveExisting} = await importAgain([mine]);
        await waitFor(() => expect(result.current.state.status).toBe("newer"));
        await act(async () => result.current.keepMine());

        expect(mine).toMatchObject({grindSize: 50, dosage: 16});
        expect(onSaveExisting).not.toHaveBeenCalled();
        expect(onOpenRecipe).toHaveBeenCalledWith(mine, true, false);
    });

    it("remembers what a new import looked like, so a later one can tell", async () => {
        const {onOpenRecipe} = await importAgain([]);
        await waitFor(() => expect(onOpenRecipe).toHaveBeenCalled());
        const opened: Recipe = onOpenRecipe.mock.calls[0][0];
        expect(JSON.parse(sharedSettings().get("importFingerprints"))[opened.uuid])
            .toBe(contentPrint(opened));
    });
});

describe("with #223's fill-blanks", () => {
    const decoration = {coffee: {name: "Peru", imageUrl: "https://roaster.example/peru.png"}};

    async function importWithCoffee(library: Recipe[]) {
        const onOpenRecipe = jest.fn();
        const onSaveExisting = jest.fn();
        const hook = await renderHook(() => useRecipeImport({stored: library, onOpenRecipe, onSaveExisting}));
        await act(async () => hook.result.current.resolveNow({kind: "share", id: "share-1"}, "shared", decoration));
        return {...hook, onOpenRecipe, onSaveExisting};
    }

    it("still fills a blank picture when an untouched copy takes the latest", async () => {
        const mine = stored();
        mockGetRecipe.mockImplementation(() => fromXBloom(62));
        const {onOpenRecipe} = await importWithCoffee([mine]);
        await waitFor(() => expect(onOpenRecipe).toHaveBeenCalled());
        expect(mine).toMatchObject({grindSize: 62, imageURL: "https://roaster.example/peru.png",
                                    name: "My Monday coffee"});
    });

    it("still fills a blank picture when the user keeps their edited copy", async () => {
        const mine = stored();
        mine.dosage = 16;
        mockGetRecipe.mockImplementation(() => fromXBloom(62));
        const {result, onSaveExisting} = await importWithCoffee([mine]);
        await waitFor(() => expect(result.current.state.status).toBe("newer"));
        await act(async () => result.current.keepMine());
        expect(mine).toMatchObject({grindSize: 50, imageURL: "https://roaster.example/peru.png"});
        expect(onSaveExisting).toHaveBeenCalledWith(mine);
    });
});
