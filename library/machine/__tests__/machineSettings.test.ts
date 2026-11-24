import {machineSettingsFixture, settingIdentity, settingProfile, settingReadings} from "@/test-utils/machineSettings";
import {machineInfoFrame} from "@/library/machine/__tests__/FakeTransport";
import {applySettingProposal} from "@/library/machine/settingEditor";
import {MACHINE_STATE} from "@/library/machine/protocol";
import {notification, status} from "@/library/machine/__tests__/protocolFixtures";

it("reads qualified settings explicitly with leased info only, never Apply or a recovery marker", async () => {
    const s = await machineSettingsFixture();
    const support = s.controls.describeSettings(settingIdentity, "brightness");
    expect(s.controls.describeSettings(settingIdentity, "brightness")).toBe(support);
    expect(support).toMatchObject({reading: "unavailable", reason: null, readingReason: "missing-readback"});
    expect(s.radio.sent).toEqual([]);
    await s.controls.readSettings(settingIdentity, "brightness");
    expect(s.planned.map(p => p.command)).toEqual([{kind: "inspect", tool: null, settingId: "brightness", readOnly: true}]);
    expect(s.radio.sent).toEqual([8100]);
    expect(s.controls.getSnapshot()).toMatchObject({phase: "closed", identity: settingIdentity, settings: settingReadings});
    expect(s.controls.describeSettings(settingIdentity, "brightness").reading).toBe("current");
    expect(s.machine.controlBlocker).toBeNull();
    expect(s.recovery.snapshot.marker).toBeNull();
    s.controls.dispose();
});

it("does not fabricate settings from an ordinary info refresh without qualified decoded readback", async () => {
    const s = await machineSettingsFixture();
    s.respond(() => {});
    await expect(s.controls.readSettings(settingIdentity, "temperatureUnit")).rejects.toThrow("Qualified control response missing");
    expect(s.controls.getSnapshot()).toMatchObject({phase: "unknown", settings: null});
    expect(s.machine.controlBlocker).not.toBeNull();
    expect(s.recovery.snapshot.marker).toBeNull();
    expect(s.radio.sent).toEqual([8100]);
    s.controls.dispose();
});

it("rejects a supposed read-only inspection containing a command frame before sending it", async () => {
    const s = await machineSettingsFixture({unsafeInspectionFrame: true});
    await expect(s.controls.readSettings(settingIdentity, "brightness")).rejects.toThrow("leased info only");
    expect(s.radio.sent).toEqual([]);
    expect(s.controls.getSnapshot().phase).toBe("unknown");
    expect(s.machine.controlBlocker).not.toBeNull();
    expect(s.recovery.snapshot.marker).toBeNull();
    s.controls.dispose();
});

it("captures numeric metadata and choices immutably with the same scope as controller operations", async () => {
    const profile = settingProfile();
    const s = await machineSettingsFixture({profile});
    profile.settings.brightness!.unit = "changed";
    profile.settings.brightness!.min = 99;
    profile.settings.waterSource = ["tap"];
    const support = s.controls.describeSettings(settingIdentity, "brightness");
    expect(support.policy.brightness).toEqual({min: 1, max: 5, step: 1, unit: "test-level"});
    expect(support.policy.waterSource).toEqual(["tank", "tap"]);
    expect(Object.isFrozen(support.policy.brightness)).toBe(true);
    await applySettingProposal(s.controls, settingIdentity, {id: "brightness", proposal: 3});
    expect(s.controls.getSnapshot().settings?.brightness).toBe(3);
    s.controls.dispose();
});

it("keeps last-known readings isolated by exact device, serial and connected info generation", async () => {
    const s = await machineSettingsFixture();
    await s.controls.readSettings(settingIdentity, "temperatureUnit");
    expect(s.controls.describeSettings({...settingIdentity, deviceId: "other"}, "temperatureUnit"))
        .toMatchObject({reason: "identity-mismatch", reading: "unavailable"});
    expect(s.controls.describeSettings({...settingIdentity, serial: "other"}, "temperatureUnit").reading).toBe("unavailable");
    s.radio.drop();
    expect(s.controls.describeSettings(settingIdentity, "temperatureUnit")).toMatchObject({reason: "offline", reading: "last-known"});
    await s.machine.connect(settingIdentity.deviceId);
    s.radio.emit(status(MACHINE_STATE.IDLE));
    expect(s.controls.describeSettings(settingIdentity, "temperatureUnit").reading).toBe("last-known");
    await s.controls.readSettings(settingIdentity, "temperatureUnit");
    expect(s.controls.describeSettings(settingIdentity, "temperatureUnit").reading).toBe("current");
    s.radio.emit(machineInfoFrame({serial: "wrong", model: "test", firmware: "test"}));
    expect(s.controls.describeSettings(settingIdentity, "temperatureUnit")).toMatchObject({reason: "identity-mismatch", reading: "last-known"});
    s.controls.dispose();
});

