import React from "react";
import {fireEvent, screen} from "@testing-library/react-native";

import RecipePhoto from "@/components/RecipePhoto";
import {renderWithProviders} from "@/test-utils/render";

function photo() {
    return screen.queryByTestId("photo", {includeHiddenElements: true});
}

describe("RecipePhoto", () => {
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
