import BrewDatabase from "@/library/BrewDatabase";
import {buildBackup, parseBackup, reviveBrew} from "@/library/backup";
import {bagBrewFixture, bagRecipe, bagRunFixture} from "@/test-utils/bags";
import {createTestDatabase} from "@/test-utils/sqlite";
import {forgetAppDatabase} from "@/library/appDatabase";

let mockDb: ReturnType<typeof createTestDatabase>;
jest.mock("expo-sqlite", () => ({openDatabaseSync: () => mockDb}));
beforeEach(() => { mockDb = createTestDatabase(); });

describe("historical bag identity in real SQLite", () => {
    it("leaves old untracked records byte-compatible without a bag key", () => {
        const db = new BrewDatabase();
        db.insert(bagBrewFixture(), []);
        expect(db.get("brew-a")).not.toHaveProperty("bag");
    });

    it("adds the absent legacy column without changing old history", () => {
        const first = new BrewDatabase();
        first.insert(bagBrewFixture(), []);
        mockDb.execSync("ALTER TABLE brews DROP COLUMN bag;");
        const reopened = new BrewDatabase();
        expect(reopened.get("brew-a")).not.toHaveProperty("bag");
        expect(mockDb.getFirstSync("SELECT bag FROM brews WHERE id = 'brew-a';"))
            .toEqual({bag: ""});
    });

    it("retains the frozen bag through live insert, trace retention and a backup restore", () => {
        const first = new BrewDatabase();
        const bag = bagRunFixture({beanName: "Colombia October"});
        first.insert(bagBrewFixture({bag}), [
            {at: 0, water: 20, cup: 0, pour: 1}, {at: 1000, water: 288, cup: 280, pour: 1}
        ]);
        first.sweepBytes(1);
        const saved = first.get("brew-a");
        expect(saved).toMatchObject({bag, hasStream: false});
        if (saved === null) throw new Error("The fixture brew was not saved.");
        const parsed = parseBackup(buildBackup([bagRecipe("a")], {}, "2.2.0", [saved]));
        expect(parsed.ok).toBe(true);
        if (!parsed.ok) throw new Error(parsed.reason);
        mockDb = createTestDatabase();
        forgetAppDatabase();
        const second = new BrewDatabase();
        expect(second.restore(parsed.payload.brews)).toBe(1);
        expect(second.get("brew-a")).toMatchObject({bag, hasStream: false});
        expect(second.restore([bagBrewFixture({bag: {...bag, bagName: "Stale backup name"}})]))
            .toBe(0);
        expect(second.get("brew-a")?.bag?.bagName).toBe(bag.bagName);
    });

    it.each(["{", "{}", '{"dose":18}'])(
        "surfaces corrupt stored attribution %s and preserves its raw bytes", raw => {
            const db = new BrewDatabase();
            db.insert(bagBrewFixture({bag: bagRunFixture()}), []);
            mockDb.runSync("UPDATE brews SET bag = ? WHERE id = 'brew-a';", [raw]);
            expect(() => db.get("brew-a")).toThrow(/bag/i);
            expect(mockDb.getFirstSync("SELECT bag FROM brews WHERE id = 'brew-a';"))
                .toEqual({bag: raw});
        }
    );

    it("rejects malformed supplied bag snapshots at the backup boundary", () => {
        expect(reviveBrew({...bagBrewFixture(), bag: {}})).toBeNull();
        const bag = bagRunFixture();
        expect(reviveBrew({...bagBrewFixture(), bag: {...bag, extra: true}})?.bag).toEqual(bag);
        expect(reviveBrew(bagBrewFixture())).not.toHaveProperty("bag");
    });
});
