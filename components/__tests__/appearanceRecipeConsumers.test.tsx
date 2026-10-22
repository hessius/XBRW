import React from "react";
import {processColor, StyleSheet} from "react-native";
import {screen, within} from "@testing-library/react-native";

import RecipeCard from "@/components/RecipeCard";
import RecipeHero from "@/components/RecipeHero";
import RecipeShelfTile from "@/components/RecipeShelfTile";
import ShelfMark from "@/components/ShelfMark";
import ShelfTile from "@/components/ShelfTile";
import ShelfPhotoMark from "@/components/ShelfPhotoMark";
import CloudImportRow from "@/components/CloudImportRow";
import EasyModeSlotCard from "@/components/EasyModeSlotCard";
import {BeanProfileDeck} from "@/components/BeanProfileDeck";
import {BeanProfileSheet} from "@/components/BeanProfileSheet";
import {accents, resolveAppearance} from "@/constants/colors";
import {AppearanceScope} from "@/hooks/useAppearance";
import {THEME_IDS, type AppearanceChoice} from "@/library/appearance";
import Recipe, {CUP_TYPE} from "@/library/Recipe";
import Pour from "@/library/Pour";
import {renderWithProviders} from "@/test-utils/render";
import {measureCardPicture, measureTilePicture, pictureLayout} from "@/test-utils/pictureLayout";

const choices = THEME_IDS.flatMap(theme =>
    (["original", "themed"] as const).map(recipeColours => ({theme, recipeColours})));
const noop = () => {};
const style = (node: ReturnType<typeof screen.getByTestId>) => StyleSheet.flatten(node.props.style);
const scoped = (choice: AppearanceChoice, children: React.ReactNode) =>
    <AppearanceScope choice={choice}>{children}</AppearanceScope>;

it.each(choices)("draws all twelve canonical slots with paired card, hero, tile and page inks: %o", async choice => {
    const appearance = resolveAppearance(choice);
    for (const group of ["coffee", "tea"] as const) {
        for (const [index, canonical] of accents[group].entries()) {
            const recipe = new Recipe();
            recipe.name = `${group} ${index}`;
            recipe.cupType = group === "tea" ? CUP_TYPE.TEA : CUP_TYPE.OMNI;
            recipe.accentIndex = index;
            recipe.dosage = 15;
            recipe.ratio = 16;
            recipe.pours = [new Pour(0, 90)];
            const before = JSON.stringify(recipe);
            const colour = appearance.recipe(canonical);
            const view = await renderWithProviders(scoped(choice, <>
                <RecipeCard recipe={recipe} onPress={noop} editing onDuplicate={noop} onDelete={noop}/>
                <RecipeHero name="Hero" named xid="XID" accent={canonical} beverage="COFFEE"
                    pours={recipe.pours} collapsed={false} onBack={noop} onMore={noop}
                    onHelp={noop} onRename={noop}/>
                <RecipeShelfTile recipe={recipe} onPress={noop} onLongPress={noop}
                    onShare={noop} onDuplicate={noop} onDelete={noop}/>
                <CloudImportRow entry={{cloudId: 1, name: "Cloud", recipe, status: "new",
                    selectable: true, selected: true}} onToggle={noop}/>
            </>));
            expect(screen.getByTestId("recipe-card-surface")).toHaveStyle({backgroundColor: colour.fill});
            expect(screen.getByTestId("recipe-hero")).toHaveStyle({backgroundColor: colour.fill});
            expect(screen.getByTestId("recipe-tile")).toHaveStyle({backgroundColor: colour.fill});
            expect(style(within(screen.getByTestId("recipe-card-surface")).getByText(recipe.name)).color)
                .toBe(colour.onAccent.text);
            expect(style(within(screen.getByTestId("recipe-card-surface")).getByText("DOSE")).color)
                .toBe(colour.onAccent.label);
            expect(screen.getByRole("button", {name: "Delete recipe"})).toHaveStyle({
                backgroundColor: colour.onAccent.key
            });
            for (const [action, ink] of [["duplicate", colour.keyInk.success], ["delete", colour.keyInk.danger]]) {
                const icon = screen.getByTestId(`recipe-card-${action}`, {includeHiddenElements: true});
                expect(within(icon).getAllByTestId("dot-icon-dot", {includeHiddenElements: true})[0])
                    .toHaveStyle({backgroundColor: ink});
            }
            expect(style(screen.getByTestId("hero-name")).color).toBe(colour.onAccent.text);
            for (const surface of ["recipe-card-profile", "recipe-hero"]) {
                expect(within(screen.getByTestId(surface)).getByTestId("profile-wash").props.fill)
                    .toEqual({type: 0, payload: processColor(colour.onAccent.profileFill)});
            }
            expect(style(screen.getByTestId("cloud-import-tick")).color).toBe(colour.ink);
            expect(JSON.stringify(recipe)).toBe(before);
            await view.unmount();
        }
    }
});

it.each(choices)("pairs metadata photo backing with its actual card fill: %o", async choice => {
    const recipe = new Recipe();
    recipe.name = "Photo";
    recipe.accentIndex = 0;
    recipe.imageURL = "https://coffee.example/bag.jpg";
    const view = await renderWithProviders(scoped(choice, <>
        <RecipeCard recipe={recipe} onPress={noop} showPicture/>
        <RecipeShelfTile recipe={recipe} onPress={noop} onLongPress={noop}
            onShare={noop} onDuplicate={noop} onDelete={noop} showPicture/>
    </>));
    await measureCardPicture();
    await measureTilePicture();
    const photo = screen.getByTestId("recipe-card-photo", {includeHiddenElements: true});
    expect(photo.parent).toHaveStyle({backgroundColor: resolveAppearance(choice).recipe(accents.coffee[0]).fill});
    expect(style(photo).width).toBe(20);
    expect(screen.getByTestId("recipe-tile-photo", {includeHiddenElements: true}).parent)
        .toHaveStyle({backgroundColor: resolveAppearance(choice).recipe(accents.coffee[0]).fill});
    expect(screen.queryByTestId("recipe-card-bottom-shade")).toBeNull();
    await view.unmount();
});

