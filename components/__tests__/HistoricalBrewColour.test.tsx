import React from "react";
import {fireEvent} from "@testing-library/react-native";
import BrewHistoryRow from "@/components/BrewHistoryRow";
import ExportButton from "@/components/ExportButton";
import {palette, resolveAppearance} from "@/constants/colors";
import {DEFAULT_APPEARANCE} from "@/library/appearance";
import {buildBackup, parseBackup} from "@/library/backup";
import BrewDatabase from "@/library/BrewDatabase";
import {brew} from "@/library/brew/handoff/__tests__/fixtures";
import Recipe from "@/library/Recipe";
import {renderWithProviders} from "@/test-utils/render";
import {createTestDatabase, type FakeSQLiteDatabase} from "@/test-utils/sqlite";

let mockBacking: FakeSQLiteDatabase;
jest.mock("expo-sqlite", () => ({openDatabaseSync: () => mockBacking}));

beforeEach(() => {
    mockBacking = createTestDatabase();
    jest.spyOn(Date.prototype, "toISOString").mockReturnValue("2026-10-22T12:00:00.000Z");
});
afterEach(() => { jest.restoreAllMocks(); });

const file = (accent: string) => buildBackup(
    [new Recipe(undefined, JSON.stringify({pours: [], ratio: 16, dosage: 18, grindSize: 60}))],
    {}, "2.2.0", [brew({accent})]
);

it.each(["", "not-a-colour"])("reports invalid incoming backup accent %j as a skipped brew", accent => {
    const parsed = parseBackup(file(accent));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error(parsed.reason);
    expect(parsed.payload.skippedBrews).toBe(1);
    expect(parsed.payload.brews).toEqual([]);
    const database = new BrewDatabase();
    expect(database.restore(parsed.payload.brews)).toBe(0);
    expect(database.all()).toEqual([]);
});

it.each(["red", "rgb(255,0,0)", "hsl(120,100%,50%)", "#1234", "rgba(20,40,60,0.5)"])(
    "restores %s unchanged through SQLite, history and working export actions", async accent => {
        const parsed = parseBackup(file(accent));
        if (!parsed.ok) throw new Error(parsed.reason);
        expect(parsed.payload.skippedBrews).toBe(0);
        const database = new BrewDatabase();
        expect(database.restore(parsed.payload.brews)).toBe(1);
        const record = database.all()[0];
        expect(record.accent).toBe(accent);
        expect(record.hasStream).toBe(false);
        const onPress = jest.fn();
        const view = await renderWithProviders(<>
            <BrewHistoryRow brew={record} onPress={jest.fn()}/>
            <ExportButton testID="export" label="Save image" busy={false}
                          accent={record.accent} onPress={onPress}/>
        </>);
        expect(view.getByTestId("history-row-mark"))
            .toHaveStyle({backgroundColor: accent});
        expect(view.getByTestId("export-label"))
            .toHaveStyle({color: resolveAppearance(DEFAULT_APPEARANCE).recipe(accent).ink});
        await fireEvent.press(view.getByRole("button", {name: "Save image"}));
        expect(onPress).toHaveBeenCalledTimes(1);
        expect(database.get(record.id)?.accent).toBe(accent);
    }
);

it.each(["", "not-a-colour"])(
    "presents already-stored invalid accent %j safely and explicitly without rewriting it", async accent => {
        const database = new BrewDatabase();
        database.insert(brew({accent}), []);
        const record = database.all()[0];
        const before = buildBackup([], {}, "2.2.0", [record]);
        const onPress = jest.fn();
        const view = await renderWithProviders(<>
            <BrewHistoryRow brew={record} onPress={jest.fn()}/>
            <ExportButton testID="export" label="Save image" busy={false}
                          accent={record.accent} onPress={onPress}/>
        </>);
        expect(view.getByTestId("history-row-mark"))
            .toHaveStyle({backgroundColor: palette.dim});
        expect(view.getByRole("button", {name: /Stored brew colour is invalid/})).toBeTruthy();
        expect(view.getByText("Stored brew colour is invalid; using a display fallback.")).toBeTruthy();
        await fireEvent.press(view.getByRole("button", {name: "Save image"}));
        expect(onPress).toHaveBeenCalledTimes(1);
        expect(database.get(record.id)?.accent).toBe(accent);
        expect(mockBacking.getFirstSync("SELECT accent FROM brews")).toEqual({accent});
        expect(buildBackup([], {}, "2.2.0", [database.all()[0]])).toBe(before);
    }
);
