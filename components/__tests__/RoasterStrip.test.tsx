/**
 * `render` and `fireEvent` are asynchronous in this repository. Without the
 * `await`, `screen` is empty and the test passes for the wrong reason.
 */
import {fireEvent, screen} from "@testing-library/react-native";

import EmptyLibrary from "@/components/EmptyLibrary";
import RoasterSearchRow from "@/components/RoasterSearchRow";
import RoasterStrip from "@/components/RoasterStrip";
import {homeStrip, type StripRow} from "@/library/roasterHome";
import {renderWithProviders} from "@/test-utils/render";
import {feed} from "@/test-utils/roasterFeed";

function row(roaster: string, overrides: Partial<StripRow> = {}): StripRow {
    return {
        feedUrl: `https://${roaster.toLowerCase().replace(/\s+/g, "")}.example/feed`,
        roaster, cached: true, count: 12, detail: "12 coffees", paused: false, fresh: 0, back: 0,
        pinned: false,
        photos: ["https://cdn.example/a.png", "https://cdn.example/b.png"],
        ...overrides
    };
}

describe("RoasterStrip", () => {
    it("draws nothing at all without a subscription", async () => {
        await renderWithProviders(<RoasterStrip strip={homeStrip([])} onOpen={jest.fn()} onAll={jest.fn()}/>);
        expect(screen.queryByTestId("roaster-strip")).toBeNull();
        expect(screen.queryByText("YOUR ROASTERS")).toBeNull();
    });

    it("lists a roaster with its count and NEW, and opens its coffees", async () => {
        const onOpen = jest.fn();
        await renderWithProviders(
            <RoasterStrip strip={homeStrip([row("Central Coast Coffee", {fresh: 2})])}
                          onOpen={onOpen} onAll={jest.fn()}/>
        );
        expect(screen.getByText("YOUR ROASTERS")).toBeTruthy();
        expect(screen.getByText("12 coffees")).toBeTruthy();
        expect(screen.getByTestId("roaster-strip-Central Coast Coffee-new")).toHaveTextContent("2 NEW");
        expect(screen.queryByTestId("roaster-strip-all")).toBeNull();

        await fireEvent.press(screen.getByRole("button", {
            name: "Central Coast Coffee, 12 coffees, 2 new"
        }));
        expect(onOpen.mock.calls[0][0].feedUrl).toBe("https://centralcoastcoffee.example/feed");
    });

    it("says back in stock apart from NEW", async () => {
        await renderWithProviders(
            <RoasterStrip strip={homeStrip([row("Roaster A", {back: 1, count: 1, detail: "1 coffee"})])}
                          onOpen={jest.fn()} onAll={jest.fn()}/>
        );
        expect(screen.getByTestId("roaster-strip-Roaster A-back")).toHaveTextContent("1 BACK");
        expect(screen.queryByTestId("roaster-strip-Roaster A-new")).toBeNull();
        expect(screen.getByRole("button", {name: "Roaster A, 1 coffee, 1 back in stock"})).toBeTruthy();
    });

    it("shows a paused roaster with its marker and the reason in its line", async () => {
        await renderWithProviders(
            <RoasterStrip strip={homeStrip([row("Roaster A", {paused: true, detail: "3 coffees · Updated 3 d ago"})])}
                          onOpen={jest.fn()} onAll={jest.fn()}/>
        );
        expect(screen.getByTestId("roaster-strip-Roaster A-paused")).toHaveTextContent("PAUSED");
        expect(screen.getByText("3 coffees · Updated 3 d ago")).toBeTruthy();
        expect(screen.getByRole("button", {
            name: "Roaster A, 3 coffees, Updated 3 d ago, updates paused"
        })).toBeTruthy();
    });

    it("gives each of three roasters its own row, with no summary row", async () => {
        await renderWithProviders(
            <RoasterStrip strip={homeStrip([row("One"), row("Two"), row("Three")])}
                          onOpen={jest.fn()} onAll={jest.fn()}/>
        );
        expect(screen.getByTestId("roaster-strip-One")).toBeTruthy();
        expect(screen.getByTestId("roaster-strip-Two")).toBeTruthy();
        expect(screen.getByTestId("roaster-strip-Three")).toBeTruthy();
        expect(screen.queryByTestId("roaster-strip-all")).toBeNull();
    });

    it("folds four or more into one Roasters row, with every roaster's counts", async () => {
        const onAll = jest.fn();
        await renderWithProviders(
            <RoasterStrip strip={homeStrip([row("One", {fresh: 2}), row("Two", {back: 1}),
                                            row("Three"), row("Four", {fresh: 1})])}
                          onOpen={jest.fn()} onAll={onAll}/>
        );
        expect(screen.queryByTestId("roaster-strip-One")).toBeNull();
        expect(screen.getByText("Roasters · 4")).toBeTruthy();
        expect(screen.getByTestId("roaster-strip-all-new")).toHaveTextContent("3 NEW");
        expect(screen.getByTestId("roaster-strip-all-back")).toHaveTextContent("1 BACK");

        await fireEvent.press(screen.getByRole("button", {name: "All roasters, 4, 3 new, 1 back in stock"}));
        expect(onAll).toHaveBeenCalledTimes(1);
    });

    it("keeps pinned roasters above the Roasters row, with a pin mark", async () => {
        await renderWithProviders(
            <RoasterStrip strip={homeStrip([row("One", {pinned: true}), row("Two"),
                                            row("Three"), row("Four")])}
                          onOpen={jest.fn()} onAll={jest.fn()}/>
        );
        expect(screen.getByTestId("roaster-strip-One-pinned", {includeHiddenElements: true})).toBeTruthy();
        expect(screen.getByRole("button", {name: "One, 12 coffees, pinned"})).toBeTruthy();
        expect(screen.queryByTestId("roaster-strip-Two")).toBeNull();
        expect(screen.getByText("Roasters · 4")).toBeTruthy();
    });
});

