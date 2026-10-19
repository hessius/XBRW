import React from "react";
import {fireEvent, screen, within} from "@testing-library/react-native";

import RecipeShelfTile, {
    PROFILE_CLEARANCE, PROFILE_HEIGHT, PROFILE_MIN_HEIGHT, tileProfileHeight
} from "@/components/RecipeShelfTile";
import {PROFILE_STROKE_WIDTH} from "@/components/PourProfile";
import Recipe, {CUP_TYPE} from "@/library/Recipe";
import Pour, {POUR_PATTERN} from "@/library/Pour";
import {renderWithProviders} from "@/test-utils/render";
import {newBag} from "@/library/coffeeBag";

function named(name: string): Recipe {
    const r = new Recipe();
    r.name = name;
    return r;
}

/** A recipe a card can actually hold, so the WRITE action is offered. */
function writable(name: string): Recipe {
    const r = named(name);
    r.cupType = CUP_TYPE.XPOD;
    r.dosage = 15;
    r.ratio = 15;
    r.grindSize = 60;
    r.grindRPM = 90;
    r.pours = [new Pour(0, 225, 93, 30, 0, POUR_PATTERN.CIRCULAR, 0)];
    return r;
}

const HANDLERS = {
    onPress:           jest.fn(),
    onLongPress:       jest.fn(),
    onShare:           jest.fn(),
    onDuplicate:       jest.fn(),
    onDelete:          jest.fn()
};

