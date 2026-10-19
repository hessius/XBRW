import {checkRoasterFeed} from "@/library/roasterFeedCheck";
import {feedJson, share} from "@/test-utils/roasterFeed";

describe("checking a roaster feed", () => {
    it("passes a good feed and says how many coffees the app reads", () => {
        const report = checkRoasterFeed(feedJson([{id: "a"}, {id: "b", available: false}]));
        expect(report.ok).toBe(true);
        expect(report.lines).toContain("The app reads 2 of 2 coffees.");
        expect(report.lines.some((line) => line.startsWith("1 coffee(s) show as sold out"))).toBe(true);
    });

    it("names a coffee it skipped and why", () => {
        const parsed = JSON.parse(feedJson([{id: "a"}]));
        parsed.coffees.push({name: "No Recipe", recipes: []}, {recipes: [{size: "18g", share: share("x")}]});
        const report = checkRoasterFeed(JSON.stringify(parsed));
        expect(report.lines).toContain("The app reads 1 of 3 coffees.");
        expect(report.lines.some((line) => line.startsWith("Skipped \"No Recipe\": no usable recipe"))).toBe(true);
        expect(report.lines.some((line) => line.startsWith("Skipped Coffee 3: it needs a \"name\""))).toBe(true);
    });

    it("explains a web page served in place of the feed", () => {
        const report = checkRoasterFeed("<!doctype html><html></html>");
        expect(report.ok).toBe(false);
        expect(report.lines[1]).toMatch(/looks like a web page/);
    });

    it("refuses another version and a missing roaster name", () => {
        expect(checkRoasterFeed(JSON.stringify({version: 2})).lines[0]).toMatch(/must be the number 1/);
        expect(checkRoasterFeed(JSON.stringify({version: 1, roaster: {}, coffees: []})).lines[0])
            .toMatch(/roaster.name/);
    });
});