it.each(choices)("resolves shelf members only at their drawing boundaries: %o", async choice => {
    const appearance = resolveAppearance(choice);
    const canonicals = accents.coffee.slice(0, 4);
    const members = canonicals.map((accent, index) => ({
        uuid: String(index), accent, imageURL: `https://coffee.example/${index}.jpg`
    }));
    const before = JSON.stringify(members);
    await renderWithProviders(scoped(choice, <>
        <ShelfMark kind="manual" accents={canonicals}/>
        <ShelfTile shelf={{id: "tea", kind: "auto", label: "TEA", count: 4}} inverted
            members={{accents: canonicals}} onPress={noop}/>
        <ShelfPhotoMark members={members} count={4} fallback={null}/>
    </>));
    const marks = screen.getAllByTestId("shelf-mark");
    expect(marks[0]).toHaveStyle({width: 44, height: 44});
    const nativeColours = (node: ReturnType<typeof screen.getByTestId>): string[] => [
        style(node)?.backgroundColor,
        ...node.children.flatMap(child => typeof child === "string" ? [] : nativeColours(child))
    ].filter((value): value is string => typeof value === "string");
    const colours = nativeColours(marks[0]);
    for (const canonical of canonicals.slice(0, 3)) expect(colours).toContain(appearance.recipe(canonical).fill);
    expect(colours).not.toContain(appearance.recipe(canonicals[3]).fill);
    for (const [index, cell] of screen.getAllByTestId("shelf-cover-cell", {includeHiddenElements: true}).entries()) {
        expect(cell).toHaveStyle({
            width: 21, height: 21, backgroundColor: appearance.recipe(canonicals[index]).fill
        });
    }
    expect(JSON.stringify(members)).toBe(before);
});

it("draws a persisted Easy Mode snapshot without recolouring its payload", async () => {
    const recipe = new Recipe();
    recipe.name = "Slot";
    recipe.accentIndex = 0;
    recipe.pours = [new Pour(0, 90)];
    const snapshot = {sourceUuid: recipe.uuid, name: recipe.name, recipeJSON: JSON.stringify(recipe), blob: [1, 2, 3]};
    const before = JSON.stringify(snapshot);
    const choice = {theme: "light", recipeColours: "themed"} as const;
    await renderWithProviders(scoped(choice, <EasyModeSlotCard index={0} snapshot={snapshot}
        needsWrite={false} status={null} recovery={false} locked={false} updateProblem={null}
        onChange={noop} onUpdate={noop}/>));
    expect(screen.getByTestId("slot-A")).toHaveStyle({
        backgroundColor: resolveAppearance(choice).recipe(accents.coffee[0]).fill
    });
    expect(JSON.stringify(snapshot)).toBe(before);
});

it.each(choices)("uses recipe page ink for bean figures but chrome info for an unscoped profile: %o", async choice => {
    const appearance = resolveAppearance(choice);
    const profile = {
        rows: [{field: "process" as const, value: "Natural", brews: 9, rated: 4, avgRating: 4.6}],
        untagged: {brews: 0, rated: 0, avgRating: 0}, counted: 9
    };
    await renderWithProviders(scoped(choice, <>
        <BeanProfileDeck profile={profile} onShowAll={noop} accent={accents.coffee[0]}/>
        <BeanProfileSheet profile={profile} open onOpenChange={noop} accent={accents.coffee[0]}/>
        <BeanProfileDeck profile={profile} onShowAll={noop}/>
    </>));
    const figures = screen.getAllByText("4.6 · 9");
    expect(figures).toHaveLength(3);
    expect(figures[0]).toHaveStyle({color: appearance.recipe(accents.coffee[0]).ink});
    expect(figures[1]).toHaveStyle({color: appearance.recipe(accents.coffee[0]).ink});
    expect(figures[2]).toHaveStyle({color: appearance.palette.info});
});

it.each(["rebeccapurple", "rgba(230, 20, 120, 0.5)", "#aBcD"])(
    "keeps a valid historical accent exact at the hero boundary: %s", async canonical => {
        const choice = {theme: "light", recipeColours: "themed"} as const;
        await renderWithProviders(scoped(choice, <RecipeHero name="Historical" named xid=""
            accent={canonical} beverage="COFFEE" pours={[new Pour(0, 90)]}
            collapsed={false} onBack={noop} onMore={noop} onHelp={noop} onRename={noop}/>));
        expect(screen.getByTestId("recipe-hero")).toHaveStyle({backgroundColor: canonical});
    }
);

it.each(choices)("passes the paired recipe dots into a measured tile profile: %o", async choice => {
    const recipe = new Recipe();
    recipe.accentIndex = 0;
    recipe.pours = [new Pour(0, 90)];
    await renderWithProviders(scoped(choice, <RecipeShelfTile recipe={recipe} onPress={noop}
        onLongPress={noop} onShare={noop} onDuplicate={noop} onDelete={noop} dottedProfile/>));
    await pictureLayout("recipe-tile-profile-room", 140, 60);
    const dots = within(screen.getByTestId("recipe-tile-profile")).getAllByTestId("profile-dot");
    expect(dots[0].props.fill).toEqual({
        type: 0, payload: processColor(resolveAppearance(choice).recipe(accents.coffee[0]).onAccent.profileDot)
    });
});
