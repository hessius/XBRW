import {Settings, SqliteSettingsStorage} from "@/library/Settings";
import {createTestDatabase, type FakeSQLiteDatabase} from "@/test-utils/sqlite";

let mockDb: FakeSQLiteDatabase;
jest.mock("@/library/appDatabase", () => ({appDatabase: () => mockDb}));

beforeEach(() => {
    mockDb = createTestDatabase();
});

it("reopens both persisted appearance preferences from SQLite", () => {
    const settings = new Settings(new SqliteSettingsStorage());
    settings.set("appearanceTheme", "light");
    settings.set("recipeColourMode", "themed");
    const reopened = new Settings(new SqliteSettingsStorage());
    expect(reopened.get("appearanceTheme")).toBe("light");
    expect(reopened.get("recipeColourMode")).toBe("themed");
});

it("defaults missing SQLite preferences independently", () => {
    const settings = new Settings(new SqliteSettingsStorage());
    expect(settings.get("appearanceTheme")).toBe("original");
    expect(settings.get("recipeColourMode")).toBe("original");
    settings.set("appearanceTheme", "light");
    expect(new Settings(new SqliteSettingsStorage()).get("recipeColourMode")).toBe("original");
    mockDb.runSync("DELETE FROM settings WHERE key = ?", ["appearanceTheme"]);
    settings.set("recipeColourMode", "themed");
    expect(new Settings(new SqliteSettingsStorage()).get("appearanceTheme")).toBe("original");
});

it("keeps persisted choices and subscribers unchanged on a failed SQL write", () => {
    const settings = new Settings(new SqliteSettingsStorage());
    settings.set("appearanceTheme", "light");
    settings.set("recipeColourMode", "themed");
    const listener = jest.fn();
    settings.subscribe(listener);
    mockDb.execSync(`
        CREATE TRIGGER refuse_appearance_theme BEFORE UPDATE ON settings
        WHEN NEW.key = 'appearanceTheme'
        BEGIN SELECT RAISE(FAIL, 'storage unavailable'); END;
    `);
    expect(() => settings.set("appearanceTheme", "blue")).toThrow("storage unavailable");
    expect(listener).not.toHaveBeenCalled();
    const reopened = new Settings(new SqliteSettingsStorage());
    expect(reopened.get("appearanceTheme")).toBe("light");
    expect(reopened.get("recipeColourMode")).toBe("themed");
});
