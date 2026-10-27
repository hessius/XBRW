import {parseNotification} from "@/library/machine/protocol";
import {notification} from "./protocolFixtures";

// SYNTHETIC byte-layout checks, not physical mapping or qualification evidence.
function syntheticInfo(length: number) {
    const payload = new Array<number>(length).fill(0);
    payload[38] = 17;
    payload[40] = 2;
    payload[41] = 3;
    [0x78, 0x56, 0x34, 0x12, 0xEF, 0xCD, 0xAB, 0x89]
        .forEach((value, index) => {
            if (55 + index < length) payload[55 + index] = value;
        });
    return notification(0x49, 0x9E, payload);
}

describe("raw settings observations", () => {
    it("preserves zero readings without inventing absent trailing fields", () => {
        expect(parseNotification(Uint8Array.from(notification(0x49, 0x9E, new Array(55).fill(0)))))
            .toMatchObject({
                kind: "info",
                settingsRaw: {
                    temperatureUnit: 0, weightUnit: 0, brightness: 0,
                    pourRadius: null, vibrationAmplitude: null
                }
            });
    });

    it.each([55, 56, 57, 58, 59, 60, 61, 62, 63])(
        "reads only complete uint32 fields in a SYNTHETIC %i-byte payload",
        (length) => {
            // A nonzero backing-buffer offset and extra bytes on both sides
            // catch reads beyond the payload into CRC or neighbouring frames.
            const frame = syntheticInfo(length);
            const backing = Uint8Array.from([91, 92, ...frame, 93, 94, 95, 96]);
            expect(parseNotification(backing.subarray(2, 2 + frame.length))).toMatchObject({
                kind: "info",
                settingsRaw: {
                    temperatureUnit: 2, weightUnit: 3, brightness: 17,
                    pourRadius: length >= 59 ? 0x12345678 : null,
                    vibrationAmplitude: length >= 63 ? 0x89ABCDEF : null
                }
            });
        }
    );

    it("preserves complete zero tuning values", () => {
        expect(parseNotification(Uint8Array.from(notification(0x49, 0x9E, new Array(63).fill(0)))))
            .toMatchObject({settingsRaw: {pourRadius: 0, vibrationAmplitude: 0}});
    });

    it("rejects CRC-invalid and physically truncated SYNTHETIC frames", () => {
        const valid = syntheticInfo(63);
        const corrupt = [...valid];
        corrupt[48] ^= 0x01;
        expect(parseNotification(Uint8Array.from(corrupt)).kind).toBe("unknown");
        expect(parseNotification(Uint8Array.from(valid.slice(0, -3))).kind).toBe("unknown");
    });
});
