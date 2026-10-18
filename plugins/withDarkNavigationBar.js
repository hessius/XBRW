const {AndroidConfig, withAndroidStyles} = require('expo/config-plugins');

const {assignStylesValue, getAppThemeGroup} = AndroidConfig.Styles;

/**
 * Lets the dark app run under Android's three-button navigation bar instead
 * of a light grey scrim.
 *
 * Edge to edge, React Native draws behind a transparent navigation bar, but on
 * Android 10 and later the system lays its own contrast scrim over that bar
 * while `android:enforceNavigationBarContrast` is true, which is the theme
 * default. React Native reads the attribute from the theme
 * (`WindowUtil.enableEdgeToEdge`) and, while it is true, picks the scrim's
 * shade from the phone's light or dark setting rather than from the app, so a
 * black app on a phone in light mode got a pale grey band with dark buttons.
 *
 * Switching enforcement off leaves the bar transparent, so the app's own black
 * shows through, and `android:windowLightNavigationBar` false keeps the buttons
 * light. Gesture navigation has no scrim either way; its handle simply follows
 * the same light setting. Content is still kept clear of the bar by the bottom
 * inset padding, which this does not touch.
 *
 * No `app.json` key does this any more: `androidNavigationBar` is deprecated
 * and ignored under edge to edge. Two theme items need no native module,
 * unlike adding `expo-navigation-bar` for the same two lines.
 */
const NAVIGATION_BAR_ITEMS = [
    {name: 'android:enforceNavigationBarContrast', value: 'false', targetApi: '29'},
    {name: 'android:windowLightNavigationBar', value: 'false', targetApi: '27'}
];

/** Exported for its test: takes and returns the parsed styles.xml. */
function setDarkNavigationBar(styles) {
    for (const item of NAVIGATION_BAR_ITEMS) {
        styles = assignStylesValue(styles, {
            add:    true,
            parent: getAppThemeGroup(),
            ...item
        });
    }
    return styles;
}

module.exports = function withDarkNavigationBar(config) {
    return withAndroidStyles(config, cfg => {
        cfg.modResults = setDarkNavigationBar(cfg.modResults);
        return cfg;
    });
};

module.exports.setDarkNavigationBar = setDarkNavigationBar;
module.exports.NAVIGATION_BAR_ITEMS = NAVIGATION_BAR_ITEMS;
