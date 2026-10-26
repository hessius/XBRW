import {TextDecoder, types} from "node:util";

import type {ImportSource} from "../../library/importInput";
import {adaptedModelFor, type MachineModel} from "../../library/machine/machineModel";
import {InvalidImportDataError, recordOf} from "../../library/xbloomRecipeData";

export const IMPORT_DEADLINE_MS = 8_000;
export const IMPORT_BODY_BYTES = 1024 * 1024;

export class ImportLookupError extends Error {
    constructor(
        public readonly status: 502 | 503 | 504,
        public readonly kind: "http" | "envelope" | "body" | "timeout" | "network"
    ) {
        super(`import lookup: ${kind}`);
    }
}

function upstreamRequest(source: ImportSource, model: MachineModel) {
    const common = {interfaceVersion: 19700101, skey: "testskey"};
    return source.kind === "share" ? {
        endpoint: "https://client-api.xbloom.com/RecipeDetail.html",
        body: {...common, tableIdOfRSA: source.id}
    } : {
        endpoint: "https://client-api.xbloom.com/tRecipeDetailOfPods.thtml",
        body: {
            ...common, xid: source.xid, languageType: 0, adaptedModel: adaptedModelFor(model),
            isRefreshScanTime: 1, appVersion: "2.1.2"
        }
    };
}

async function cancelBody(body: {cancel(): Promise<unknown>} | null): Promise<void> {
    try {
        await body?.cancel();
    } catch {
        // Cancellation is best-effort; it must not replace the refusal or size error.
    }
}

async function readBody(response: Response): Promise<unknown> {
    if (!response.body) throw new ImportLookupError(502, "body");
    if (Number(response.headers.get("Content-Length")) > IMPORT_BODY_BYTES) {
        await cancelBody(response.body);
        throw new ImportLookupError(502, "body");
    }
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    try {
        while (true) {
            const chunk = await reader.read();
            if (chunk.done) break;
            bytes += chunk.value.byteLength;
            if (bytes > IMPORT_BODY_BYTES) {
                await cancelBody(reader);
                throw new ImportLookupError(502, "body");
            }
            chunks.push(chunk.value);
        }
    } finally {
        reader.releaseLock();
    }
    try {
        return JSON.parse(new TextDecoder("utf-8", {fatal: true}).decode(Buffer.concat(chunks)));
    } catch (error) {
        if (error instanceof SyntaxError ||
            (types.isNativeError(error) && "code" in error && error.code === "ERR_ENCODING_INVALID_ENCODED_DATA")) {
            throw new ImportLookupError(502, "body");
        }
        throw error;
    }
}

export async function lookupImport(
    source: ImportSource, model: MachineModel = "studio"
): Promise<Record<string, unknown>> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), IMPORT_DEADLINE_MS);
    try {
        const request = upstreamRequest(source, model);
        const response = await fetch(request.endpoint, {
            method: "POST",
            redirect: "error",
            signal: controller.signal,
            headers: {
                accept: "application/json, text/plain, */*",
                "accept-language": "en-US,en;q=0.9",
                "content-type": "application/json",
                Referer: "https://share-h5.xbloom.com/",
                "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
            },
            body: JSON.stringify(request.body)
        });
        if (!response.ok) {
            await cancelBody(response.body);
            throw new ImportLookupError(response.status === 429 ? 503 : 502, "http");
        }
        let root: Record<string, unknown>;
        try {
            root = recordOf(await readBody(response));
        } catch (error) {
            if (error instanceof InvalidImportDataError) throw new ImportLookupError(502, "body");
            throw error;
        }
        if (root.result !== "success" || ("code" in root && root.code !== 0 && root.code !== 200)) {
            throw new ImportLookupError(502, "envelope");
        }
        try {
            recordOf(root.recipeVo);
        } catch (error) {
            if (error instanceof InvalidImportDataError) throw new ImportLookupError(502, "envelope");
            throw error;
        }
        return root;
    } catch (error) {
        if (controller.signal.aborted) throw new ImportLookupError(504, "timeout");
        if (error instanceof ImportLookupError) throw error;
        throw new ImportLookupError(502, "network");
    } finally {
        clearTimeout(timeout);
    }
}
