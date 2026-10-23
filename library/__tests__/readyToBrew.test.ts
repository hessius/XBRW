import {readyToBrew, selectedBagBadge, type ReadyEntry} from "@/library/readyToBrew";
import {bagFixture, bagRecipe} from "@/test-utils/bags";
import Pour from "@/library/Pour";
import {freshnessOf, type Freshness} from "@/library/restPeak";

function entry(bagId: string, uuid: string, selectedAt: number, state?: Freshness): ReadyEntry {
    const recipe = bagRecipe(uuid);
    recipe.pours = [new Pour(288)];
    return {recipe, bag: bagFixture({id: bagId}), selectedAt,
        balance: {kind: "estimate", remainingGrams: 10, usedGrams: 240,
            brewsLeft: 0, low: true, empty: false},
        freshness: state ? {state, days: 18, readyOn: new Date(2026, 9, 19),
            peakDay: 18, peakOn: new Date(2026, 9, 30)} : null};
}

it("does not recommend a restored bag still within its known rest period without peak advice", () => {
    const row = entry("rest-only", "a", 1);
    row.bag = bagFixture({roastedOn: "2026-10-01", restDays: 14});
    row.freshness = freshnessOf(row.bag, new Date(2026, 9, 4).getTime());
    expect(readyToBrew([row])).toEqual([]);
});

it("deduplicates physical bags by the latest explicit recipe choice, with stable ties", () => {
    const a = entry("shared", "a", 1);
    const b = entry("shared", "b", 2);
    expect(readyToBrew([a, b]).map(row => row.recipe.uuid)).toEqual(["b"]);
    a.selectedAt = 2;
    expect(readyToBrew([b, a]).map(row => row.recipe.uuid)).toEqual(["a"]);
});

it("ranks peak, ready and unknown without excluding a positive but insufficient quantity", () => {
    const other = entry("other", "c", 30);
    const ready = entry("ready", "b", 20, "ready");
    const peak = entry("peak", "a", 10, "peak");
    expect(readyToBrew([other, ready, peak]).map(row => row.bag.id))
        .toEqual(["peak", "ready", "other"]);
});

it("excludes resting, finished and reliably empty bags, not uncertain or external ones", () => {
    const resting = entry("rest", "a", 1, "resting");
    const finished = entry("finished", "b", 2);
    finished.bag.finishedAt = 1;
    const empty = entry("empty", "c", 3);
    empty.balance = {kind: "estimate", remainingGrams: 0, usedGrams: 250,
        brewsLeft: 0, low: true, empty: true};
    const uncertain = entry("uncertain", "d", 4);
    uncertain.balance = {kind: "needsCheck"};
    const external = entry("external", "e", 5);
    external.balance = {kind: "external"};
    expect(readyToBrew([resting, finished, empty, uncertain, external]).map(row => row.bag.id))
        .toEqual(["external", "uncertain"]);
});

it("never invents freshness or local quantity badges for an external tracker", () => {
    const row = entry("external", "a", 1);
    row.balance = {kind: "external"};
    expect(selectedBagBadge(row)).toBeUndefined();
    row.freshness = entry("x", "a", 1, "peak").freshness;
    expect(selectedBagBadge(row)).toMatchObject({label: "PEAK"});
    row.balance = {kind: "needsCheck"};
    expect(selectedBagBadge(row)?.spoken).toMatch(/check/i);
});
