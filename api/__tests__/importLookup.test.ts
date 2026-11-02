import {ReadableStream} from "node:stream/web";

import {importDetail} from "../../test-utils/importPageFixtures";
import {parseImportInput} from "../../library/importInput";
import type {MachineModel} from "../../library/machine/machineModel";
import {IMPORT_BODY_BYTES, IMPORT_DEADLINE_MS, ImportLookupError, lookupImport} from "../_lib/importLookup";

const share = {kind: "share", id: "opaque+/="} as const;
const userAgent = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

function jsonResponse(value: unknown, init?: ResponseInit): Response {
    return new Response(JSON.stringify(value), init);
}

function streamedResponse(chunks: Uint8Array[], headers?: HeadersInit) {
    const cancel = jest.fn();
    const stream = new ReadableStream<Uint8Array>({
        start(controller) {
            for (const chunk of chunks) controller.enqueue(chunk);
            controller.close();
        },
        cancel
    });
    const response = new Response(stream as never, {headers});
    return {response, cancel};
}

function sizedJSON(bytes: number): Uint8Array {
    const base = JSON.stringify({result: "success", recipeVo: {}, padding: ""});
    return Buffer.from(base.replace('""', `"${"x".repeat(bytes - Buffer.byteLength(base))}"`));
}

async function expectLookupError(promise: Promise<unknown>, status: number, kind: string) {
    await expect(promise).rejects.toEqual(expect.objectContaining({
        status, kind, message: `import lookup: ${kind}`
    }));
}

