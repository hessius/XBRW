/**
 * A bag of coffee, handed to Beanconqueror as one of its own shared beans.
 *
 * The brew handoff (`encode.ts`) sends brews; this sends the bean they draw
 * from, so that Beanconqueror holds the bag and subtracts each brew's dose
 * from it. It uses Beanconqueror's existing bean-sharing link rather than
 * anything new on their side: `beanconqueror://ADD_USER_BEAN?shareUserBean0=…`,
 * the payload being their `BeanProto` message, protobuf encoded, then standard
 * base64, split into 400-character `shareUserBeanN` parameters. Their intent
 * handler joins the parameters, turns spaces back into `+` (Android decodes a
 * `+` in a query as a space), decodes, and opens their own add-bean screen
 * prefilled, so the person confirms the bean there.
 *
 * No protobuf library is pulled in for one message. The encoder below writes
 * the handful of fields this app knows, by field number and wire type, taken
 * from Beanconqueror's `src/classes/bean/bean.proto`:
 *
 *   1 name (string)        2 buyDate (string)    3 roastingDate (string)
 *   5 roaster (string)     12 weight             13 finished (bool)
 *   14 cost                18 url (string)       21 bean_information (message)
 *
 * and in `BeanInformation`: 1 country, 2 region, 3 farm, 4 farmer,
 * 5 elevation, 7 variety, 8 processing (all strings).
 *
 * `weight` and `cost` changed from `uint64` to `double` in their proto
 * (September 2026, issue #1174), and their decoder now accepts both wire types
 * for those two fields. So `weight`, always whole grams here, is sent as a
 * varint, which every Beanconqueror release reads; `cost` is sent as a double,
 * because a price has cents. A release from before the change skips a field
 * whose wire type it does not expect, so on an old build the price is lost and
 * nothing else is.
 *
 * Dates go as Beanconqueror writes its own (`moment().format()`): local
 * midnight with the zone offset, so the calendar day survives every time zone.
 */

import {calendarDay, dayDate} from "@/library/coffeeBag";

/** The bean as this app describes it. Only `name` is required. */
export type ShareBean = {
    name: string;
    /** `YYYY-MM-DD`. */
    buyDate?: string;
    /** `YYYY-MM-DD`. */
    roastingDate?: string;
    roaster?: string;
    /** Whole grams. */
    weight?: number;
    cost?: number;
    url?: string;
    country?: string;
    region?: string;
    farm?: string;
    farmer?: string;
    elevation?: string;
    variety?: string;
    processing?: string;
};

export const ADD_USER_BEAN_PREFIX = "beanconqueror://ADD_USER_BEAN";
const CHUNK_CHARS = 400;
const BASE64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

const VARINT = 0;
const FIXED64 = 1;
const LENGTH = 2;

class Writer {
    private bytes: number[] = [];

    tag(field: number, wire: number): void {
        this.varint(field * 8 + wire);
    }

    /** Non-negative integers up to 2^53, which covers every field written here. */
    varint(value: number): void {
        let n = Math.floor(value);
        while (n >= 0x80) {
            this.bytes.push((n % 0x80) | 0x80);
            n = Math.floor(n / 0x80);
        }
        this.bytes.push(n);
    }

    string(field: number, value: string | undefined): void {
        if (value === undefined || value === "") return;
        const encoded = utf8(value);
        this.tag(field, LENGTH);
        this.varint(encoded.length);
        this.bytes.push(...encoded);
    }

    message(field: number, inner: Writer): void {
        if (inner.bytes.length === 0) return;
        this.tag(field, LENGTH);
        this.varint(inner.bytes.length);
        this.bytes.push(...inner.bytes);
    }

    uint(field: number, value: number | undefined): void {
        if (value === undefined || !Number.isFinite(value) || value < 0) return;
        this.tag(field, VARINT);
        this.varint(value);
    }

