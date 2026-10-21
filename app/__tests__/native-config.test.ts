import appConfig from "@/app.json";

type PluginEntry = string | [string, Record<string, unknown>];

describe("native release configuration", () => {
    /** Native navigation configuration must not reuse the shipped 2.1.0 runtime. */
    it("targets 2.2.0, on the appVersion runtime policy", () => {
        expect(appConfig.expo.version).toBe("2.2.0");
        expect(appConfig.expo.runtimeVersion.policy).toBe("appVersion");
    });

    it("allows iOS central-role Bluetooth events in the background", () => {
        expect(appConfig.expo.ios.infoPlist.UIBackgroundModes).toEqual([
            "bluetooth-central"
        ]);
    });

    /**
     * iOS kills a process that reaches a privacy sensitive API without a
     * usage description, rather than denying the request, so the BrewMind
     * browser crashed the app the moment its page opened the camera.
     *
     * These strings are a declaration and not a request. Nobody is asked
     * anything by their presence: the system prompt fires only when a page
     * actually reaches for the camera, which only happens inside BrewMind. So
     * the "ask only where it is needed" behaviour comes for free and there is
     * no reason to pull in a camera module to drive a prompt by hand.
     *
     * The list is exhaustive on purpose. Apple's review asks what every
     * declared key is for, and a key for a capability the app does not use is
     * a question with no good answer, so a new one has to be added here
     * deliberately. Note there is no microphone key: BrewMind wants a picture
     * of a bag, and WebKit asks for camera and microphone separately.
     *
     * Of the two, only the camera key is known to be load bearing. That is the
     * one whose absence killed the app. WebKit has handed a file input's
     * library case to an out of process picker since iOS 14 and this app is
     * iOS 16.4 and up, so the library key should never be reached. It is
     * declared anyway because that routing is WebKit's choice rather than a
     * contract, and the cost of being wrong is asymmetric: one sentence at
     * review against a second crash nobody can reproduce from a desk.
     */
    it("declares the camera and photo library the BrewMind browser may reach", () => {
        expect(Object.keys(appConfig.expo.ios.infoPlist).sort()).toEqual([
            "NSCameraUsageDescription",
            "NSPhotoLibraryUsageDescription",
            "UIBackgroundModes"
        ]);
        expect(appConfig.expo.ios.infoPlist.NSCameraUsageDescription)
            .toMatch(/BrewMind/);
        expect(appConfig.expo.ios.infoPlist.NSPhotoLibraryUsageDescription)
            .toMatch(/BrewMind/);
    });

    /**
     * Android is the other way round, which is why the camera fix is iOS only.
     *
     * `RNCWebViewModuleImpl.needsCameraPermission` refuses to open the camera
     * when CAMERA is in the manifest and has not been granted at runtime.
     * Without it in the manifest the module fires a plain
     * `MediaStore.ACTION_IMAGE_CAPTURE` intent, which hands the job to the
     * camera app and needs no permission of ours at all. So declaring CAMERA
     * here would break the thing it looks like it enables, and cost a line on
     * the Play listing for it.
     */
    it("does not claim the Android camera permission", () => {
        expect(appConfig.expo.android.permissions)
            .not.toContain("android.permission.CAMERA");
    });

    it("does not advertise an unused BLE plugin modes option", () => {
        const plugins = appConfig.expo.plugins as PluginEntry[];
        const entry = plugins.find(
            (plugin): plugin is [string, Record<string, unknown>] =>
                Array.isArray(plugin) && plugin[0] === "react-native-ble-manager"
        );

        expect(entry).toBeDefined();
        expect(entry?.[1]).not.toHaveProperty("modes");
    });
});
