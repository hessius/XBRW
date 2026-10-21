import React from "react";
import {fireEvent, screen} from "@testing-library/react-native";

import RecipeShelfTile, {
    TILE_PHOTO_GAP, TILE_PHOTO_MIN, TILE_PHOTO_SIZE, tilePhotoSize
} from "@/components/RecipeShelfTile";
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

    /**
     * Lay the tile out as the platform would: a badge row and the free
     * space under it, down to the name.
     */
    async function layOut(badgeRow: number, freeRoom: number) {
        await fireEvent(screen.getByTestId("recipe-tile-badges"), "layout", {
            nativeEvent: {layout: {x: 0, y: 0, width: 136, height: badgeRow}}
        });
        await fireEvent(screen.getByTestId("recipe-tile-free-room"), "layout", {
            nativeEvent: {layout: {x: 0, y: badgeRow, width: 136, height: freeRoom}}
        });
    }

    it("shows it in the top left corner, level with the badges", async () => {
        await renderWithProviders(
            <RecipeShelfTile recipe={pictured("Ethiopia")} {...HANDLERS} showPicture/>
        );
        await layOut(15, 42);

        expect(photo()?.props.source).toEqual({uri: PHOTO});
        const style = photo()?.props.style as {width: number; height: number};
        expect(style.width).toBe(TILE_PHOTO_SIZE);
        expect(style.height).toBe(TILE_PHOTO_SIZE);
        // The badges give up their leading end to it and keep the rest.
        expect(screen.getByTestId("recipe-tile-badges"))
            .toHaveStyle({paddingLeft: TILE_PHOTO_SIZE + TILE_PHOTO_GAP});
    });

    it("is decorative: the name is already in the tile's label", async () => {
        await renderWithProviders(
            <RecipeShelfTile recipe={pictured("Ethiopia")} {...HANDLERS} showPicture/>
        );
        await layOut(15, 42);

        expect(photo()?.props.accessible).toBe(false);
        expect(photo()?.props.importantForAccessibility).toBe("no");
        expect(screen.getByLabelText(/^Ethiopia, coffee/)).toBeTruthy();
    });

    it("shows nothing and keeps no room with the setting off", async () => {
        await renderWithProviders(
            <RecipeShelfTile recipe={pictured("Ethiopia")} {...HANDLERS}/>
        );
        await layOut(15, 42);

        expect(photo()).toBeNull();
        expect(screen.getByTestId("recipe-tile-badges")).toHaveStyle({paddingLeft: 0});
    });

    it("shows nothing for a recipe without a picture", async () => {
        await renderWithProviders(
            <RecipeShelfTile recipe={writable("Ethiopia")} {...HANDLERS} showPicture/>
        );
        await layOut(15, 42);

        expect(photo()).toBeNull();
        expect(screen.getByTestId("recipe-tile-badges")).toHaveStyle({paddingLeft: 0});
    });

    it("drops a picture that fails to load and keeps the name", async () => {
        await renderWithProviders(
            <RecipeShelfTile recipe={pictured("Ethiopia")} {...HANDLERS} showPicture/>
        );
        await layOut(15, 42);
        await fireEvent(photo()!, "error");

        expect(photo()).toBeNull();
        expect(screen.getByText("Ethiopia")).toBeTruthy();
    });

    it("draws nothing until the tile is measured", async () => {
        // A guess is how a picture ends up over the name at a large text
        // size, so it waits for the real room.
        await renderWithProviders(
            <RecipeShelfTile recipe={pictured("Ethiopia")} {...HANDLERS} showPicture/>
        );
        expect(photo()).toBeNull();
    });

    it("shrinks to the room a larger text size leaves", async () => {
        await renderWithProviders(
            <RecipeShelfTile recipe={pictured("Ethiopia")} {...HANDLERS} showPicture/>
        );
        await layOut(18, 28);

        const style = photo()?.props.style as {width: number; height: number};
        expect(style.width).toBe(18 + 28 - TILE_PHOTO_GAP / 2);
        // Never past the name: its top is where the free room ends.
        expect(style.height).toBeLessThanOrEqual(18 + 28);
    });

    it("is left out where it would be too small to tell bags apart", async () => {
        await renderWithProviders(
            <RecipeShelfTile recipe={pictured("Ethiopia")} {...HANDLERS} showPicture/>
        );
        await layOut(21, 18);

        expect(photo()).toBeNull();
        expect(screen.getByTestId("recipe-tile-badges")).toHaveStyle({paddingLeft: 0});
    });

    it("does not change the tile's height", async () => {
        await renderWithProviders(
            <RecipeShelfTile recipe={pictured("Ethiopia")} {...HANDLERS} showPicture/>
        );
        await layOut(15, 42);
        expect(screen.getByTestId("recipe-tile")).toHaveStyle({height: TILE_HEIGHT});
    });

    it("sizes the picture from the measured room", () => {
        expect(tilePhotoSize(0)).toBe(0);
        expect(tilePhotoSize(TILE_PHOTO_MIN + TILE_PHOTO_GAP / 2)).toBe(TILE_PHOTO_MIN);
        expect(tilePhotoSize(TILE_PHOTO_MIN + TILE_PHOTO_GAP / 2 - 1)).toBe(0);
        expect(tilePhotoSize(500)).toBe(TILE_PHOTO_SIZE);
    });
});
