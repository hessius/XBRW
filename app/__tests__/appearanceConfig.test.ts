import config from "@/app.json";

describe("native appearance configuration", () => {
    it.each([config.expo, config.expo.ios, config.expo.android])("allows an explicit runtime scheme", section => {
        expect(section.userInterfaceStyle).toBe("automatic");
    });

    it("uses only the runtime-capable navigation bar plugin with branded startup buttons", () => {
        expect(config.expo.plugins).toContainEqual([
            "expo-navigation-bar", {enforceContrast: false, hidden: false, style: "light"}
        ]);
        expect(config.expo.plugins).not.toContain("./plugins/withDarkNavigationBar");
    });

    it("preserves branded launch art, identities and native fingerprinting", () => {
        expect(config.expo.scheme).toEqual(["xbrecipewriter", "xbrw"]);
        expect(config.expo.version).toBe("2.2.0");
        expect(config.expo.runtimeVersion).toEqual({policy: "fingerprint"});
        expect(config.expo.backgroundColor).toBe("#000000");
        expect(config.expo.plugins).toContainEqual([
            "expo-splash-screen",
            {backgroundColor: "#000000", image: "./assets/images/splash-icon.png", imageWidth: 200}
        ]);
        expect(config.expo.ios.bundleIdentifier).toBe("com.hessius.xbrwplusplus");
        expect(config.expo.android.package).toBe("com.hessius.xbrwplusplus");
    });
});
