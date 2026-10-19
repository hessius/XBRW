import {Buffer} from "node:buffer";
import {existsSync, readFileSync} from "node:fs";
import {gunzipSync, gzipSync} from "node:zlib";

import type {BrewSample} from "@/library/brew/BrewRecord";
import {
    CODEC_PREFIX, decodeSamples, decodeText, encodeSamples, encodeText, isCompressed,
} from "@/library/brew/traceCodec";

const samples: BrewSample[] = Array.from({length: 1_000}, (_, i) => ({
    at: 137 + i * 225 + (i % 3) * 5,
    water: Math.fround(Math.min(250, i * 0.4)),
    cup: i === 0 ? -0.015000000596046448 : Math.fround(16.44499969482422 + i * 0.21),
    pour: Math.min(3, Math.floor(i / 250)),
}));

const realBrewPath = "/Users/jesperhessius/Downloads/kochere-supermind-2026-09-30.json";

describe("sample trace codec", () => {
    it("round-trips 1,000 samples without floating-point drift", () => {
        expect(decodeSamples(encodeSamples(samples))).toEqual(samples);
    });

    it("round-trips an empty stream", () => {
        expect(decodeSamples(encodeSamples([]))).toEqual([]);
    });

    it("round-trips one sample with non-zero initial time and pour", () => {
        const single = [{at: 251, water: 1.23456789012345, cup: 16.44499969482422, pour: 2}];
        expect(decodeSamples(encodeSamples(single))).toEqual(single);
    });

    it("reads legacy raw JSON sample arrays unchanged", () => {
        expect(decodeSamples(JSON.stringify(samples))).toEqual(samples);
    });

    it.each(["", "garbage", "null", "{}", "z1:", "z1:!not-base64!", "z1:bm90IGd6aXA="])(
        "treats unreadable samples as a missing stream: %p", (stored) => {
            expect(decodeSamples(stored)).toEqual([]);
        },
    );

    it("rejects a compressed trace with a missing water column", () => {
        const stored = encodeText(JSON.stringify({at: [0], cup: [0], pour: [0]}));
        expect(decodeSamples(stored)).toEqual([]);
    });

    it.each(["at", "water", "cup", "pour"])("rejects mismatched %s column lengths", (column) => {
        const columns = {at: [0], water: [0], cup: [0], pour: [0], [column]: [0, 1]};
        expect(decodeSamples(encodeText(JSON.stringify(columns)))).toEqual([]);
    });

    it.each(["at", "water", "cup", "pour"])("rejects non-numeric %s entries", (column) => {
        const columns = {at: [0], water: [0], cup: [0], pour: [0], [column]: ["0"]};
        expect(decodeSamples(encodeText(JSON.stringify(columns)))).toEqual([]);
    });

    it.each(["at", "water", "cup", "pour"])("rejects non-finite %s entries", (column) => {
        const json = JSON.stringify({at: [0], water: [0], cup: [0], pour: [0]})
            .replace(`"${column}":[0]`, `"${column}":[1e400]`);
        expect(decodeSamples(encodeText(json))).toEqual([]);
    });

    it("produces deterministic compressed output", () => {
        expect(encodeSamples(samples)).toBe(encodeSamples(samples));
    });

    it("marks compressed streams with the version prefix", () => {
        expect(CODEC_PREFIX).toBe("z1:");
        expect(encodeSamples(samples).startsWith(CODEC_PREFIX)).toBe(true);
        expect(isCompressed(encodeSamples(samples))).toBe(true);
        expect(isCompressed(JSON.stringify(samples))).toBe(false);
        expect(isCompressed("")).toBe(false);
    });

    it("stores a realistic series in less than a quarter of its raw JSON size", () => {
        expect(encodeSamples(samples).length).toBeLessThan(JSON.stringify(samples).length * 0.25);
    });

    (existsSync(realBrewPath) ? it : it.skip)("round-trips the real exported brew samples exactly", () => {
        const {samples: realSamples} = JSON.parse(readFileSync(realBrewPath, "utf8")) as {samples: BrewSample[]};
        expect(realSamples.length).toBeGreaterThan(0);
        expect(decodeSamples(encodeSamples(realSamples))).toEqual(realSamples);
    });
});

describe("frame text codec", () => {
    it("round-trips a 256-line frame log", () => {
        const frames = Array.from({length: 256}, (_, i) => `${i * 225} RX 40515 00 01 café 水 ☕`).join("\n");
        const stored = encodeText(frames);
        expect(stored.startsWith(CODEC_PREFIX)).toBe(true);
        expect(decodeText(stored)).toBe(frames);
        expect(encodeText(frames)).toBe(stored);
    });

    it("round-trips empty text", () => {
        expect(decodeText(encodeText(""))).toBe("");
    });

    it.each(["", "0 RX 40515\n225 TX 40524", "legacy café 水 ☕"])(
        "returns legacy raw text unchanged: %p", (text) => {
            expect(decodeText(text)).toBe(text);
            expect(isCompressed(text)).toBe(false);
        },
    );

    it.each(["z1:", "z1:!not-base64!", "z1:bm90IGd6aXA="])(
        "throws for corrupt compressed text rather than hiding it: %p", (stored) => {
            expect(() => decodeText(stored)).toThrow();
        },
    );

    it("uses interoperable base64 for every compressed byte length modulo three", () => {
        const remainders = new Set<number>();
        for (let length = 0; length < 100; length++) {
            const text = Array.from({length}, (_, i) => String.fromCharCode(32 + i % 90)).join("");
            const payload = encodeText(text).slice(CODEC_PREFIX.length);
            const compressed = Buffer.from(payload, "base64");
            remainders.add(compressed.length % 3);
            expect(payload).toBe(compressed.toString("base64"));
            expect(gunzipSync(compressed).toString("utf8")).toBe(text);
            expect(decodeText(CODEC_PREFIX + gzipSync(text).toString("base64"))).toBe(text);
            expect(decodeText(CODEC_PREFIX + payload)).toBe(text);
        }
        expect([...remainders].sort()).toEqual([0, 1, 2]);
    });
});
