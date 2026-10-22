import Recipe from "@/library/Recipe";
import {snapshotRecipe} from "@/library/slots/slotModel";
import {libraryRecipeForSlot, slotSourceRecipe} from "@/library/slots/slotSource";
import {coffee} from "@/library/slots/__tests__/fixtures";

function copyOf(recipe: Recipe): Recipe {
    return new Recipe(undefined, JSON.stringify(recipe));
}

/** A catalogue fetch: the same share link, a fresh uuid every time. */
function fetched(name = "Kenya - 18g", shareId = "share-kenya"): Recipe {
    const recipe = coffee(name);
    recipe.shareId = shareId;
    return recipe;
}

describe("libraryRecipeForSlot", () => {
    it("leaves a library recipe as it is", () => {
        const held = coffee("Morning");
        const save = jest.fn();
        expect(libraryRecipeForSlot(held, [held], save)).toEqual({recipe: held, saved: false});
        expect(save).not.toHaveBeenCalled();
    });

    it("saves an unsaved catalogue recipe so the slot keeps its uuid", () => {
        const recipe = fetched();
        const save = jest.fn();
        expect(libraryRecipeForSlot(recipe, [coffee("Other")], save)).toEqual({recipe, saved: true});
        expect(save).toHaveBeenCalledWith(recipe);
    });

    it("uses the library's copy of the same link when it brews the same", () => {
        const held = fetched("My Kenya");
        const again = fetched();
        expect(again.uuid).not.toBe(held.uuid);
        const save = jest.fn();
        expect(libraryRecipeForSlot(again, [held], save)).toEqual({recipe: held, saved: false});
        expect(save).not.toHaveBeenCalled();
    });

    it("saves the open recipe when the library's copy of the link brews differently", () => {
        const held = fetched();
        held.pours[0].temperature = 90;
        const again = fetched();
        const save = jest.fn();
        expect(libraryRecipeForSlot(again, [held], save)).toEqual({recipe: again, saved: true});
    });

    it("saves nothing for a recipe a slot cannot hold", () => {
        const recipe = fetched();
        recipe.bypassEnabled = true;
        const save = jest.fn();
        expect(libraryRecipeForSlot(recipe, [], save)).toEqual({recipe, saved: false});
        expect(save).not.toHaveBeenCalled();
    });
});

describe("slotSourceRecipe", () => {
    it("finds the recipe by uuid first", () => {
        const recipe = coffee("Morning");
        const twin = fetched("Morning", "");
        expect(slotSourceRecipe(snapshotRecipe(recipe), [twin, recipe])).toBe(recipe);
    });

    it("reconnects an old slot from an unsaved fetch to the library copy of the same link", () => {
        const slot = snapshotRecipe(fetched());
        const edited = fetched("My Kenya");
        edited.pours[0].temperature = 90;
        const same = fetched("Kenya again");
        const other = fetched("Ethiopia", "share-ethiopia");
        expect(slotSourceRecipe(slot, [other, edited])).toBe(edited);
        expect(slotSourceRecipe(slot, [other, edited, same])).toBe(same);
    });

    it("falls back to the same name and brew when there is no link", () => {
        const slot = snapshotRecipe(coffee("Morning"));
        const saved = copyOf(new Recipe(undefined, slot.recipeJSON));
        saved.uuid = "saved-later";
        const renamed = copyOf(saved);
        renamed.uuid = "renamed";
        renamed.name = "Evening";
        expect(slotSourceRecipe(slot, [renamed, saved])).toBe(saved);
        expect(slotSourceRecipe(slot, [renamed])).toBeUndefined();
    });

    it("still reports a recipe gone when nothing matches", () => {
        const slot = snapshotRecipe(fetched());
        const changed = coffee("Kenya - 18g");
        changed.pours[0].temperature = 90;
        expect(slotSourceRecipe(slot, [changed, fetched("Kenya - 18g", "share-other")])).toBeUndefined();
    });
});