it("retains the passive lease on missing readback, reconciles qualified settings only, never invents motion recovery", async () => {
    const s = await machineSettingsFixture();
    s.readings({...settingReadings, brightness: null});
    await expect(s.controls.readSettings(settingIdentity, "brightness")).rejects.toThrow("Qualified current setting unavailable");
    expect(s.controls.getSnapshot().phase).toBe("unknown");
    expect(s.machine.controlBlocker).not.toBeNull();
    expect(s.recovery.snapshot.marker).toBeNull();
    expect(s.controls.describeSettings(settingIdentity, "brightness").recoverable).toBe(true);
    await expect(s.controls.close()).rejects.toThrow();
    await expect(s.controls.recover()).rejects.toThrow("Qualified current setting unavailable");
    expect(s.machine.controlBlocker).not.toBeNull();
    s.readings(settingReadings);
    await s.controls.recover();
    expect(s.controls.getSnapshot()).toMatchObject({phase: "closed", identity: settingIdentity, settings: settingReadings});
    expect(s.machine.controlBlocker).toBeNull();
    expect(s.planned.every(p => p.command.kind === "inspect")).toBe(true);
    s.controls.dispose();
});

it("fails closed for production, unsupported settings and mismatched identities without a read or lease", async () => {
    const production = await machineSettingsFixture({production: true});
    await expect(production.controls.readSettings(settingIdentity, "brightness")).rejects.toThrow("unqualified");
    expect(production.planned).toEqual([]);
    production.controls.dispose();
    const profile = settingProfile();
    delete profile.settings.pourRadius;
    const s = await machineSettingsFixture({profile});
    await expect(s.controls.readSettings(settingIdentity, "pourRadius")).rejects.toThrow("qualified policy");
    await expect(s.controls.readSettings({...settingIdentity, serial: "wrong"}, "brightness")).rejects.toThrow("serial");
    expect(s.planned).toEqual([]);
    expect(s.machine.controlBlocker).toBeNull();
    s.controls.dispose();
});

it("qualifies real Studio hardware with empty model in info blob under production qualifications", async () => {
    const studioIdentity = {deviceId: "setting-test", serial: "J15A01B5AF231"};
    const payload = new Array(63).fill(0);
    const put = (at: number, textValue: string) => {
        for (let i = 0; i < textValue.length; i++) payload[at + i] = textValue.charCodeAt(i);
    };
    put(0, studioIdentity.serial);
    // model is 0xFF padded on real Studio hardware (bytes 13-18)
    payload.fill(0xff, 13, 19);
    put(19, "V12.0D.500");
    payload[33] = 1; // waterEnough
    payload[36] = 0; // waterFeed = tank
    payload[37] = 30 + 62;
    payload[38] = 8; // brightness = 8 (Mid)
    payload[40] = 1; // tempUnit = 1 (C)
    payload[41] = 1; // weightUnit = 1 (g)
    put(51, "0000");
    const realStudioBlob = notification(0x49, 0x9E, payload);

    const s = await machineSettingsFixture({production: true});
    s.radio.infoReply = realStudioBlob;
    s.radio.emit(realStudioBlob);

    // describeSettings hydrates 40521 settings immediately without identity-unavailable error
    const tempSupport = s.controls.describeSettings(studioIdentity, "temperatureUnit");
    expect(tempSupport.unavailable).toBeNull();
    expect(tempSupport.reason).toBeNull();
    expect(tempSupport.reading).toBe("current");
    expect(tempSupport.readingReason).toBeNull();
    expect(tempSupport.policy.temperatureUnit).toEqual(["C", "F"]);

    // 40521 reports 0 for tuning on J15A01B5AF231, which stays unavailable until read via 11508/11506
    const vibSupport = s.controls.describeSettings(studioIdentity, "vibrationAmplitude");
    expect(vibSupport.unavailable).toBeNull();
    expect(vibSupport.reading).toBe("unavailable");
    expect(vibSupport.readingReason).toBe("missing-readback");

    // Standalone tools are now qualified on Studio V12.0D.500
    for (const tool of ["grind", "pour", "scale"] as const) {
        expect(s.controls.describeTool(studioIdentity, tool).unavailable).toBeNull();
    }
    expect(s.controls.describeTool(studioIdentity, "pour")).toMatchObject({
        liveTemperature: true,
        livePattern: true
    });

    // Reading settings explicitly succeeds and decodes from info refresh
    await s.controls.readSettings(studioIdentity, "temperatureUnit");
    expect(s.controls.getSnapshot()).toMatchObject({
        phase: "closed",
        identity: studioIdentity,
        settings: expect.objectContaining({
            temperatureUnit: "C",
            weightUnit: "g",
            brightness: 8,
            waterSource: "tank",
            pourRadius: null,
            vibrationAmplitude: null
        })
    });
    expect(s.controls.describeSettings(studioIdentity, "temperatureUnit").reading).toBe("current");
    s.controls.dispose();
});
