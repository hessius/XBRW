import {buildBackup, parseBackup} from "@/library/backup";
import {IMPORT_ROASTER_LIMIT, selectedImportRoasters} from "@/library/roasterImport";
import {parseSubscriptions, serialiseSubscriptions, type RoasterSubscription} from "@/library/roasterSubscription";
import {readSubscriptions, setPinned, unsubscribe} from "@/library/roasterSync";
import {memorySettings} from "@/test-utils/roasterFeed";
import Recipe from "@/library/Recipe";

function sub(index: number, pinnedAt?: number): RoasterSubscription {
    return {
        feed: `https://roaster${index}.example/feed`, roaster: `Roaster ${index}`,
        lastSync: 0, lastAttempt: 0, paused: false,
        ...(pinnedAt === undefined ? {} : {pinnedAt})
    };
}

describe("explicit Import choices", () => {
    it("never fills empty choices from subscriptions", () => {
        expect(IMPORT_ROASTER_LIMIT).toBe(3);
        expect(selectedImportRoasters([])).toEqual([]);
        expect(selectedImportRoasters([sub(1), sub(2)])).toEqual([]);
    });

    it.each([1, 2, 3])("shows %i choices, oldest selection first", (count) => {
        const choices = Array.from({length: count}, (_, i) => sub(i, i + 1));
        expect(selectedImportRoasters([...choices].reverse())).toEqual(choices);
    });

    it("limits legacy choices without mutating or deleting them", () => {
        const choices = [sub(4, 4), sub(2, 2), sub(1, 1), sub(3, 3)];
        expect(selectedImportRoasters(choices)).toEqual([sub(1, 1), sub(2, 2), sub(3, 3)]);
        expect(choices).toHaveLength(4);
        expect(choices[0]).toEqual(sub(4, 4));
    });

    it("keeps ties stable and orders clock-regressed stored timestamps", () => {
        const choices = [sub(3, 10), sub(1, 5), sub(2, 5)];
        expect(selectedImportRoasters(choices)).toEqual([choices[1], choices[2], choices[0]]);
    });

    it.each([0, -1, NaN, Infinity, "4", null])("rejects invalid stored pin %s", (pin) => {
        const parsed = parseSubscriptions(JSON.stringify([{...sub(1), pinnedAt: pin}]));
        expect(parsed[0]).not.toHaveProperty("pinnedAt");
        expect(selectedImportRoasters(parsed)).toEqual([]);
    });

    it("preserves validated choices across restart and settings backup restore", () => {
        const choices = [sub(2, 20), sub(1, 10), sub(3, 30), sub(4, 40), sub(5)];
        const stored = serialiseSubscriptions(choices);
        const backup = parseBackup(buildBackup([new Recipe()], {roasterSubscriptions: stored}));
        expect(backup.ok).toBe(true);
        if (!backup.ok) throw new Error(backup.reason);
        const restored = backup.payload.settings.roasterSubscriptions as string;
        expect(parseSubscriptions(restored)).toEqual(choices);
        const restarted = memorySettings();
        restarted.set("roasterSubscriptions", restored);
        expect(readSubscriptions(restarted)).toEqual(choices);
        expect(selectedImportRoasters(readSubscriptions(restarted))).toEqual([choices[1], choices[0], choices[2]]);
    });

    it("refuses a fourth choice without writing anything, but always permits removal", () => {
        const settings = memorySettings();
        settings.set("roasterSubscriptions", serialiseSubscriptions([sub(1, 1), sub(2, 2), sub(3, 3), sub(4)]));
        const before = settings.get("roasterSubscriptions");
        expect(setPinned(settings, sub(4).feed, true, 4)).toBe(false);
        expect(settings.get("roasterSubscriptions")).toBe(before);
        expect(setPinned(settings, sub(2).feed, false, 4)).toBe(true);
        expect(setPinned(settings, sub(4).feed, true, 4)).toBe(true);
        expect(selectedImportRoasters(readSubscriptions(settings)).map((s) => s.roaster))
            .toEqual(["Roaster 1", "Roaster 3", "Roaster 4"]);
    });

    it("keeps new selection timestamps strictly increasing through ties and clock regression", () => {
        const settings = memorySettings();
        settings.set("roasterSubscriptions", serialiseSubscriptions([sub(1), sub(2), sub(3)]));
        setPinned(settings, sub(1).feed, true, 100);
        setPinned(settings, sub(2).feed, true, 100);
        setPinned(settings, sub(3).feed, true, 10);
        expect(selectedImportRoasters(readSubscriptions(settings)).map((s) => s.pinnedAt))
            .toEqual([100, 101, 102]);
    });

    it("preserves every legacy pin and other fields until explicitly removed or unsubscribed", () => {
        const settings = memorySettings();
        const choices = [sub(1, 1), {...sub(2, 2), paused: true}, sub(3, 3), sub(4, 4), sub(5)];
        settings.set("roasterSubscriptions", serialiseSubscriptions(choices));
        expect(setPinned(settings, sub(4).feed, true, 99)).toBe(true);
        expect(setPinned(settings, sub(5).feed, true, 99)).toBe(false);
        expect(readSubscriptions(settings)).toEqual(choices);
        setPinned(settings, sub(4).feed, false, 99);
        unsubscribe(settings, sub(1).feed);
        expect(selectedImportRoasters(readSubscriptions(settings)).map((s) => s.roaster))
            .toEqual(["Roaster 2", "Roaster 3"]);
        expect(readSubscriptions(settings).find((s) => s.roaster === "Roaster 2")?.paused).toBe(true);
        expect(readSubscriptions(settings).find((s) => s.roaster === "Roaster 5")?.pinnedAt).toBeUndefined();
    });
});
