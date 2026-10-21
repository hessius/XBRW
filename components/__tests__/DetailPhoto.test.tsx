import React from "react";
import {StyleSheet} from "react-native";
import {fireEvent, screen} from "@testing-library/react-native";

import {
    DetailPhoto, PHOTO_MAX_ASPECT, PHOTO_MAX_WIDTH, PHOTO_MIN_ASPECT, photoAspect
} from "@/components/CatalogueParts";
import {renderWithProviders} from "@/test-utils/render";

const style = (testID: string) => StyleSheet.flatten(screen.getByTestId(testID).props.style);

describe("photoAspect", () => {
    it("is square until the size is known", () => {
        expect(photoAspect()).toBe(1);
        expect(photoAspect(0, 100)).toBe(1);
        expect(photoAspect(Number.NaN, 100)).toBe(1);
    });

    it("follows the photo between 4:5 and 16:9", () => {
        expect(photoAspect(800, 600)).toBeCloseTo(4 / 3);
        expect(photoAspect(100, 1000)).toBe(PHOTO_MIN_ASPECT);
        expect(photoAspect(3000, 1000)).toBe(PHOTO_MAX_ASPECT);
    });
});

describe("DetailPhoto", () => {
    it("draws a roaster's photo whole: square, full width up to the cap", async () => {
        await renderWithProviders(<DetailPhoto uri="https://roaster.example/a.jpg" testID="p" whole/>);
        expect(style("p")).toMatchObject({width: "100%", maxWidth: PHOTO_MAX_WIDTH, aspectRatio: 1});
    });

    it("takes the photo's own shape once it loads", async () => {
        await renderWithProviders(<DetailPhoto uri="https://roaster.example/a.jpg" testID="p" whole/>);
        await fireEvent(screen.getByTestId("p"), "load", {nativeEvent: {source: {width: 1200, height: 900}}});
        expect(style("p").aspectRatio).toBeCloseTo(4 / 3);
        await fireEvent(screen.getByTestId("p"), "load", {nativeEvent: {source: {width: 500, height: 2000}}});
        expect(style("p").aspectRatio).toBe(PHOTO_MIN_ASPECT);
    });

    it("keeps the community catalogue's banner as it was", async () => {
        await renderWithProviders(<DetailPhoto uri="https://hub.example/a.jpg" testID="h"/>);
        expect(style("h")).toMatchObject({width: "100%", height: 260});
        expect(style("h").aspectRatio).toBeUndefined();
    });
});
