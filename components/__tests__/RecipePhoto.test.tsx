import React from "react";
import {fireEvent, screen} from "@testing-library/react-native";

import RecipePhoto from "@/components/RecipePhoto";
import {renderWithProviders} from "@/test-utils/render";

function photo() {
    return screen.queryByTestId("photo", {includeHiddenElements: true});
}

describe("RecipePhoto", () => {
    it.each([20, 21, 36, 44])("reuses one decode size without changing the %ipt photo frame", async size => {
        await renderWithProviders(<RecipePhoto testID="photo" uri="https://example.com/a.jpg"
            size={size} radius={size / 2}/>);
        expect(photo()).toHaveStyle({
            width: 44, height: 44, position: "absolute",
            left: (size - 44) / 2, top: (size - 44) / 2,
            transform: [{scale: size / 44}]
        });
        expect(photo()?.parent).toHaveStyle({width: size, height: size, borderRadius: size / 2, overflow: "hidden"});
        expect(photo()?.props.resizeMode).toBe("contain");
        expect(photo()?.props.resizeMethod).toBe("resize");
        expect(photo()?.props.source).toEqual({uri: "https://example.com/a.jpg"});
    });

    it("does not upscale a smaller decode for a larger photo", async () => {
        await renderWithProviders(<RecipePhoto testID="photo" uri="https://example.com/a.jpg" size={96} radius={48}/>);
        expect(photo()).toHaveStyle({width: 96, height: 96, transform: [{scale: 1}]});
        expect(photo()?.parent).toHaveStyle({width: 96, height: 96});
    });

    it("keeps the loading image mounted while a hidden thumbnail becomes visible", async () => {
        const view = await renderWithProviders(<RecipePhoto testID="photo" uri="https://example.com/a.jpg"
            size={20} radius={10} visible={false}/>);
        const loading = photo();
        expect(loading?.parent).toHaveStyle({opacity: 0, position: "absolute"});
        await view.rerender(<RecipePhoto testID="photo" uri="https://example.com/a.jpg"
            size={20} radius={10}/>);
        expect(photo()).toBe(loading);
        expect(photo()?.parent).toHaveStyle({opacity: 1});
    });

    it("draws nothing for an empty URL", async () => {
        await renderWithProviders(<RecipePhoto testID="photo" uri="" size={40} radius={8}/>);

        expect(photo()).toBeNull();
    });

    it("tries again when the URL changes after a failure", async () => {
        // The failure belongs to the URL that failed. A recipe whose picture is
        // replaced deserves a fresh attempt, not the old one's verdict.
        await renderWithProviders(
            <RecipePhoto testID="photo" uri="https://example.com/a.jpg" size={40} radius={8}/>
        );
        await fireEvent(photo()!, "error");
        expect(photo()).toBeNull();

        await screen.rerender(
            <RecipePhoto testID="photo" uri="https://example.com/b.jpg" size={40} radius={8}/>
        );

        expect(photo()?.props.source).toEqual({uri: "https://example.com/b.jpg"});
    });
});
