import {bagBeanName, bagShareBean, handoffBeanName} from "@/library/brew/handoff/bagBean";
import {bagFixture} from "@/test-utils/bags";
import Recipe from "@/library/Recipe";

it("keeps external identity optional and never derives historic identity from a current bag or pod", () => {
    expect(handoffBeanName(undefined)).toBeUndefined();
    expect(handoffBeanName({beanName: " "})).toBeUndefined();
    expect(handoffBeanName({beanName: " Bag 2 "})).toBe("Bag 2");
    expect(bagBeanName({name: "x".repeat(50)})).toBe("x".repeat(40));
    expect(bagBeanName({name: "Local", beanName: "Confirmed"})).toBe("Confirmed");
});

it("sends purchase facts and available pod detail under the explicit physical bag name", () => {
    const recipe = new Recipe();
    recipe.coffee = {name: "Pod name", roaster: "Roaster", origin: "Ecuador",
        farm: "Farm", variety: "Sidra", elevation: 1900};
    recipe.recipeUrl = "https://coffee.example/product";
    expect(bagShareBean(recipe, bagFixture({price: 24.5}), "Second bag")).toMatchObject({
        name: "Second bag", weight: 250, cost: 24.5, roastingDate: "2026-10-12",
        buyDate: "2026-10-23", roaster: "Roaster", country: "Ecuador",
        farm: "Farm", variety: "Sidra", elevation: "1900", url: recipe.recipeUrl
    });
});
