import React from "react";
import {Text} from "react-native";
import {fireEvent, screen} from "@testing-library/react-native";

import ShelfPhotoMark, {coverCells, withShelfPhotos} from "@/components/ShelfPhotoMark";
import {MARK_SIZE} from "@/components/ShelfMark";
import {renderWithProviders} from "@/test-utils/render";

const FALLBACK = <Text testID="fallback-mark">mark</Text>;
const photos = () => screen.queryAllByTestId("shelf-photo", {includeHiddenElements: true});

describe("ShelfPhotoMark", () => {
    it("fills the mark's square with a single picture", async () => {
        await renderWithProviders(<ShelfPhotoMark photos={["https://a.example/1.jpg"]} fallback={FALLBACK}/>);
        expect(photos()).toHaveLength(1);
        expect(photos()[0].props.style).toMatchObject({width: MARK_SIZE, height: MARK_SIZE});
        expect(screen.queryByTestId("fallback-mark")).toBeNull();
    });

    it("draws two or more pictures as a 2x2 mosaic", async () => {
        await renderWithProviders(
            <ShelfPhotoMark photos={["https://a.example/1.jpg", "https://a.example/2.jpg"]}
                            fallback={FALLBACK}/>
        );
        expect(photos()).toHaveLength(4);
        expect(photos()[0].props.style.width).toBe((MARK_SIZE - 2) / 2);
    });

    it("draws the shelf's own mark when there is no picture, or none loads", async () => {
        await renderWithProviders(<ShelfPhotoMark photos={["https://a.example/1.jpg"]} fallback={FALLBACK}/>);
        await fireEvent(photos()[0], "error");
        expect(photos()).toHaveLength(0);
        expect(screen.getByTestId("fallback-mark")).toBeTruthy();

        await renderWithProviders(<ShelfPhotoMark photos={[]} fallback={FALLBACK}/>);
        expect(screen.getByTestId("fallback-mark")).toBeTruthy();
    });

    it("repeats pictures round the cells so a mosaic has no hole", () => {
        expect(coverCells(["a"])).toEqual(["a"]);
        expect(coverCells(["a", "b"])).toEqual(["a", "b", "a", "b"]);
        expect(coverCells(["a", "b", "c"])).toEqual(["a", "b", "c", "a"]);
        expect(coverCells(["a", "b", "c", "d"])).toEqual(["a", "b", "c", "d"]);
    });

    it("takes the pictures away when recipe pictures are off", () => {
        const marks = {tea: {accents: ["#fff"], photos: ["https://a.example/1.jpg"]}};
        expect(withShelfPhotos(marks, true)).toEqual(marks);
        expect(withShelfPhotos(marks, false)).toEqual({tea: {accents: ["#fff"]}});
    });
});
