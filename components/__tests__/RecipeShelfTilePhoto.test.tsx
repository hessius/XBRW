import React from "react";
import {act, fireEvent, screen, within} from "@testing-library/react-native";
import {Dimensions} from "react-native";

import RecipeShelfTile, {
    TILE_PHOTO_SIZE
} from "@/components/RecipeShelfTile";
import {measureTilePicture} from "@/test-utils/pictureLayout";
import {TILE_HEIGHT} from "@/components/ShelfTile";
import Recipe, {CUP_TYPE} from "@/library/Recipe";
import Pour, {POUR_PATTERN} from "@/library/Pour";
import {renderWithProviders} from "@/test-utils/render";

const PHOTO = "https://example.com/bag.jpg";

/** A recipe with figures and a picture, the tile's fullest case. */
function pictured(name: string): Recipe {
    const r = new Recipe();
    r.name = name;
    r.cupType = CUP_TYPE.XPOD;
    r.dosage = 15;
    r.ratio = 15;
    r.grindSize = 60;
    r.pours = [new Pour(0, 225, 93, 30, 0, POUR_PATTERN.CIRCULAR, 0)];
    r.imageURL = PHOTO;
    return r;
}

function writable(name: string): Recipe {
    const r = pictured(name);
    r.imageURL = undefined;
    return r;
}

const HANDLERS = {
    onPress:     jest.fn(),
    onLongPress: jest.fn(),
    onShare:     jest.fn(),
    onDuplicate: jest.fn(),
    onDelete:    jest.fn()
};

