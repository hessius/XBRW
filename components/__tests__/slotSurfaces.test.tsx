import React from "react";
import {fireEvent, screen, waitFor, within} from "@testing-library/react-native";
import {renderWithProviders, SHEET_PRESS_TIMEOUT} from "@/test-utils/render";
import RecipeCard from "@/components/RecipeCard";
import RecipeShelfTile from "@/components/RecipeShelfTile";
import RecipeOverflowSheet from "@/components/RecipeOverflowSheet";
import SelectableRecipeRow from "@/components/SelectableRecipeRow";
import MachinePanel from "@/components/MachinePanel";
import {palette} from "@/constants/colors";
import {TILE_HEIGHT} from "@/components/ShelfTile";
import {coffee} from "@/library/slots/__tests__/fixtures";

it("draws slot assignment markers and exposes the recipe action on list cards", async () => {
    const onEasyMode = jest.fn();
    const recipe = coffee();
    recipe.favourite = true;
    await renderWithProviders(<RecipeCard recipe={recipe} onPress={jest.fn()}
        onEasyMode={onEasyMode} slotMarker={{slots: ["A", "B"], label: "Draft A. Last written B."}}/>);
    expect(screen.getByTestId("slot-marker", {includeHiddenElements: true}))
        .toHaveTextContent("A B");
    const badges = within(screen.getByTestId("recipe-card-badges", {includeHiddenElements: true}));
    expect(badges.getByTestId("slot-marker", {includeHiddenElements: true})).toHaveStyle({fontFamily: "Doto-ExtraBold"});
    expect(badges.getByTestId("recipe-card-favourite", {includeHiddenElements: true})).toBeOnTheScreen();
    expect(screen.queryByText(/Draft A\. Last written B\./, {includeHiddenElements: true})).toBeNull();
    expect(screen.getByRole("button", {name: /Draft A\. Last written B\./})).toBeOnTheScreen();
    await fireEvent(screen.getByTestId("recipe-card"), "accessibilityAction",
        {nativeEvent: {actionName: "easyMode"}});
    expect(onEasyMode).toHaveBeenCalledTimes(1);
});

it("draws the same marker and action on shelf tiles", async () => {
    const recipe = coffee();
    const onEasyMode = jest.fn();
    await renderWithProviders(<RecipeShelfTile recipe={recipe} onPress={jest.fn()}
        onLongPress={jest.fn()} onShare={jest.fn()} onDuplicate={jest.fn()} onDelete={jest.fn()}
        onEasyMode={onEasyMode} slotMarker={{slots: ["C"], label: "Draft C."}}/>);
    expect(within(screen.getByTestId("recipe-tile-badges", {includeHiddenElements: true}))
        .getByTestId("slot-marker", {includeHiddenElements: true})).toHaveTextContent("C");
    expect(screen.getByTestId("recipe-tile")).toHaveStyle({height: TILE_HEIGHT});
    await fireEvent(screen.getByTestId(`recipe-tile-${recipe.uuid}`), "accessibilityAction",
        {nativeEvent: {actionName: "easyMode"}});
    expect(onEasyMode).toHaveBeenCalledTimes(1);
});

it("preserves assignment markers while the library selects recipes", async () => {
    await renderWithProviders(<SelectableRecipeRow recipe={coffee()} selected={false}
        onToggle={jest.fn()} slotMarker={{slots: ["B"], label: "Draft B."}}/>);
    expect(screen.getByRole("checkbox", {name: /Draft B\./})).toBeOnTheScreen();
    expect(screen.getByTestId("slot-marker", {includeHiddenElements: true}))
        .toHaveTextContent("B");
});

it("opens the canonical screen through the existing recipe actions sheet", async () => {
    const onEasyMode = jest.fn();
    await renderWithProviders(<RecipeOverflowSheet open canRefreshName={false}
        onOpenChange={jest.fn()} onShare={jest.fn()} onDuplicate={jest.fn()}
        onDelete={jest.fn()} onEasyMode={onEasyMode}/>);
    await waitFor(async () => {
        await fireEvent.press(screen.getByRole("button", {name: "Assign to Easy Mode"}));
        expect(onEasyMode).toHaveBeenCalledTimes(1);
    }, {timeout: SHEET_PRESS_TIMEOUT});
});

it("offers the canonical screen from the machine panel even while disconnected", async () => {
    const onEasyMode = jest.fn();
    await renderWithProviders(<MachinePanel open status="disconnected" accent={palette.text}
        vitals={null} now={0} onRefreshWater={async () => false} onConnect={jest.fn()}
        onEasyMode={onEasyMode}/>);
    await fireEvent.press(screen.getByRole("button", {name: "Easy Mode slots"}));
    expect(onEasyMode).toHaveBeenCalledTimes(1);
});
