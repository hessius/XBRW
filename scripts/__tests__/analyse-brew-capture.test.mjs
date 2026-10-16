import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {test} from "node:test";

const script = new URL("../analyse-brew-capture.mjs", import.meta.url);
const {analyseCapture} = await import(script);
const start = Date.parse("2026-10-16T08:00:00.000Z");

// Explicitly synthetic; shaped like toExportJson(), never a personal capture.
function exportedBrew(overrides = {}) {
    return {
        version: 1,
        brew: {
            id: "synthetic", recipeUuid: "synthetic", recipeName: "Synthetic tea",
            accent: "unused", beverageKind: "tea",
            startedAt: start, startedAtISO: new Date(start).toISOString(),
            pouringAt: start + 5000, endedAt: start + 15000,
            endedAtISO: new Date(start + 15000).toISOString(),
            outcome: "done", pours: 3, hasStream: true,
            plan: [45, 60, 90].map((pauseTime, index) => ({
                pourNumber: index + 1, volume: 90, temperature: index === 2 ? 80 : 92,
                flowRate: 35, agitation: 0, pourPattern: 0, pauseTime
            })),
            ...overrides
        },
        samples: [
            {at: 0, water: 1, cup: -0.1, pour: 1},
            {at: 1000, water: 90, cup: 0, pour: 1},
            {at: 2000, water: 88, cup: 5, pour: 2}
        ]
    };
}

// Actual historyLine/frameLogText format: UTC time only, arrow/channel, hex, reading.
const sessionLog = [
    "This session machine log",
    "",
    "08:00:00.000  Connected",
    "08:00:01.000  →  58 01 01 A1 11 0D 00 00 00 01 00 00 00  ",
    "08:00:02.000  →  58 01 01 A0 11 0C 00 00 00 01 00 00  ",
    "08:00:05.100  ←ffe3  58 01 00  40510 event (raw)",
    "08:00:16.000  ←  58 01 00  event 40513",
    "bad timestamp retained"
].join("\n");

function analyse(brew = exportedBrew(), text = sessionLog, logDate = "2026-10-16") {
    return analyseCapture(JSON.stringify(brew), [{name: "synthetic-session", text}], {logDate});
}

test("aligns emitted UTC log times and sample zero to pouringAt, not startedAt", () => {
    const report = analyse();
    assert.equal(report.clocks.sampleOrigin, "pouringAt");
    assert.deepEqual(report.samples.span, {
        firstAtMs: 0, lastAtMs: 2000, firstFromStartedAtMs: 5000,
        lastFromStartedAtMs: 7000, firstFromPouringAtMs: 0, lastFromPouringAtMs: 2000
    });
    const command = report.timeline.find(row => row.rawCommand === 4513);
    assert.equal(command.fromStartedAtMs, 1000);
    assert.equal(command.fromPouringAtMs, -4000);
    assert.equal(command.raw, sessionLog.split("\n")[3]);
    const sample = report.timeline.find(row => row.kind === "sample" && row.sampleIndex === 0);
    assert.equal(sample.wallAt, start + 5000);
    assert.equal(report.plan[2].pauseTime, 90);
    assert.deepEqual(report.coverage, {uploadCommands: 1, executeCommands: 1, tailBeyondRecordEnd: true});
    assert.ok(report.warnings.some(line => /never proves complete coverage/.test(line)));
});

test("retains raw untimed lines, raw event text and every input sample for local replay", () => {
    const report = analyse();
    assert.equal(report.timeline.filter(row => row.kind === "sample").length, 3);
    assert.equal(report.timeline.filter(row => row.kind === "log").length, sessionLog.split("\n").length);
    const unknown = report.timeline.find(row => row.raw === "bad timestamp retained");
    assert.equal(unknown.timing, "unparsed");
    assert.equal(unknown.wallAt, null);
    assert.ok(report.timeline.some(row => row.raw?.includes("40510 event (raw)")));
    assert.deepEqual(report.samples.indices.map(row => row.index), [1, 2]);
    assert.deepEqual(report.samples.indices[0].water, {min: 1, max: 90, last: 90});
    assert.deepEqual(report.samples.indices[0].cup, {min: -0.1, max: 0, last: 0});
    assert.deepEqual(report.samples.last, exportedBrew().samples[2]);
    assert.ok(report.warnings.some(line => /index 3.*not observed/.test(line)));
});

test("supports copied stored-log metadata and multiple explicit inputs without deduplicating evidence", () => {
    const stored = `Last recorded brew frame log\nBrew: Synthetic\nWhen: local display\nRecord: synthetic\n\n${sessionLog.split("\n")[5]}`;
    const report = analyseCapture(JSON.stringify(exportedBrew()), [
        {name: "session", text: sessionLog}, {name: "stored", text: stored}
    ], {logDate: "2026-10-16"});
    assert.equal(report.timeline.filter(row => row.raw?.includes("40510 event")).length, 2);
    assert.ok(report.timeline.some(row => row.source === "stored" && row.raw === "Record: synthetic"));
});

test("does not mistake the copied session's separate connection history for a backwards frame clock", () => {
    const log = [
        "This session machine log", "",
        "23:59:59.000  Connected (earlier day unknown)",
        "08:00:09.000  Connection status", "",
        ...sessionLog.split("\n").slice(3)
    ].join("\n");
    const report = analyse(exportedBrew(), log);
    assert.equal(report.timeline.find(row => row.rawCommand === 4513).fromStartedAtMs, 1000);
    assert.equal(report.timeline.find(row => row.raw?.includes("Connection status")).wallAt, null);
    assert.ok(report.warnings.some(line => /connection history.*undated/.test(line)));
    assert.ok(!report.warnings.some(line => /backwards/.test(line)));
});

