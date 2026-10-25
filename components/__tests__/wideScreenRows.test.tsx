/**
 * List rows on a wide window, such as an unfolded foldable.
 *
 * The rows used to carry a 600 pt `maxWidth`, so on a window about 720 pt wide
 * the cards stopped short and sat flush left, beside a toolbar and tiles that
 * span the whole width. RNTL performs no layout, so these tests cannot measure
 * a width. They assert the thing that caused it instead: nothing a row draws
 * caps its width below the window, at first render or after the window grows,
 * which is what happens when the phone is unfolded with the app open.
 */
import React from "react";
import {Dimensions, StyleSheet} from "react-native";
import {act, screen} from "@testing-library/react-native";

import HubRow from "@/components/HubRow";
import RoasterCoffeeRow from "@/components/RoasterCoffeeRow";
import SelectableRecipeRow from "@/components/SelectableRecipeRow";
import SwipeableRecipeRow from "@/components/SwipeableRecipeRow";
import type {HubRecipe} from "@/library/hub/hubRow";
import {__resetHubCriteria} from "@/library/hub/hubCriteria";
import Pour, {POUR_PATTERN} from "@/library/Pour";
import Recipe, {CUP_TYPE} from "@/library/Recipe";
import {renderWithProviders} from "@/test-utils/render";
import {feed} from "@/test-utils/roasterFeed";

jest.mock("react-native-gesture-handler/ReanimatedSwipeable", () => {
    const ReactActual = jest.requireActual<typeof import("react")>("react");
    const {View: MockView} = jest.requireActual<typeof import("react-native")>("react-native");
    return {
        __esModule: true,
        default: ReactActual.forwardRef((props: {children?: React.ReactNode}, _ref) =>
            <MockView>{props.children}</MockView>)
    };
});

const mockFetchCriteria = jest.fn();
jest.mock("@/library/hub/hubApi", () => ({
    ...jest.requireActual("@/library/hub/hubApi"),
    fetchHubCriteria: (...args: unknown[]) => mockFetchCriteria(...args)
}));

/** An unfolded inner screen, portrait: about 720 pt wide. */
const UNFOLDED = {width: 720, height: 800, scale: 2.5, fontScale: 1};
/** The same device after a resize, as if the window grew while the app ran. */
const WIDER = {width: 900, height: 800, scale: 2.5, fontScale: 1};

const original = {window: Dimensions.get("window"), screen: Dimensions.get("screen")};

function setWindow(window: typeof UNFOLDED) {
    Dimensions.set({window, screen: window});
}

function recipe(): Recipe {
    const made = new Recipe();
    made.uuid = "uuid-1";
    made.name = "Ethiopia Guji";
    made.cupType = CUP_TYPE.XPOD;
    made.dosage = 18;
    made.ratio = 16;
    made.pours = [new Pour(0, 288, 93, 30, 0, POUR_PATTERN.CIRCULAR, 0)];
    return made;
}

function hubRecipe(): HubRecipe {
    return {
        id: 164, name: "Brian's Recipe", imageURL: "https://example.com/a.png",
        author: "xBloom Official", official: true, machine: "Studio",
        cupType: "xPod", coffeeType: "Single Origin", origin: ["Colombia"],
        varietal: ["Mix"], process: ["Washed"], flavour: [], roast: 1,
        dose: 15, grind: 52, rpm: 120, pourCount: 5, ratio: 16, volume: 240,
        shareLink: "https://share-h5.xbloom.com/?id=abc"
    };
}

type JsonNode = {props?: {style?: unknown}; children?: (JsonNode | string)[] | null};

/** Every width cap anywhere in what was rendered. */
function widthCaps(): unknown[] {
    const caps: unknown[] = [];
    const visit = (node: JsonNode | JsonNode[] | string | null) => {
        if (node === null || typeof node === "string") return;
        if (Array.isArray(node)) {
            node.forEach(visit);
            return;
        }
        const style = StyleSheet.flatten(node.props?.style as never) as {maxWidth?: unknown} | undefined;
        if (style?.maxWidth !== undefined) caps.push(style.maxWidth);
        node.children?.forEach(visit);
    };
    visit(screen.toJSON() as JsonNode | JsonNode[] | null);
    return caps;
}

/** A numeric cap narrower than the window is the bug. Percentages are fine. */
function capsBelow(width: number): unknown[] {
    return widthCaps().filter((cap) => typeof cap === "number" && cap < width);
}

const rows: [string, () => React.ReactElement][] = [
    ["the home list row", () => (
        <SwipeableRecipeRow recipe={recipe()} onPress={jest.fn()}
                            onDelete={jest.fn()} onDuplicate={jest.fn()}/>
    )],
    ["the home list row while picking", () => (
        <SelectableRecipeRow recipe={recipe()} selected={false} onToggle={jest.fn()}/>
    )],
    ["the community catalogue row", () => (
        <HubRow recipe={hubRecipe()} onPress={jest.fn()} onLongPress={jest.fn()}
                selecting={false} selected={false}/>
    )],
    ["the roaster catalogue row", () => (
        <RoasterCoffeeRow coffee={feed([{id: "wide"}]).coffees[0]} onPress={jest.fn()} testID="row"/>
    )]
];

beforeEach(() => {
    __resetHubCriteria();
    mockFetchCriteria.mockReset();
    mockFetchCriteria.mockResolvedValue({
        originList: [], varietalList: [], roastList: [], flavorList: [],
        machineList: [], cupTypeList: [], processingList: [], coffeeTypeList: []
    });
    setWindow(UNFOLDED);
});

afterAll(() => {
    Dimensions.set(original);
});

describe.each(rows)("%s on a wide window", (_name, draw) => {
    it("is not capped narrower than the window", async () => {
        await renderWithProviders(draw());

        expect(capsBelow(UNFOLDED.width)).toEqual([]);
    });

    it("is still not capped after the window grows", async () => {
        const view = await renderWithProviders(draw());

        await act(async () => setWindow(WIDER));
        await view.rerender(draw());

        expect(capsBelow(WIDER.width)).toEqual([]);
    });
});
