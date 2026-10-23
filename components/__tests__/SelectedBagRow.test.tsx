import React from "react";
import {fireEvent, screen} from "@testing-library/react-native";
import {SelectedBagRow} from "@/components/SelectedBagRow";
import {renderWithProviders} from "@/test-utils/render";

it("exposes one tappable accessible choice with the quantity detail", async () => {
    const onPress = jest.fn();
    await renderWithProviders(<SelectedBagRow label="October bag"
        detail="Approx. 120 g remaining" onPress={onPress}/>);
    await fireEvent.press(screen.getByRole("button", {
        name: "Bag, October bag, Approx. 120 g remaining"
    }));
    expect(onPress).toHaveBeenCalledTimes(1);
});