describe("RecipeShelfTile picture", () => {
    function photo() {
        return screen.queryByTestId("recipe-tile-photo", {includeHiddenElements: true});
    }

    it("starts loading before layout and reveals the same image once the metadata fits", async () => {
        await renderWithProviders(
            <RecipeShelfTile recipe={pictured("Ethiopia")} {...HANDLERS} showPicture/>
        );
        const loading = photo();
        expect(loading?.props.source.uri).toBe(PHOTO);
        expect(loading?.parent).toHaveStyle({opacity: 0, position: "absolute"});
        await measureTilePicture();
        expect(photo()).toBe(loading);
        expect(photo()?.parent).toHaveStyle({opacity: 1});
        expect(photo()?.parent!.props.style.position).toBeUndefined();
    });

    it("shows it only in the metadata row, never beside the name", async () => {
        await renderWithProviders(
            <RecipeShelfTile recipe={pictured("Ecuador | Vinka Farm Washed")}
                             {...HANDLERS} showPicture/>
        );
        await measureTilePicture();

        expect(photo()?.props.source).toEqual({uri: PHOTO});
        const style = photo()?.props.style as {width: number; height: number};
        expect(style.width).toBe(TILE_PHOTO_SIZE);
        expect(style.height).toBe(TILE_PHOTO_SIZE);

        // One band across the top: the picture, then a column with the badges
        // over the name. The figures and the profile are not in it.
        const top = within(screen.getByTestId("recipe-tile-top"));
        expect(top.getByTestId("recipe-tile-photo", {includeHiddenElements: true}))
            .toBeTruthy();
        expect(top.getByTestId("recipe-tile-badges")).toBeTruthy();
        expect(top.getByText("Ecuador | Vinka Farm Washed").props.numberOfLines).toBe(2);
        expect(top.queryByTestId("recipe-tile-figures")).toBeNull();
        expect(screen.getByTestId("recipe-tile-figures")).toHaveTextContent("15G · 1:15 · 60");
        expect(within(screen.getByTestId("recipe-tile-metadata-width"))
            .getByTestId("recipe-tile-photo", {includeHiddenElements: true})).toBeTruthy();
    });

    it("is decorative: the name is already in the tile's label", async () => {
        await renderWithProviders(
            <RecipeShelfTile recipe={pictured("Ethiopia")} {...HANDLERS} showPicture/>
        );
        await measureTilePicture();

        expect(photo()?.props.accessible).toBe(false);
        expect(photo()?.props.importantForAccessibility).toBe("no");
        expect(screen.getByLabelText(/^Ethiopia, coffee/)).toBeTruthy();
    });

    it("shows nothing with the setting off", async () => {
        await renderWithProviders(
            <RecipeShelfTile recipe={pictured("Ethiopia")} {...HANDLERS}/>
        );
        expect(photo()).toBeNull();
    });

    it("shows nothing for a recipe without a picture", async () => {
        await renderWithProviders(
            <RecipeShelfTile recipe={writable("Ethiopia")} {...HANDLERS} showPicture/>
        );
        expect(photo()).toBeNull();
    });

    it("drops a picture that fails to load and keeps the name", async () => {
        await renderWithProviders(
            <RecipeShelfTile recipe={pictured("Ethiopia")} {...HANDLERS} showPicture/>
        );
        await measureTilePicture();
        await fireEvent(photo()!, "error");

        expect(photo()).toBeNull();
        expect(within(screen.getByTestId("recipe-tile-top")).getByText("Ethiopia"))
            .toBeTruthy();
    });

    it("remeasures a changed URL, mutable badge or recipe identity rather than keeping stale fit", async () => {
        const recipe = pictured("Ethiopia");
        const view = await renderWithProviders(<RecipeShelfTile recipe={recipe} {...HANDLERS} showPicture/>);
        await measureTilePicture();
        await fireEvent(photo()!, "error");
        expect(photo()).toBeNull();
        recipe.imageURL = "https://example.com/new.jpg";
        await view.rerender(<RecipeShelfTile recipe={recipe} {...HANDLERS} showPicture/>);
        expect(photo()?.parent).toHaveStyle({opacity: 0});
        await measureTilePicture();
        expect(photo()?.props.source.uri).toBe(recipe.imageURL);
        recipe.favourite = true;
        await view.rerender(<RecipeShelfTile recipe={recipe} {...HANDLERS} showPicture/>);
        expect(photo()?.parent).toHaveStyle({opacity: 0});
        await measureTilePicture();
        expect(photo()).toBeTruthy();
        await view.rerender(<RecipeShelfTile recipe={pictured("Ethiopia")} {...HANDLERS} showPicture/>);
        expect(photo()).toBeNull();
    });

    it("invalidates intrinsic metadata on Dynamic Type changes without hiding any badges", async () => {
        const window = Dimensions.get("window");
        const display = Dimensions.get("screen");
        await renderWithProviders(<RecipeShelfTile recipe={pictured("Ethiopia")} {...HANDLERS} showPicture editing
            slotMarker={{slots: ["A"], label: "Easy Mode A"}}/>);
        await measureTilePicture();
        expect(photo()).toBeTruthy();
        try {
            await act(async () => Dimensions.set({window: {...window, fontScale: 1.8}, screen: display}));
            expect(photo()?.parent).toHaveStyle({opacity: 0});
            expect(screen.getByTestId("slot-marker", {includeHiddenElements: true})).toHaveTextContent("A");
            expect(screen.getByTestId("recipe-tile-actions", {includeHiddenElements: true})).toBeTruthy();
            await measureTilePicture(120, 140);
            expect(photo()?.parent).toHaveStyle({opacity: 0});
            expect(screen.getByTestId("recipe-tile-figures")).toHaveTextContent("15G · 1:15 · 60");
        } finally {
            await act(async () => Dimensions.set({window, screen: display}));
        }
    });

    it("does not change the tile's height", async () => {
        await renderWithProviders(
            <RecipeShelfTile recipe={pictured("Ethiopia")} {...HANDLERS} showPicture/>
        );
        expect(screen.getByTestId("recipe-tile")).toHaveStyle({height: TILE_HEIGHT});
    });

    it("keeps every badge, the name, the figures and the profile with it", async () => {
        const recipe = pictured("Ecuador | Vinka Farm Washed");
        recipe.favourite = true;
        await renderWithProviders(
            <RecipeShelfTile recipe={recipe} {...HANDLERS} showPicture
                             evidence={{brews: 6, avgRating: 4.25, lastBrewedAt: 0}}/>
        );
        await fireEvent(screen.getByTestId("recipe-tile-profile-room"), "layout", {
            nativeEvent: {layout: {x: 0, y: 0, width: 160, height: 30}}
        });
        await measureTilePicture(160, 220);

        const badges = within(screen.getByTestId("recipe-tile-badges"));
        expect(badges.getByTestId("recipe-tile-evidence")).toBeTruthy();
        expect(badges.getByTestId("recipe-tile-favourite", {includeHiddenElements: true}))
            .toBeTruthy();
        expect(badges.getByText("COFFEE")).toBeTruthy();
        // A narrow tile has more badges than one row holds: they wrap rather
        // than run off the edge.
        expect(screen.getByTestId("recipe-tile-badges"))
            .toHaveStyle({flexWrap: "wrap", justifyContent: "flex-end"});
        expect(photo()?.parent).toHaveStyle({opacity: 0});
        expect(screen.getByTestId("recipe-tile-figures")).toBeTruthy();
        expect(within(screen.getByTestId("recipe-tile-profile-room"))
            .getByTestId("recipe-tile-profile")).toBeTruthy();
    });
});