describe("RoasterSearchRow", () => {
    it("attempts a replacement photo after the same coffee's previous URL failed", async () => {
        const match = {
            feedUrl: "https://roaster.example/feed", roaster: "Test Roaster",
            coffee: feed([{id: "a"}]).coffees[0], ref: "a"
        };
        const onPress = jest.fn();
        const view = await renderWithProviders(<RoasterSearchRow match={match} onPress={onPress}/>);
        const photo = () => screen.queryByTestId("roaster-result-photo", {includeHiddenElements: true});
        expect(photo()?.props.source.uri).toBe(match.coffee.image);
        await fireEvent(photo()!, "error");
        expect(photo()).toBeNull();
        await view.rerender(<RoasterSearchRow match={match} onPress={onPress}/>);
        expect(photo()).toBeNull();
        const refreshed = {...match, coffee: {...match.coffee, image: "https://roaster.example/replacement.png"}};
        await view.rerender(<RoasterSearchRow match={refreshed} onPress={onPress}/>);
        expect(photo()?.props.source.uri).toBe(refreshed.coffee.image);
        await fireEvent.press(screen.getByTestId("roaster-result-a"));
        expect(onPress).toHaveBeenCalledTimes(1);
    });

    it("names the coffee, its roaster and roast, and opens on a tap", async () => {
        const parsed = feed([{id: "a", name: "Peru El Palto"}]);
        const onPress = jest.fn();
        await renderWithProviders(
            <RoasterSearchRow onPress={onPress} match={{
                feedUrl: "https://roaster.example/feed", roaster: "Test Roaster",
                coffee: parsed.coffees[0], ref: "a"
            }}/>
        );
        expect(screen.getByText("Peru El Palto")).toBeTruthy();
        expect(screen.getByText("Test Roaster")).toBeTruthy();
        expect(screen.getByText("LIGHT")).toBeTruthy();
        await fireEvent.press(screen.getByRole("button", {
            name: "Peru El Palto, from Test Roaster, Light roast"
        }));
        expect(onPress).toHaveBeenCalledTimes(1);
    });
});

describe("EmptyLibrary", () => {
    it("has no button for somebody with no subscriptions", async () => {
        await renderWithProviders(<EmptyLibrary/>);
        expect(screen.getByText("NO RECIPES YET")).toBeTruthy();
        expect(screen.queryByTestId("empty-library-browse")).toBeNull();
    });

    it("offers the roaster's coffees under the empty-state text", async () => {
        const onPress = jest.fn();
        await renderWithProviders(
            <EmptyLibrary browse={{label: "Browse Central Coast Coffee", onPress}}/>
        );
        expect(screen.getByText("NO RECIPES YET")).toBeTruthy();
        await fireEvent.press(screen.getByRole("button", {name: "Browse Central Coast Coffee"}));
        expect(onPress).toHaveBeenCalledTimes(1);
    });
});