test("leaves time-only logs unaligned without an explicit UTC date", () => {
    const undated = analyseCapture(JSON.stringify(exportedBrew()), [{name: "log", text: sessionLog}]);
    assert.equal(undated.timeline.find(row => row.rawCommand === 4513).wallAt, null);
    assert.equal(undated.timeline.find(row => row.rawCommand === 4513).timeOfDay, "08:00:01.000");
    assert.equal(undated.coverage.tailBeyondRecordEnd, null);
    assert.ok(undated.warnings.some(line => /UTC date/.test(line)));
});

test("does not invent a sample origin when pouringAt is missing or zero", () => {
    for (const pouringAt of [undefined, 0]) {
        const report = analyse(exportedBrew({pouringAt}));
        assert.equal(report.clocks.sampleOrigin, "unknown");
        assert.equal(report.samples.span.firstFromStartedAtMs, null);
        assert.equal(report.timeline.find(row => row.kind === "sample").wallAt, null);
        assert.ok(report.warnings.some(line => /sample origin/.test(line)));
    }
});

test("unrolls an explicitly dated midnight crossing and flags backwards clock movement", () => {
    const brew = exportedBrew({
        startedAt: Date.parse("2026-10-16T23:59:59.000Z"),
        pouringAt: Date.parse("2026-10-17T00:00:00.000Z"),
        endedAt: Date.parse("2026-10-17T00:00:10.000Z")
    });
    const report = analyse(brew, "23:59:59.500  connected\n00:00:00.500  event\n00:00:00.400  clock moved");
    const afterMidnight = report.timeline.find(row => row.raw === "00:00:00.500  event");
    assert.equal(afterMidnight.fromStartedAtMs, 1500);
    assert.ok(report.warnings.some(line => /midnight/.test(line)));
    assert.ok(report.warnings.some(line => /backwards/.test(line)));
    assert.equal(report.timeline.find(row => row.raw?.endsWith("clock moved")).wallAt, null);
});

test("reports partial capture, empty samples and absent plan without assigning tea phases", () => {
    const brew = exportedBrew({plan: undefined, hasStream: false});
    brew.samples = [];
    const report = analyse(brew, "08:00:06.000  ←ffe2  58 01 00  event 40512");
    assert.equal(report.samples.span, null);
    assert.deepEqual(report.samples.indices, []);
    assert.equal(report.samples.last, null);
    assert.equal(report.plan, null);
    for (const fragment of [/upload/, /execute/, /tail/, /empty/, /plan/]) {
        assert.ok(report.warnings.some(line => fragment.test(line)), String(fragment));
    }
    assert.ok(!JSON.stringify(report).includes('"teaPhase"'));
    assert.ok(!JSON.stringify(report).includes('"rootCause"'));
});

test("rejects malformed exports, invalid times, samples, plan and dates explicitly", () => {
    assert.throws(() => analyseCapture("{", [{name: "log", text: sessionLog}]), /JSON/);
    for (const brew of [
        null, {version: 2}, {...exportedBrew(), samples: {}},
        exportedBrew({startedAt: "yesterday"}),
        exportedBrew({endedAt: start - 1}), exportedBrew({pouringAt: "bad"}),
        exportedBrew({plan: [{}]}), exportedBrew({plan: {}})
    ]) {
        assert.throws(() => analyse(brew), /export|version|samples|startedAt|endedAt|pouringAt|plan/);
    }
    for (const sample of [
        {at: -1, water: 0, cup: 0, pour: 1},
        {at: 0, water: "1", cup: 0, pour: 1},
        {at: 0, water: 0, cup: null, pour: 1},
        {at: 0, water: 0, cup: 0, pour: 1.5}
    ]) {
        assert.throws(() => analyse({...exportedBrew(), samples: [sample]}), /sample/);
    }
    const unordered = exportedBrew();
    unordered.samples.reverse();
    assert.throws(() => analyse(unordered), /sample.*order/);
    assert.throws(() => analyse(exportedBrew(), sessionLog, "2026-02-30"), /log-date/);
    assert.throws(() => analyse(exportedBrew(), sessionLog, "today"), /log-date/);
    assert.throws(() => analyse(exportedBrew(), ""), /empty/);
    assert.throws(() => analyseCapture(JSON.stringify(exportedBrew()), []), /log/);
});

test("invalid clock text is retained without false alignment", () => {
    const report = analyse(exportedBrew(), "25:70:00.000  ←  AA BB  event\nno timestamp");
    assert.ok(report.timeline.filter(row => row.kind === "log")
        .every(row => row.timing === "unparsed" && row.wallAt === null));
    assert.ok(report.warnings.some(line => /unparsed/.test(line)));
});

test("warns when recognised commands are outside the record or on an unknown clock", () => {
    const outside = analyse(exportedBrew(), sessionLog.replaceAll("08:00:", "07:00:"));
    assert.ok(outside.warnings.some(line => /outside.*record/.test(line)));
    const undated = analyseCapture(JSON.stringify(exportedBrew()), [{name: "undated", text: sessionLog}]);
    assert.ok(undated.warnings.some(line => /command.*unaligned/.test(line)));
});

test("CLI fails for missing files, missing options and unknown flags without network or writes", () => {
    for (const args of [
        [], ["--unknown"], ["--brew"], ["--log", "--brew", "missing.json"],
        ["--brew", "one", "--brew", "two", "--log", "missing.txt"],
        ["--brew", "missing.json", "--log", "missing.txt"]
    ]) {
        const result = spawnSync(process.execPath, [script.pathname, ...args], {encoding: "utf8"});
        assert.equal(result.status, 1);
        assert.match(result.stderr, /Usage|read|option/);
        assert.equal(result.stdout, "");
    }
});
