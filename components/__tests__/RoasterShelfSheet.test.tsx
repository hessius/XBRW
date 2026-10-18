import React from "react";
import {fireEvent, screen} from "@testing-library/react-native";

import RoasterShelfSheet from "@/components/RoasterShelfSheet";
import ShelfOverflowSheet from "@/components/ShelfOverflowSheet";
import ShelfRoom, {type RoomRecipeActions} from "@/components/ShelfRoom";
import Recipe from "@/library/Recipe";
import {planRoasterSync} from "@/library/roasterShelf";
import {renderWithProviders} from "@/test-utils/render";
import {feed} from "@/test-utils/roasterFeed";

const plan = planRoasterSync(feed([{id: "a"}, {id: "b"}]), []);

describe("RoasterShelfSheet", () => {
    it("asks to subscribe, in the owner's words", async () => {
        await renderWithProviders(
            <RoasterShelfSheet state={{phase: "offer", plan, count: 2}}
                               onAccept={jest.fn()} onDecline={jest.fn()} onCancel={jest.fn()}/>
        );
        expect(screen.getByText("Subscribe to Test Roaster?")).toBeTruthy();
        expect(screen.getByText("Keep all 2 Test Roaster coffees on a shelf. " +
            "New coffees are added and sold-out ones are marked, automatically.")).toBeTruthy();
        expect(screen.getByRole("checkbox", {name: "Don't ask again for this roaster"})).toBeTruthy();
    });

    it("passes the tick with the answer", async () => {
        const onAccept = jest.fn();
        const onDecline = jest.fn();
        await renderWithProviders(
            <RoasterShelfSheet state={{phase: "offer", plan, count: 2}}
                               onAccept={onAccept} onDecline={onDecline} onCancel={jest.fn()}/>
        );

        await fireEvent.press(screen.getByTestId("roaster-shelf-not-now"));
        expect(onDecline).toHaveBeenLastCalledWith(false);

        await fireEvent.press(screen.getByTestId("roaster-shelf-dont-ask"));
        expect(screen.getByRole("checkbox")).toBeChecked();
        await fireEvent.press(screen.getByTestId("roaster-shelf-subscribe"));
        expect(onAccept).toHaveBeenLastCalledWith(true);
        // Reset for the next question.
        expect(screen.getByRole("checkbox")).not.toBeChecked();
    });

    it("shows progress and stops when asked", async () => {
        const onCancel = jest.fn();
        await renderWithProviders(
            <RoasterShelfSheet state={{phase: "adding", plan, done: 6, total: 12}}
                               onAccept={jest.fn()} onDecline={jest.fn()} onCancel={onCancel}/>
        );
        expect(screen.getByText("ADDING 7 OF 12")).toBeTruthy();
        expect(screen.getByLabelText("Adding 7 of 12")).toBeTruthy();

        await fireEvent.press(screen.getByTestId("roaster-shelf-stop"));
        expect(onCancel).toHaveBeenCalledTimes(1);
    });
});

function named(name: string): Recipe {
    const recipe = new Recipe();
    recipe.name = name;
    return recipe;
}

const actions = (): RoomRecipeActions => ({
    onOpen: jest.fn(), onLongPress: jest.fn(), onShare: jest.fn(), onWrite: jest.fn(),
    onDuplicate: jest.fn(), onDelete: jest.fn(), onHistory: jest.fn()
});

describe("sold-out coffees in a shelf room", () => {
    it("are badged, spoken and moved to the end, never hidden", async () => {
        const gone = named("Gone");
        const here = named("Here");
        await renderWithProviders(
            <ShelfRoom label="Test Roaster" namedByUser recipes={[gone, here]}
                       soldOut={new Set([gone.uuid])}
                       onBack={jest.fn()} actionsFor={actions}/>
        );

        expect(screen.getAllByTestId("recipe-tile-sold-out")).toHaveLength(1);
        expect(screen.getByLabelText(/Gone, coffee, sold out/)).toBeTruthy();
        const names = screen.getAllByTestId(/^recipe-tile-/)
            .map((node) => node.props.testID as string)
            .filter((id) => id.startsWith(`recipe-tile-${gone.uuid}`) || id.startsWith(`recipe-tile-${here.uuid}`));
        expect(names).toEqual([`recipe-tile-${here.uuid}`, `recipe-tile-${gone.uuid}`]);
    });
});

describe("a subscribed shelf's menu", () => {
    it("offers refresh and the subscriptions screen only when they are given", async () => {
        const onRefresh = jest.fn();
        const onManage = jest.fn();
        const {rerender} = await renderWithProviders(
            <ShelfOverflowSheet open shelf="Test Roaster" count={3} mine
                                onOpenChange={jest.fn()} onRename={jest.fn()} onDuplicate={jest.fn()}
                                onDelete={jest.fn()} onPromote={jest.fn()} onDemote={jest.fn()}
                                onRefresh={onRefresh} onManageSubscription={onManage}/>
        );
        await fireEvent.press(screen.getByTestId("shelf-overflow-refresh"));
        expect(onRefresh).toHaveBeenCalledTimes(1);
        await fireEvent.press(screen.getByTestId("shelf-overflow-subscription"));
        expect(onManage).toHaveBeenCalledTimes(1);

        await rerender(
            <ShelfOverflowSheet open shelf="Mornings" count={3} mine
                                onOpenChange={jest.fn()} onRename={jest.fn()} onDuplicate={jest.fn()}
                                onDelete={jest.fn()} onPromote={jest.fn()} onDemote={jest.fn()}/>
        );
        expect(screen.queryByTestId("shelf-overflow-refresh")).toBeNull();
        expect(screen.queryByTestId("shelf-overflow-subscription")).toBeNull();
    });
});
