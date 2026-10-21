import {contentPrint, parsePrints, planReimport, readPrints, rememberPrint, takeLatest} from "@/library/importRefresh";
import {brewable, memorySettings} from "@/test-utils/roasterFeed";

function held() {
    const recipe = brewable("share-1");
    recipe.name = "My name for it";
    recipe.description = "Grind a touch finer on Mondays.";
    recipe.setTags(["Mornings"]);
    recipe.favourite = true;
    recipe.accentIndex = 3;
    return recipe;
}

function latest(grind = 60) {
    const recipe = brewable("share-1");
    recipe.grindSize = grind;
    recipe.name = "Roaster's name";
    return recipe;
}

describe("planReimport", () => {
    it("is new when no recipe shares the link", () => {
        expect(planReimport([brewable("other")], latest(), {}).kind).toBe("new");
    });

    it("is the same when nothing changed", () => {
        const mine = held();
        expect(planReimport([mine], brewable("share-1"), {[mine.uuid]: contentPrint(mine)}))
            .toEqual({kind: "same", recipe: mine});
    });

    it("replaces an untouched copy whose author moved on", () => {
        const mine = held();
        const prints = {[mine.uuid]: contentPrint(mine)};
        expect(planReimport([mine], latest(), prints)).toEqual({kind: "replace", held: mine});
    });

    it("asks when the user edited their copy", () => {
        const mine = held();
        const prints = {[mine.uuid]: contentPrint(mine)};
        mine.dosage = 20;
        expect(planReimport([mine], latest(), prints)).toEqual({kind: "ask", held: mine});
    });

    it("keeps local brewing edits when the author's content has not changed", () => {
        const mine = held();
        const prints = {[mine.uuid]: contentPrint(mine)};
        mine.grindSize = 55;
        expect(planReimport([mine], latest(50), prints)).toEqual({kind: "same", recipe: mine});
        expect(mine.grindSize).toBe(55);
        expect(planReimport([mine], latest(62), prints)).toEqual({kind: "ask", held: mine});
    });

    it("does not count a rename as an edit", () => {
        const mine = held();
        const prints = {[mine.uuid]: contentPrint(mine)};
        mine.name = "Renamed";
        expect(planReimport([mine], latest(), prints).kind).toBe("replace");
    });

    it("asks when there is no print to compare, rather than overrule the user", () => {
        expect(planReimport([held()], latest(), {}).kind).toBe("ask");
    });
});

describe("takeLatest", () => {
    it("moves brewing content and leaves the name, notes, tags, star, accent and uuid", () => {
        const mine = held();
        const {uuid} = mine;
        takeLatest(mine, latest(64));
        expect(mine).toMatchObject({
            uuid, grindSize: 64, name: "My name for it",
            description: "Grind a touch finer on Mondays.", favourite: true, accentIndex: 3
        });
        expect(mine.tags).toEqual(["Mornings"]);
    });
});

describe("stored prints", () => {
    it("remembers a print and drops ones for recipes that are gone", () => {
        const settings = memorySettings();
        const first = held();
        const second = brewable("share-2");
        rememberPrint(settings, first);
        rememberPrint(settings, second, [second.uuid]);
        expect(Object.keys(readPrints(settings))).toEqual([second.uuid]);
    });

    it("refuses a malformed value from a backup", () => {
        expect(parsePrints("{\"a\":\"not-a-print\",\"b\":\"0123456789abcdef\"}"))
            .toEqual({b: "0123456789abcdef"});
        expect(parsePrints("[1]")).toEqual({});
        expect(parsePrints("{")).toEqual({});
    });
});