    bool(field: number, value: boolean): void {
        this.tag(field, VARINT);
        this.varint(value ? 1 : 0);
    }

    double(field: number, value: number | undefined): void {
        if (value === undefined || !Number.isFinite(value)) return;
        this.tag(field, FIXED64);
        const view = new DataView(new ArrayBuffer(8));
        view.setFloat64(0, value, true);
        for (let i = 0; i < 8; i++) this.bytes.push(view.getUint8(i));
    }

    finish(): Uint8Array {
        return Uint8Array.from(this.bytes);
    }
}

/** UTF-8 by hand: Hermes has `TextEncoder` only on newer builds. */
function utf8(text: string): number[] {
    const out: number[] = [];
    for (const char of text) {
        const code = char.codePointAt(0) ?? 0;
        if (code < 0x80) out.push(code);
        else if (code < 0x800) out.push(0xc0 | (code >> 6), 0x80 | (code & 63));
        else if (code < 0x10000) {
            out.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 63), 0x80 | (code & 63));
        } else {
            out.push(0xf0 | (code >> 18), 0x80 | ((code >> 12) & 63),
                     0x80 | ((code >> 6) & 63), 0x80 | (code & 63));
        }
    }
    return out;
}

/** Standard base64 with padding, which is what Beanconqueror's `atob` expects. */
export function toBase64(bytes: Uint8Array): string {
    let out = "";
    for (let i = 0; i < bytes.length; i += 3) {
        const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
        out += BASE64[(n >> 18) & 63] + BASE64[(n >> 12) & 63];
        out += i + 1 < bytes.length ? BASE64[(n >> 6) & 63] : "=";
        out += i + 2 < bytes.length ? BASE64[n & 63] : "=";
    }
    return out;
}

/**
 * A calendar day as Beanconqueror stores a date: local midnight with offset,
 * `2026-10-12T00:00:00+11:00`. Undefined for anything that is not a day.
 */
export function beanconquerorDate(day: string | undefined): string | undefined {
    const valid = calendarDay(day);
    if (valid === undefined) return undefined;
    const date = dayDate(valid);
    if (date === null) return undefined;
    const offset = -date.getTimezoneOffset();
    const sign = offset >= 0 ? "+" : "-";
    const abs = Math.abs(offset);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${valid}T00:00:00${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

/** The `BeanProto` bytes for a bean. */
export function encodeBeanProto(bean: ShareBean): Uint8Array {
    const writer = new Writer();
    // Field 1 is proto3 singular: an empty name would be omitted on the wire,
    // and Beanconqueror would get a bean with no name. Callers never pass one.
    writer.string(1, bean.name);
    writer.string(2, beanconquerorDate(bean.buyDate));
    writer.string(3, beanconquerorDate(bean.roastingDate));
    writer.string(5, bean.roaster);
    writer.uint(12, bean.weight === undefined ? undefined : Math.round(bean.weight));
    // Sent explicitly: a bag just bought is not finished, and saying so keeps
    // an import from inheriting anything else on their side.
    writer.bool(13, false);
    writer.double(14, bean.cost);
    writer.string(18, bean.url);

    const info = new Writer();
    info.string(1, bean.country);
    info.string(2, bean.region);
    info.string(3, bean.farm);
    info.string(4, bean.farmer);
    info.string(5, bean.elevation);
    info.string(7, bean.variety);
    info.string(8, bean.processing);
    writer.message(21, info);
    return writer.finish();
}

/** The deep link that opens Beanconqueror's add-bean screen with this bean. */
export function beanLink(bean: ShareBean): string {
    const payload = toBase64(encodeBeanProto(bean));
    const params: string[] = [];
    for (let i = 0; i * CHUNK_CHARS < payload.length; i++) {
        params.push(`shareUserBean${i}=${payload.slice(i * CHUNK_CHARS, (i + 1) * CHUNK_CHARS)}`);
    }
    return `${ADD_USER_BEAN_PREFIX}?${params.join("&")}`;
}
