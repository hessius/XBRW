import {
    ControlCapabilityProfile, lookupControlCapabilities
} from "@/library/machine/controlCapabilities";
import {
    ControlValidationError, validateGrindRequest, validatePourRequest, validateSetting
} from "@/library/machine/controlModel";

// SYNTHETIC policy, deliberately unrelated to device/card ranges or firmware.
const profile: ControlCapabilityProfile = {
    id: "synthetic-only",
    models: ["SYNTHETIC"],
    firmwares: ["TEST.1"],
    serials: ["SYNTHETIC-001"],
    grind: {grindSize: {min: 7, max: 13, step: 2}, rpm: {min: 100, max: 300, step: 100}},
    pour: {
        temperatureC: {min: 60, max: 90, step: 1},
        flowMlPerSecond: {min: 1, max: 3, step: 0.5},
        volumeMl: {min: 10, max: 30, step: 5},
        patterns: ["centered", "spiral"],
        modes: ["target"]
    },
    settings: {
        temperatureUnit: ["C", "F"],
        weightUnit: ["g", "oz"],
        brightness: {min: 0, max: 20, step: 5}
    }
};
const observed = {model: "SYNTHETIC", firmware: "TEST.1", serial: "SYNTHETIC-001"};
const target = {mode: "target", temperatureC: 80, flowMlPerSecond: 1.5, pattern: "spiral", volumeMl: 20} as const;

describe("fail-closed capability selection", () => {
    it("never enables production controls, even for an injected profile's identity", () => {
        expect(lookupControlCapabilities(observed)).toEqual({available: false, reason: "unqualified"});
    });

    it("selects only an exact observed model, firmware AND serial from explicitly injected profiles", () => {
        expect(lookupControlCapabilities(observed, [profile])).toEqual({available: true, profile});
        for (const identity of [
            {...observed, model: "Studio"},
            {...observed, firmware: "TEST.2"},
            {...observed, serial: "SYNTHETIC-002"}
        ]) {
            expect(lookupControlCapabilities(identity, [profile]))
                .toEqual({available: false, reason: "unqualified"});
        }
    });

    it.each(["model", "firmware", "serial"] as const)("refuses missing observed %s", (key) => {
        for (const missing of [null, "", " "]) {
            expect(lookupControlCapabilities({...observed, [key]: missing}, [profile]))
                .toEqual({available: false, reason: "identity-unavailable"});
        }
    });

    it("refuses ambiguous injected profiles rather than choosing an order-dependent policy", () => {
        expect(lookupControlCapabilities(observed, [profile, {...profile, id: "other"}]))
            .toEqual({available: false, reason: "ambiguous-profile"});
    });
});

describe("explicit input policies", () => {
    it("accepts only the injected grind ladder, without borrowing NFC bounds", () => {
        expect(() => validateGrindRequest({grindSize: 7, rpm: 200}, profile.grind)).not.toThrow();
        for (const grindSize of [8, 40, NaN, Infinity]) {
            expect(() => validateGrindRequest({grindSize, rpm: 200}, profile.grind))
                .toThrow(ControlValidationError);
        }
        expect(() => validateGrindRequest({grindSize: 7, rpm: 150}, profile.grind)).toThrow(ControlValidationError);
        expect(() => validateGrindRequest({grindSize: 7, rpm: 200}, null)).toThrow(ControlValidationError);
    });

    it("requires finite, whole Celsius and qualified flow, volume, pattern and mode", () => {
        expect(() => validatePourRequest(target, profile.pour)).not.toThrow();
        for (const change of [
            {temperatureC: 80.5}, {temperatureC: NaN}, {temperatureC: Infinity},
            {flowMlPerSecond: 1.2}, {flowMlPerSecond: -Infinity},
            {volumeMl: 11}, {volumeMl: NaN}, {volumeMl: 35},
            {pattern: "circular" as const}, {mode: "continuous" as const}
        ]) {
            expect(() => validatePourRequest({...target, ...change}, profile.pour)).toThrow(ControlValidationError);
        }
        expect(() => validatePourRequest(target, null)).toThrow(ControlValidationError);
    });

    it("allows continuous mode only explicitly and requires known target bounds", () => {
        const continuous = {mode: "continuous", temperatureC: 80, flowMlPerSecond: 1.5, pattern: "spiral"} as const;
        const policy = {...profile.pour!, modes: ["continuous"] as const, volumeMl: null};
        expect(() => validatePourRequest(continuous, policy)).not.toThrow();
        expect(() => validatePourRequest(target, {...policy, modes: ["target"]})).toThrow(ControlValidationError);
    });

    it("requires whole Celsius even if a supplied ladder includes fractions", () => {
        expect(() => validatePourRequest(
            {...target, temperatureC: 80.5},
            {...profile.pour!, temperatureC: {min: 60, max: 90, step: 0.5}}
        )).toThrow(ControlValidationError);
    });

    it("refuses unqualified settings/values and preserves zero when explicitly legal", () => {
        expect(() => validateSetting("brightness", 0, profile.settings)).not.toThrow();
        expect(() => validateSetting("temperatureUnit", "F", profile.settings)).not.toThrow();
        for (const value of [3, NaN, Infinity, 25]) {
            expect(() => validateSetting("brightness", value, profile.settings)).toThrow(ControlValidationError);
        }
        expect(() => validateSetting("weightUnit", "ml", profile.settings)).toThrow(ControlValidationError);
        expect(() => validateSetting("waterSource", "tank", profile.settings)).toThrow(ControlValidationError);
        expect(() => validateSetting("pourRadius", 0, profile.settings)).toThrow(ControlValidationError);
        expect(() => validateSetting("vibrationAmplitude", 1, profile.settings)).toThrow(ControlValidationError);
        expect(() => validateSetting("weightUnit", "ml", {weightUnit: ["ml"]})).not.toThrow();
    });

    it("does not let floating-point tolerance accept off-ladder values on a large range", () => {
        expect(() => validateSetting(
            "brightness", 1_000_000_000_000_000.25,
            {brightness: {min: 0, max: 2_000_000_000_000_000, step: 1}}
        )).toThrow(ControlValidationError);
    });

    it.each([
        {min: 0, max: Infinity, step: 1}, {min: 10, max: 0, step: 1},
        {min: 0, max: 10, step: 0}, {min: 0, max: 10, step: NaN}
    ])("refuses malformed numeric policy %j", (rule) => {
        expect(() => validateSetting("brightness", 0, {brightness: rule})).toThrow(ControlValidationError);
    });
});