describe("RecipeShelfTile", () => {
    beforeEach(() => jest.clearAllMocks());

    it("draws the recipe's name", async () => {
        await renderWithProviders(
            <RecipeShelfTile recipe={named("Ethiopia")} {...HANDLERS}/>
        );
        expect(screen.getByText("Ethiopia")).toBeTruthy();
    });

    it("draws the card's own three figures", async () => {
        // The tile stopped being a name on a colour: a recipe in a shelf room
        // is the same recipe as the one in the list, and a user who moves
        // between the two views should not lose what it is made of.
        await renderWithProviders(
            <RecipeShelfTile recipe={writable("Ethiopia")} {...HANDLERS}/>
        );
        expect(screen.getByTestId("recipe-tile-figures"))
            .toHaveTextContent("15G · 1:15 · 60");
    });

    it("leaves out a figure the recipe has not got", async () => {
        // A sentinel drawn through would say the ratio is 0, which is not a
        // possible value and is indistinguishable from a real reading.
        const bare = named("Ethiopia");
        bare.dosage = 15;
        await renderWithProviders(
            <RecipeShelfTile recipe={bare} {...HANDLERS}/>
        );
        expect(screen.getByTestId("recipe-tile-figures")).toHaveTextContent("15G");
    });

    it("draws nothing at all for a recipe with no figures yet", async () => {
        // Every figure is still a sentinel, and a line reading "0G · 1:0 · 0"
        // would be three lies rather than one.
        const bare = named("Ethiopia");
        bare.dosage = -1;
        bare.grinder = false;
        await renderWithProviders(
            <RecipeShelfTile recipe={bare} {...HANDLERS}/>
        );
        // The grinder being off is still a figure, so it is the one thing left.
        expect(screen.getByTestId("recipe-tile-figures")).toHaveTextContent("OFF");
    });

    // The tile is one accessibility element, so nothing inside it is spoken on
    // its own: a figure drawn but missing from this label is a figure a screen
    // reader user does not get at all.
    it("speaks the grinder being off, which it prints", async () => {
        const off = writable("Ethiopia");
        off.grindSize = 60;
        off.grinder = false;
        await renderWithProviders(
            <RecipeShelfTile recipe={off} {...HANDLERS}/>
        );

        const label = screen.getByLabelText(/grinder off/);
        expect(label).toBeTruthy();
        expect(label.props.accessibilityLabel).not.toContain("grind 60");
    });

    it("says the grinder is off rather than printing its last size", async () => {
        const off = writable("Ethiopia");
        off.grinder = false;
        await renderWithProviders(
            <RecipeShelfTile recipe={off} {...HANDLERS}/>
        );
        expect(screen.getByTestId("recipe-tile-figures"))
            .toHaveTextContent("15G · 1:15 · OFF");
    });

    it("leaves grind out for tea", async () => {
        // A tea card always writes the default grind, so the number is the
        // app's rather than the user's.
        const tea = writable("Sencha");
        tea.cupType = CUP_TYPE.TEA;
        await renderWithProviders(
            <RecipeShelfTile recipe={tea} {...HANDLERS}/>
        );
        expect(screen.getByTestId("recipe-tile-figures"))
            .toHaveTextContent("15G · 1:15");
    });

    it("draws how the recipe has gone, when it has gone at all", async () => {
        await renderWithProviders(
            <RecipeShelfTile recipe={writable("Ethiopia")} {...HANDLERS}
                             evidence={{
                                 brews: 6, avgRating: 4.25, lastBrewedAt: 0
                             }}/>
        );
        expect(screen.getByTestId("recipe-tile-evidence")).toHaveTextContent("4.3 · 6");
    });

    it("draws no evidence line for a recipe that has never been brewed", async () => {
        await renderWithProviders(
            <RecipeShelfTile recipe={writable("Ethiopia")} {...HANDLERS}
                             evidence={{brews: 0, avgRating: 0, lastBrewedAt: 0}}/>
        );
        expect(screen.queryByTestId("recipe-tile-evidence")).toBeNull();
    });

    it("speaks the figures in words rather than as the drawn line", async () => {
        // "15G · 1:15 · 60" is a glance's shorthand and reads as noise aloud.
        await renderWithProviders(
            <RecipeShelfTile recipe={writable("Ethiopia")} {...HANDLERS}
                             evidence={{brews: 1, avgRating: 0, lastBrewedAt: 0}}/>
        );
        expect(screen.getByLabelText(
            "Ethiopia, coffee, 15 grams, ratio 1 to 15, grind 60, brewed once"
        )).toBeTruthy();
    });

    it("opens the editor on a tap", async () => {
        const onPress = jest.fn();
        const recipe = named("Ethiopia");
        await renderWithProviders(
            <RecipeShelfTile recipe={recipe} {...HANDLERS} onPress={onPress}/>
        );
        await fireEvent.press(screen.getByTestId(`recipe-tile-${recipe.uuid}`));
        expect(onPress).toHaveBeenCalledTimes(1);
    });

    it("opens the actions on a long press", async () => {
        const onLongPress = jest.fn();
        const recipe = named("Ethiopia");
        await renderWithProviders(
            <RecipeShelfTile recipe={recipe} {...HANDLERS} onLongPress={onLongPress}/>
        );
        await fireEvent(screen.getByTestId(`recipe-tile-${recipe.uuid}`), "longPress");
        expect(onLongPress).toHaveBeenCalledTimes(1);
    });

    // A long press is not something a screen reader can perform, so the same
    // acts the sheet offers are carried as accessibility actions. Without them
    // the tile's whole action set would be unreachable to those users.
    it("carries the recipe's actions for a screen reader", async () => {
        const recipe = writable("Ethiopia");
        await renderWithProviders(
            <RecipeShelfTile recipe={recipe} {...HANDLERS}
                             onBrew={jest.fn()} onWrite={jest.fn()}
                             onToggleFavourite={jest.fn()}/>
        );
        const names = (screen.getByTestId(`recipe-tile-${recipe.uuid}`)
            .props.accessibilityActions as {name: string}[]).map((a) => a.name);
        expect(names).toEqual(
            ["brew", "share", "write", "duplicate", "favourite", "delete"]
        );
    });

    // The write action mirrors the sheet's write row: present only on a recipe
    // a card can hold, because an accessibility action has no disabled state and
    // withdrawing it is the only way to say a recipe cannot be written.
    it("withdraws write on a recipe no card can hold", async () => {
        const recipe = named("Ethiopia");
        await renderWithProviders(
            <RecipeShelfTile recipe={recipe} {...HANDLERS} onWrite={jest.fn()}/>
        );
        const names = (screen.getByTestId(`recipe-tile-${recipe.uuid}`)
            .props.accessibilityActions as {name: string}[]).map((a) => a.name);
        expect(names).not.toContain("write");
    });

    it("carries the sheet's brew history row, which no tray mirrors", async () => {
        // The tile's other actions all mirror a verb a list row can be swiped
        // to. The history is only ever reached by the long press, which is a
        // gesture a screen reader cannot make.
        const onHistory = jest.fn();
        const recipe = named("Ethiopia");
        await renderWithProviders(
            <RecipeShelfTile recipe={recipe} {...HANDLERS} onHistory={onHistory}/>
        );
        const tile = screen.getByTestId(`recipe-tile-${recipe.uuid}`);
        expect((tile.props.accessibilityActions as {name: string}[])
            .map((a) => a.name)).toContain("history");

        await fireEvent(tile, "accessibilityAction",
                        {nativeEvent: {actionName: "history"}});
        expect(onHistory).toHaveBeenCalledTimes(1);
    });

    it("routes an accessibility action to its handler", async () => {
        const onDelete = jest.fn();
        const recipe = named("Ethiopia");
        await renderWithProviders(
            <RecipeShelfTile recipe={recipe} {...HANDLERS} onDelete={onDelete}/>
        );
        await fireEvent(screen.getByTestId(`recipe-tile-${recipe.uuid}`),
                        "accessibilityAction", {nativeEvent: {actionName: "delete"}});
        expect(onDelete).toHaveBeenCalledTimes(1);
    });
});

