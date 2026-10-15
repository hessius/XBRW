import {gunzipSync, gzipSync, strFromU8, strToU8} from "fflate";
import type {BrewSample} from "@/library/brew/BrewRecord";

export const CODEC_PREFIX = "z1:";
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** Hand-written: Hermes ships no btoa/atob. */
function toBase64(bytes: Uint8Array): string {
    let out = "";
    for (let i = 0; i < bytes.length; i += 3) {
        const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
        out += ALPHABET[(n >> 18) & 63] + ALPHABET[(n >> 12) & 63];
        out += i + 1 < bytes.length ? ALPHABET[(n >> 6) & 63] : "=";
        out += i + 2 < bytes.length ? ALPHABET[n & 63] : "=";
    }
    return out;
}

function fromBase64(text: string): Uint8Array {
    const clean = text.replace(/=+$/, "");
    const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
    let bits = 0, acc = 0, at = 0;
    for (const ch of clean) {
        const v = ALPHABET.indexOf(ch);
        if (v < 0) throw new Error("bad base64");
        acc = (acc << 6) | v;
        bits += 6;
        if (bits >= 8) {
            bits -= 8;
            out[at++] = (acc >> bits) & 255;
        }
    }
    return out.subarray(0, at);
}

function pack(text: string): string {
    return CODEC_PREFIX + toBase64(gzipSync(strToU8(text), {mtime: 0}));
}

function unpack(stored: string): string {
    return stored.startsWith(CODEC_PREFIX)
        ? strFromU8(gunzipSync(fromBase64(stored.slice(CODEC_PREFIX.length))))
        : stored;
}

const deltas = (a: number[]) => a.map((v, i) => (i === 0 ? v : v - a[i - 1]));
const undelta = (a: number[]) => {
    const out: number[] = [];
    a.forEach((v, i) => out.push(i === 0 ? v : out[i - 1] + v));
    return out;
};

export function encodeSamples(samples: BrewSample[]): string {
    return pack(JSON.stringify({
        at: deltas(samples.map((s) => s.at)),
        water: samples.map((s) => s.water),
        cup: samples.map((s) => s.cup),
        pour: deltas(samples.map((s) => s.pour)),
    }));
}

/** Reads the compressed form and the legacy raw JSON array. `[]` when unreadable. */
export function decodeSamples(stored: string): BrewSample[] {
    try {
        const parsed = JSON.parse(unpack(stored));
        if (Array.isArray(parsed)) return parsed as BrewSample[];
        const columns = [parsed.at, parsed.water, parsed.cup, parsed.pour];
        if (!columns.every((column) => Array.isArray(column)
            && column.length === parsed.at.length && column.every(Number.isFinite))) return [];
        const at = undelta(parsed.at), pour = undelta(parsed.pour);
        return at.map((t: number, i: number) => ({
            at: t, water: parsed.water[i], cup: parsed.cup[i], pour: pour[i],
        }));
    } catch {
        return [];
    }
}

export const encodeText = pack;
export const decodeText = unpack;
export const isCompressed = (stored: string) => stored.startsWith(CODEC_PREFIX);
