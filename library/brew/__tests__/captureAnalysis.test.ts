import {execFileSync} from "node:child_process";
import {resolve} from "node:path";
import {pathToFileURL} from "node:url";

import {toExportJson} from "@/library/brew/brewExport";
import type {StoredBrew} from "@/library/BrewDatabase";
import {frameLogText} from "@/library/machine/frameLog";
import {buildType1, buildType1Bytes} from "@/library/machine/protocol";

describe("offline capture analysis — real emitters with synthetic inputs", () => {
    it("accepts actual frameLogText and toExportJson output without a runtime app import", () => {
        const startedAt = Date.parse("2026-10-16T08:00:00.000Z");
        const record: StoredBrew = {
            id: "synthetic", recipeUuid: "synthetic", recipeName: "Synthetic preview",
            accent: "unused", beverageKind: "tea", startedAt,
            pouringAt: startedAt + 3000, endedAt: startedAt + 10000,
            outcome: "done", failure: null, pours: 1,
            waterTotal: 90, cupTotal: 0, heldSeconds: 0, hasStream: true
        };
        const log = frameLogText([
            {
                at: startedAt + 1000, direction: "sent",
                frame: buildType1Bytes(4513, new Uint8Array([0])),
                parsed: {kind: "unknown", raw: new Uint8Array()}
            },
            {
                at: startedAt + 2000, direction: "sent",
                frame: buildType1(4512),
                parsed: {kind: "unknown", raw: new Uint8Array()}
            },
            {
                at: startedAt + 4000, direction: "received", source: "notify2",
                frame: new Uint8Array([0x58, 0x01]),
                parsed: {kind: "event", code: 40510, value: 1}
            }
        ]);
        const brew = toExportJson(record, [{at: 1000, water: 90, cup: 0, pour: 1}]);
        // Run the dependency-free module in Node, not inside Jest's mobile resolver.
        const moduleUrl = pathToFileURL(resolve("scripts/analyse-brew-capture.mjs")).href;
        const output = execFileSync(process.execPath, ["--input-type=module", "-e", `
            import {readFileSync} from "node:fs";
            import {analyseCapture} from ${JSON.stringify(moduleUrl)};
            const input = JSON.parse(readFileSync(0, "utf8"));
            process.stdout.write(JSON.stringify(analyseCapture(input.brew, [
                {name: "synthetic-emitted-log", text: input.log}
            ], {logDate: "2026-10-16"})));
        `], {input: JSON.stringify({brew, log}), encoding: "utf8"});
        const report = JSON.parse(output);
        expect(report.coverage.uploadCommands).toBe(1);
        expect(report.coverage.executeCommands).toBe(1);
        expect(report.timeline.find((row: {reading?: string}) => row.reading === "event 40510 (1)"))
            .toMatchObject({fromStartedAtMs: 4000, fromPouringAtMs: 1000, arrow: "←notify2"});
        expect(report.timeline.find((row: {kind: string}) => row.kind === "sample"))
            .toMatchObject({wallAt: startedAt + 4000});
    });
});
