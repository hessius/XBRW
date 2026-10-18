/**
 * The plugin that keeps Android's three-button navigation bar dark.
 *
 * Tested against a parsed styles.xml rather than a build, as the radios plugin
 * is: a prebuild takes minutes and the decision here is two theme items.
 */
type Item = {$: Record<string, string>; _: string};
type Style = {$: {name: string; parent?: string}; item?: Item[]};
type Styles = {resources: {style?: Style[]}};

// eslint-disable-next-line @typescript-eslint/no-require-imports
const plugin = require("@/plugins/withDarkNavigationBar");
const setDarkNavigationBar: (s: Styles) => Styles = plugin.setDarkNavigationBar;

const app = require("@/app.json");

/** The shape Expo's template generates: AppTheme on DayNight, one item. */
function template(): Styles {
    return {
        resources: {
            style: [{
                $:    {name: "AppTheme", parent: "Theme.AppCompat.DayNight.NoActionBar"},
                item: [{$: {name: "android:windowBackground"}, _: "@color/activityBackground"}]
            }]
        }
    };
}

function appTheme(styles: Styles): Record<string, Item> {
    const theme = styles.resources.style?.find(s => s.$.name === "AppTheme");
    return Object.fromEntries((theme?.item ?? []).map(i => [i.$.name, i]));
}

describe("setDarkNavigationBar", () => {
    it("turns off the system's contrast scrim on the navigation bar", () => {
        const item = appTheme(setDarkNavigationBar(template()))["android:enforceNavigationBarContrast"];

        expect(item._).toBe("false");
        // The attribute arrived in Android 10; older releases have no scrim.
        expect(item.$["tools:targetApi"]).toBe("29");
    });

    it("keeps the buttons light over the dark app", () => {
        const item = appTheme(setDarkNavigationBar(template()))["android:windowLightNavigationBar"];

        expect(item._).toBe("false");
        expect(item.$["tools:targetApi"]).toBe("27");
    });

    it("leaves the theme's other items alone", () => {
        const items = appTheme(setDarkNavigationBar(template()));

        expect(items["android:windowBackground"]._).toBe("@color/activityBackground");
    });

    it("amends rather than duplicates on a second run", () => {
        const twice = setDarkNavigationBar(setDarkNavigationBar(template()));
        const theme = twice.resources.style?.find(s => s.$.name === "AppTheme");

        expect(theme?.item?.filter(i => i.$.name === "android:enforceNavigationBarContrast"))
            .toHaveLength(1);
    });

    it("is registered in app.json", () => {
        expect(app.expo.plugins).toContain("./plugins/withDarkNavigationBar");
    });
});