describe("a tile in edit mode", () => {
    beforeEach(() => jest.clearAllMocks());

    // The glyph is hidden from the accessibility tree on purpose (see below),
    // and RNTL's queries follow that tree rather than the touch one. Finding it
    // takes saying so, which is itself a small assertion that it is hidden.
    const SHOWN = {includeHiddenElements: true};

    it("shows no actions control until edit mode is on", async () => {
        // A long press still opens them. The point of edit mode is that the
        // door becomes visible, not that it appears for the first time.
        const recipe = named("Ethiopia");
        await renderWithProviders(
            <RecipeShelfTile recipe={recipe} {...HANDLERS}/>
        );
        expect(screen.queryByTestId(`recipe-tile-actions-${recipe.uuid}`, SHOWN))
            .toBeNull();
    });

    it("opens the same sheet the long press opens", async () => {
        // The same handle, so edit mode cannot grow a second list of acts that
        // drifts from the one the long press shows.
        const recipe = named("Ethiopia");
        await renderWithProviders(
            <RecipeShelfTile recipe={recipe} {...HANDLERS} editing/>
        );

        await fireEvent.press(
            screen.getByTestId(`recipe-tile-actions-${recipe.uuid}`, SHOWN));
        expect(HANDLERS.onLongPress).toHaveBeenCalledTimes(1);
    });

    it("does not announce the glyph as a second door to the same room", async () => {
        // The tile is one accessibility element and already carries every act
        // as an `accessibilityAction`. A nested button inside it would either
        // be swallowed by the parent, which is the bug, or read out as a
        // duplicate of what the rotor already offers, which is noise.
        const recipe = named("Ethiopia");
        await renderWithProviders(
            <RecipeShelfTile recipe={recipe} {...HANDLERS} editing/>
        );

        // Absent from the default queries, which follow the accessibility
        // tree, and present once hidden elements are included.
        expect(screen.queryByTestId(`recipe-tile-actions-${recipe.uuid}`)).toBeNull();
        const glyph = screen.getByTestId(`recipe-tile-actions-${recipe.uuid}`, SHOWN);
        expect(glyph.props.accessibilityElementsHidden).toBe(true);
        expect(glyph.props.importantForAccessibility).toBe("no-hide-descendants");
        expect(screen.queryByLabelText("Actions for Ethiopia")).toBeNull();
    });

    it("still offers every act to a screen reader in edit mode", async () => {
        // The reason hiding the glyph is safe rather than a removal: the acts
        // were never behind it.
        const recipe = named("Ethiopia");
        await renderWithProviders(
            <RecipeShelfTile recipe={recipe} {...HANDLERS} editing/>
        );

        const tile = screen.getByTestId(`recipe-tile-${recipe.uuid}`);
        const names = (tile.props.accessibilityActions as {name: string}[])
            .map((a) => a.name);
        expect(names).toEqual(expect.arrayContaining(
            ["share", "duplicate", "delete"]));
    });

    describe("the name and the pour profile", () => {
        /** Lay the profile's corner out at `height`, as the platform would. */
        async function layOut(height: number) {
            await fireEvent(screen.getByTestId("recipe-tile-profile-room"), "layout", {
                nativeEvent: {layout: {x: 0, y: 0, width: 160, height}}
            });
        }

        it("gives the name two lines even with figures under it", async () => {
            // The device report: "Ecuador | Vinka Fa..." cut to one line at
            // the bottom of a tile that was empty at the top.
            await renderWithProviders(
                <RecipeShelfTile recipe={writable("Ecuador | Vinka Farm Washed")}
                                 {...HANDLERS}/>
            );
            expect(screen.getByText("Ecuador | Vinka Farm Washed").props.numberOfLines)
                .toBe(2);
            expect(screen.getByTestId("recipe-tile-figures")).toBeTruthy();
        });

        it("gives a name without figures the same two lines", async () => {
            await renderWithProviders(
                <RecipeShelfTile recipe={named("Ethiopia")} {...HANDLERS}/>
            );
            expect(screen.getByText("Ethiopia").props.numberOfLines).toBe(2);
        });

        it("lays the text out first and the profile in what is left", async () => {
            // The profile used to be pinned to the tile's corner over the top of
            // the name and the figures. It now lives in its own room after them,
            // so it cannot be drawn where the text is.
            await renderWithProviders(
                <RecipeShelfTile recipe={writable("Ethiopia")} {...HANDLERS}/>
            );
            await layOut(40);

            const tile = screen.getByTestId("recipe-tile");
            const order = (tile.props.children as React.ReactElement[])
                .flat()
                .filter(React.isValidElement)
                .map((child) => (child.props as {testID?: string}).testID ?? "");
            expect(order.indexOf("recipe-tile-profile-room"))
                .toBe(order.length - 1);
            expect(within(screen.getByTestId("recipe-tile-profile-room"))
                .getByTestId("recipe-tile-profile")).toBeTruthy();
        });

        it("draws nothing until the room is measured", async () => {
            // A guessed size is exactly how a profile ends up across the name
            // at a large text size.
            await renderWithProviders(
                <RecipeShelfTile recipe={writable("Ethiopia")} {...HANDLERS}/>
            );
            expect(screen.queryByTestId("recipe-tile-profile")).toBeNull();
        });

        it("draws at full height when the room allows, and no taller", async () => {
            await renderWithProviders(
                <RecipeShelfTile recipe={writable("Ethiopia")} {...HANDLERS}/>
            );
            await layOut(80);
            expect(screen.getByTestId("recipe-tile-profile").props.height)
                .toBe(PROFILE_HEIGHT + PROFILE_STROKE_WIDTH);
        });

        it("shrinks to the room larger text leaves", async () => {
            await renderWithProviders(
                <RecipeShelfTile recipe={writable("Ethiopia")} {...HANDLERS}/>
            );
            await layOut(22);
            expect(screen.getByTestId("recipe-tile-profile").props.height)
                .toBe(22 - PROFILE_CLEARANCE + PROFILE_STROKE_WIDTH);
        });

        it("draws nothing in a room too small to read a staircase in", async () => {
            await renderWithProviders(
                <RecipeShelfTile recipe={writable("Ethiopia")} {...HANDLERS}/>
            );
            await layOut(PROFILE_MIN_HEIGHT + PROFILE_CLEARANCE - 1);
            expect(screen.queryByTestId("recipe-tile-profile")).toBeNull();
        });

        it("keeps the clearance and the floor in the arithmetic", () => {
            expect(tileProfileHeight(0)).toBe(0);
            expect(tileProfileHeight(PROFILE_MIN_HEIGHT + PROFILE_CLEARANCE))
                .toBe(PROFILE_MIN_HEIGHT);
            expect(tileProfileHeight(25.6)).toBe(21);
            expect(tileProfileHeight(500)).toBe(PROFILE_HEIGHT);
        });
    });
});