describe("lookupImport", () => {
    beforeEach(() => {
        jest.useFakeTimers({doNotFake: ["nextTick", "setImmediate", "queueMicrotask"]});
    });

    afterEach(() => {
        try {
            expect(jest.getTimerCount()).toBe(0);
        } finally {
            jest.restoreAllMocks();
            jest.useRealTimers();
        }
    });

    it("reads an opaque share id using only the fixed public endpoint", async () => {
        const fetch = jest.spyOn(global, "fetch").mockResolvedValue(new Response(JSON.stringify(importDetail())));

        await expect(lookupImport({kind: "share", id: "opaque+/="}, "studio")).resolves.toEqual(importDetail());

        expect(fetch).toHaveBeenCalledTimes(1);
        expect(fetch).toHaveBeenCalledWith("https://client-api.xbloom.com/RecipeDetail.html", expect.objectContaining({
            method: "POST",
            redirect: "error",
            body: JSON.stringify({interfaceVersion: 19700101, skey: "testskey", tableIdOfRSA: "opaque+/="}),
            headers: {
                accept: "application/json, text/plain, */*",
                "accept-language": "en-US,en;q=0.9",
                "content-type": "application/json",
                Referer: "https://share-h5.xbloom.com/",
                "User-Agent": userAgent
            },
            signal: expect.any(AbortSignal)
        }));
    });

    it("never fetches supplied hosts or URLs embedded in upstream metadata", async () => {
        const source = parseImportInput("https://untrusted.example.test/recipe?id=opaque%2B%2F%3D");
        expect(source).toEqual(share);
        const detail = importDetail();
        const fetch = jest.spyOn(global, "fetch").mockResolvedValue(jsonResponse(detail));
        await expect(lookupImport(source!, "original")).resolves.toEqual(detail);
        expect(fetch).toHaveBeenCalledTimes(1);
        expect(fetch.mock.calls[0][0]).toBe("https://client-api.xbloom.com/RecipeDetail.html");
        expect(JSON.parse(fetch.mock.calls[0][1]!.body as string)).toEqual({
            interfaceVersion: 19700101, skey: "testskey", tableIdOfRSA: "opaque+/="
        });
    });

    it.each<[MachineModel | undefined, number]>([[undefined, 1], ["studio", 1], ["original", 2]])(
        "uses the existing pod protocol for model %s",
        async (model, adaptedModel) => {
            const detail = importDetail();
            detail.recipeVo.adaptedModel = adaptedModel;
            detail.recipeVo.grinderSize = adaptedModel === 2 ? 26 : 54;
            const fetch = jest.spyOn(global, "fetch").mockResolvedValue(jsonResponse(detail));
            await expect(lookupImport({kind: "xid", xid: "XB0001"}, model)).resolves.toEqual(detail);
            expect(fetch).toHaveBeenCalledTimes(1);
            expect(fetch).toHaveBeenCalledWith(
                "https://client-api.xbloom.com/tRecipeDetailOfPods.thtml",
                expect.objectContaining({
                    method: "POST", redirect: "error", signal: expect.any(AbortSignal),
                    body: JSON.stringify({
                        interfaceVersion: 19700101, skey: "testskey", xid: "XB0001",
                        languageType: 0, adaptedModel, isRefreshScanTime: 1, appVersion: "2.1.2"
                    })
                })
            );
        }
    );

    it.each([0, 200, undefined])("accepts successful envelope code %s", async (code) => {
        const detail = {...importDetail(), ...(code === undefined ? {} : {code})};
        jest.spyOn(global, "fetch").mockResolvedValue(jsonResponse(detail));
        await expect(lookupImport(share)).resolves.toEqual(detail);
    });

    it.each([[429, 503], [400, 502], [404, 502], [500, 502], [302, 502]])(
        "classifies HTTP %s without reading or retrying its body",
        async (status, expected) => {
            const response = jsonResponse({message: "private upstream message"}, {status});
            const cancel = jest.spyOn(response.body!, "cancel");
            const fetch = jest.spyOn(global, "fetch").mockResolvedValue(response);
            await expectLookupError(lookupImport(share), expected, "http");
            expect(cancel).toHaveBeenCalledTimes(1);
            expect(fetch).toHaveBeenCalledTimes(1);
            expect(response.body!.locked).toBe(false);
        }
    );

    it("preserves HTTP classification even when cancellation fails", async () => {
        const response = jsonResponse({}, {status: 429});
        jest.spyOn(response.body!, "cancel").mockRejectedValue(new Error("sensitive cancellation failure"));
        jest.spyOn(global, "fetch").mockResolvedValue(response);
        await expectLookupError(lookupImport(share), 503, "http");
    });

    it.each([
        {result: "fail", msg: "deleted secret bean"},
        {...importDetail(), code: 400, msg: "private URL"},
        {...importDetail(), code: null},
        {...importDetail(), code: "200"},
        {recipeVo: {}},
        {result: "success"},
        {result: "success", recipeVo: null},
        {result: "success", recipeVo: []},
        {result: "success", recipeVo: "private upstream value"}
    ])("rejects invalid envelopes without exposing upstream messages: %#", async (detail) => {
        const fetch = jest.spyOn(global, "fetch").mockResolvedValue(jsonResponse(detail));
        await expectLookupError(lookupImport(share), 502, "envelope");
        expect(fetch).toHaveBeenCalledTimes(1);
    });

    it.each([null, [], 42, "private body"])("rejects invalid root shape: %#", async (value) => {
        jest.spyOn(global, "fetch").mockResolvedValue(jsonResponse(value));
        await expectLookupError(lookupImport(share), 502, "body");
    });

    it.each([
        Buffer.from('{"private":'),
        Buffer.from([0x7b, 0x22, 0xff, 0x22, 0x3a, 0x31, 0x7d])
    ])("rejects malformed JSON or UTF-8: %#", async (bytes) => {
        const {response} = streamedResponse([bytes]);
        jest.spyOn(global, "fetch").mockResolvedValue(response);
        await expectLookupError(lookupImport(share), 502, "body");
        expect(response.body!.locked).toBe(false);
    });

    it("rejects a missing body", async () => {
        jest.spyOn(global, "fetch").mockResolvedValue(new Response(null));
        await expectLookupError(lookupImport(share), 502, "body");
    });

    it("classifies network rejection without exposing diagnostics or retrying", async () => {
        const fetch = jest.spyOn(global, "fetch").mockRejectedValue(new TypeError("https://secret.test/beans"));
        await expectLookupError(lookupImport(share), 502, "network");
        expect(fetch).toHaveBeenCalledTimes(1);
    });

    it("allows exactly 1 MiB across chunks and releases the reader lock", async () => {
        expect(IMPORT_BODY_BYTES).toBe(1024 * 1024);
        const bytes = sizedJSON(IMPORT_BODY_BYTES);
        expect(bytes.byteLength).toBe(IMPORT_BODY_BYTES);
        const {response, cancel} = streamedResponse([bytes.subarray(0, 100), bytes.subarray(100)]);
        jest.spyOn(global, "fetch").mockResolvedValue(response);
        await expect(lookupImport(share)).resolves.toMatchObject({result: "success", recipeVo: {}});
        expect(cancel).not.toHaveBeenCalled();
        expect(response.body!.locked).toBe(false);
    });

    it.each([undefined, {"Content-Length": "1"}])(
        "counts every byte despite missing or understated Content-Length: %#",
        async (headers) => {
            const bytes = sizedJSON(IMPORT_BODY_BYTES + 1);
            const cancel = jest.fn();
            let part = 0;
            const stream = new ReadableStream<Uint8Array>({
                pull(controller) {
                    controller.enqueue(part++ === 0 ? bytes.subarray(0, 100) : bytes.subarray(100));
                },
                cancel
            });
            const response = new Response(stream as never, {headers});
            jest.spyOn(global, "fetch").mockResolvedValue(response);
            await expectLookupError(lookupImport(share), 502, "body");
            expect(cancel).toHaveBeenCalledTimes(1);
            expect(response.body!.locked).toBe(false);
        }
    );

    it("rejects a declared oversized body before acquiring its reader", async () => {
        const {response, cancel} = streamedResponse([Buffer.from("{}")], {
            "Content-Length": String(IMPORT_BODY_BYTES + 1)
        });
        const getReader = jest.spyOn(response.body!, "getReader");
        jest.spyOn(global, "fetch").mockResolvedValue(response);
        await expectLookupError(lookupImport(share), 502, "body");
        expect(cancel).toHaveBeenCalledTimes(1);
        expect(getReader).not.toHaveBeenCalled();
        expect(response.body!.locked).toBe(false);
    });

    it("preserves the body limit error when stream cancellation fails", async () => {
        const response = jsonResponse({}, {headers: {"Content-Length": String(IMPORT_BODY_BYTES + 1)}});
        jest.spyOn(response.body!, "cancel").mockRejectedValue(new Error("private cancel"));
        jest.spyOn(global, "fetch").mockResolvedValue(response);
        await expectLookupError(lookupImport(share), 502, "body");
    });

    it("releases a failed reader without leaking upstream diagnostics", async () => {
        const stream = new ReadableStream<Uint8Array>({
            pull(controller) {
                controller.error(new Error("private stream failure"));
            }
        });
        const response = new Response(stream as never);
        jest.spyOn(global, "fetch").mockResolvedValue(response);
        await expectLookupError(lookupImport(share), 502, "network");
        expect(response.body!.locked).toBe(false);
    });

    it("preserves the body limit error and releases the lock when reader cancellation fails", async () => {
        const cancel = jest.fn().mockRejectedValue(new Error("private cancel"));
        const stream = new ReadableStream<Uint8Array>({
            start(controller) {
                controller.enqueue(sizedJSON(IMPORT_BODY_BYTES + 1));
            },
            cancel
        });
        const response = new Response(stream as never);
        jest.spyOn(global, "fetch").mockResolvedValue(response);
        await expectLookupError(lookupImport(share), 502, "body");
        expect(cancel).toHaveBeenCalledTimes(1);
        expect(response.body!.locked).toBe(false);
    });

    it("decodes UTF-8 only after joining chunks, including a split multibyte character", async () => {
        const detail = {...importDetail(), note: "café"};
        const bytes = Buffer.from(JSON.stringify(detail));
        const split = bytes.indexOf(Buffer.from("é")) + 1;
        const {response} = streamedResponse([bytes.subarray(0, split), bytes.subarray(split)]);
        jest.spyOn(global, "fetch").mockResolvedValue(response);
        await expect(lookupImport(share)).resolves.toEqual(detail);
        expect(response.body!.locked).toBe(false);
    });

    it("aborts a pending fetch at exactly 8 seconds, with no retry", async () => {
        expect(IMPORT_DEADLINE_MS).toBe(8_000);
        let signal: AbortSignal | undefined;
        const fetch = jest.spyOn(global, "fetch").mockImplementation((_url, init) => {
            signal = init!.signal!;
            return new Promise((_resolve, reject) => {
                signal!.addEventListener("abort", () => reject(new Error("private abort")), {once: true});
            });
        });
        const rejected = expectLookupError(lookupImport(share), 504, "timeout");
        await jest.advanceTimersByTimeAsync(7_999);
        expect(signal!.aborted).toBe(false);
        await jest.advanceTimersByTimeAsync(1);
        await rejected;
        expect(signal!.aborted).toBe(true);
        expect(fetch).toHaveBeenCalledTimes(1);
    });

    it("keeps the deadline active after headers while the body stalls", async () => {
        let signal: AbortSignal | undefined;
        let response: Response | undefined;
        const fetch = jest.spyOn(global, "fetch").mockImplementation(async (_url, init) => {
            signal = init!.signal!;
            const stream = new ReadableStream<Uint8Array>({
                start(controller) {
                    controller.enqueue(Buffer.from('{"result":'));
                    signal!.addEventListener("abort", () => controller.error(new Error("private body abort")), {once: true});
                }
            });
            response = new Response(stream as never);
            return response;
        });
        const rejected = expectLookupError(lookupImport(share), 504, "timeout");
        await jest.advanceTimersByTimeAsync(7_999);
        expect(signal!.aborted).toBe(false);
        expect(response!.body!.locked).toBe(true);
        await jest.advanceTimersByTimeAsync(1);
        await rejected;
        expect(signal!.aborted).toBe(true);
        expect(response!.body!.locked).toBe(false);
        expect(fetch).toHaveBeenCalledTimes(1);
    });

    it("uses only constant diagnostic categories", () => {
        const error = new ImportLookupError(502, "network");
        expect(error).toBeInstanceOf(Error);
        expect(error.message).toBe("import lookup: network");
    });
});