describe("RecipeShelfTile bag badge", () => {
    const bag = {...newBag("r1", {sizeGrams: 250}, 1_760_000_000_000), id: "bag-1"};

    it("shows grams left in the corner and says them aloud", async () => {
        await renderWithProviders(
            <RecipeShelfTile recipe={writable("Guji")} {...HANDLERS}
                             bag={{bag, usedGrams: 30}}/>
        );
        expect(screen.getByTestId("recipe-tile-bag")).toHaveTextContent("220G");
        expect(screen.getByLabelText(/220 grams of coffee left/)).toBeTruthy();
    });

    it("says LOW once fewer than two doses remain", async () => {
        await renderWithProviders(
            <RecipeShelfTile recipe={writable("Guji")} {...HANDLERS}
                             bag={{bag, usedGrams: 225}}/>
        );
        expect(screen.getByTestId("recipe-tile-bag")).toHaveTextContent("LOW");
    });

    it("draws nothing without a bag", async () => {
        await renderWithProviders(<RecipeShelfTile recipe={writable("Guji")} {...HANDLERS}/>);
        expect(screen.queryByTestId("recipe-tile-bag")).toBeNull();
    });

    it("shows the bag's freshness beside the grams", async () => {
        await renderWithProviders(
            <RecipeShelfTile recipe={writable("Guji")} {...HANDLERS}
                             bag={{bag, usedGrams: 30}} freshness="resting"/>
        );
        expect(screen.getByTestId("recipe-tile-bag")).toHaveTextContent("220G");
        expect(screen.getByTestId("recipe-tile-freshness")).toHaveTextContent("REST");
        expect(screen.getByLabelText(/coffee resting/)).toBeTruthy();
    });
});
