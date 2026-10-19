import {readFileSync} from "node:fs";
import {pathToFileURL} from "node:url";

const DAY_MS = 86400000;
const finite = value => typeof value === "number" && Number.isFinite(value);
const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
const wallClock = value => finite(value) && value > 0 && Number.isFinite(new Date(value).getTime());

function readExport(text) {
    let data;
    try {
        data = JSON.parse(text);
    } catch {
        throw new Error("Invalid brew JSON");
    }
    if (!object(data) || data.version !== 1 || !object(data.brew))
        throw new Error("Expected neutral brew export version 1 with a brew object");
    const brew = data.brew;
    if (!wallClock(brew.startedAt)) throw new Error("Invalid or absent brew.startedAt");
    if (!wallClock(brew.endedAt) || brew.endedAt < brew.startedAt)
        throw new Error("Invalid or absent brew.endedAt");
    if (brew.pouringAt !== undefined && brew.pouringAt !== 0
        && (!wallClock(brew.pouringAt) || brew.pouringAt < brew.startedAt || brew.pouringAt > brew.endedAt))
        throw new Error("Invalid brew.pouringAt");
    if (brew.plan !== undefined && (!Array.isArray(brew.plan) || !brew.plan.every(stage =>
        object(stage) && ["pourNumber", "volume", "temperature", "flowRate", "agitation", "pourPattern", "pauseTime"]
            .every(key => finite(stage[key]))
        && Number.isInteger(stage.pourNumber) && stage.pourNumber >= 1
        && stage.volume >= 0 && stage.pauseTime >= 0)))
        throw new Error("Invalid brew.plan stages");
    if (!Array.isArray(data.samples)) throw new Error("Expected samples array in neutral export");
    let previous = -1;
    for (const [index, sample] of data.samples.entries()) {
        if (!object(sample) || !["at", "water", "cup", "pour"].every(key => finite(sample[key]))
            || sample.at < 0 || !Number.isInteger(sample.pour) || sample.pour < 0)
            throw new Error(`Invalid sample at array index ${index}`);
        if (sample.at < previous) throw new Error(`Invalid sample time order at array index ${index}`);
        previous = sample.at;
    }
    return data;
}

function utcDate(logDate) {
    if (logDate === undefined) return null;
    const date = /^\d{4}-\d{2}-\d{2}$/.test(logDate) ? Date.parse(`${logDate}T00:00:00.000Z`) : NaN;
    if (!finite(date) || new Date(date).toISOString().slice(0, 10) !== logDate)
        throw new Error("Invalid --log-date; expected a real UTC date YYYY-MM-DD");
    return date;
}

function rawFrame(text) {
    const match = /^(→|←[a-zA-Z0-9-]*)\s+((?:[0-9a-fA-F]{2}(?: |$))+)(.*)$/.exec(text);
    if (!match) return {};
    const bytes = match[2].trim().split(/\s+/).map(value => Number.parseInt(value, 16));
    // Header extraction only: not CRC validation, acceptance, execution or a tea-phase decoder.
    const command = match[1] === "→" && bytes.length >= 12
        && bytes[0] === 0x58 && bytes[1] === 1 && bytes[2] === 1
        && (bytes[5] | bytes[6] << 8) === bytes.length
        ? bytes[3] | bytes[4] << 8 : null;
    return {arrow: match[1], hex: match[2].trim(), reading: match[3].trim(), rawCommand: command};
}

function logRows(log, date, warnings) {
    if (!object(log) || typeof log.name !== "string" || !log.name.trim()
        || typeof log.text !== "string" || !log.text.trim())
        throw new Error("Each log requires a name and non-empty text");
    let day = date;
    let previous = null;
    let clockUncertain = false;
    let unparsed = 0;
    const copiedSession = log.text.trimStart().startsWith("This session machine log\n")
        || log.text.trimStart().startsWith("This session machine log\r\n");
    let frameHistoryStarted = false;
    let undatedConnections = 0;
    const rows = log.text.split(/\r?\n/).map((raw, index) => {
        const row = {kind: "log", source: log.name, line: index + 1, raw, timing: "unparsed", wallAt: null};
        const match = /^(?:\[xbrw\] )?(\d{2}):(\d{2}):(\d{2})\.(\d{3})\s+(.*)$/.exec(raw);
        if (!match || +match[1] > 23 || +match[2] > 59 || +match[3] > 59) {
            if (raw.trim()) unparsed++;
            return row;
        }
        const frame = rawFrame(match[5]);
        const timeOfDay = `${match[1]}:${match[2]}:${match[3]}.${match[4]}`;
        // copyLog() concatenates two independent histories, not one time-sorted stream.
        if (copiedSession && !frameHistoryStarted && !frame.hex) {
            undatedConnections++;
            return {...row, timeOfDay, timing: "date-unknown"};
        }
        frameHistoryStarted = true;
        const time = +match[1] * 3600000 + +match[2] * 60000 + +match[3] * 1000 + +match[4];
        if (previous !== null && time < previous) {
            if (previous - time > DAY_MS / 2) {
                if (day !== null) day += DAY_MS;
                warnings.push(`${log.name}: midnight rollover assumed; time-only logs cannot reveal missing whole days.`);
            } else {
                clockUncertain = true;
                warnings.push(`${log.name}:${index + 1}: clock moved backwards; this and subsequent lines left unaligned.`);
            }
        }
        previous = time;
        return {
            ...row,
            ...frame,
            timeOfDay,
            timing: clockUncertain ? "clock-uncertain" : day === null ? "date-unknown" : "aligned",
            wallAt: day === null || clockUncertain ? null : day + time
        };
    });
    if (undatedConnections)
        warnings.push(`${log.name}: separate connection history retained undated; --log-date anchors the frame history, not connection timestamps.`);
    if (unparsed) warnings.push(`${log.name}: ${unparsed} non-empty lines have unparsed timing; raw lines retained.`);
    return rows;
}

function channel(rows, key) {
    return {min: Math.min(...rows.map(row => row[key])), max: Math.max(...rows.map(row => row[key])), last: rows.at(-1)[key]};
}

/** Pure, local analysis of explicit log text and the neutral toExportJson schema. */
export function analyseCapture(brewText, logs, {logDate} = {}) {
    const {brew, samples} = readExport(brewText);
    if (!Array.isArray(logs) || logs.length === 0) throw new Error("At least one explicit log is required");
    const date = utcDate(logDate);
    const warnings = [
        "Presence or absence of logged frames never proves complete coverage or command success.",
        "Retained logs are bounded and omit water/cup telemetry; stored logs end when the recorder writes, not necessarily when the machine stops.",
        "Sample pour indices are raw channels, not verified tea cycles. No phase boundaries, completion or root cause are inferred."
    ];
    if (date === null) warnings.push("No explicit UTC date (--log-date); time-only log lines cannot align to the brew.");
    const origin = brew.pouringAt > 0 ? brew.pouringAt : null;
    if (origin === null) warnings.push("Unknown sample origin: pouringAt absent or zero; sample offsets are not assumed relative to startedAt.");
    const offsets = wallAt => ({
        fromStartedAtMs: wallAt === null ? null : wallAt - brew.startedAt,
        fromPouringAtMs: wallAt === null || origin === null ? null : wallAt - origin
    });
    const frames = logs.flatMap(log => logRows(log, date, warnings));
    const commands = frames.filter(row => [4513, 8001, 8004, 4512, 8002].includes(row.rawCommand));
    const uploadCommands = commands.filter(row => [4513, 8001, 8004].includes(row.rawCommand)).length;
    const executeCommands = commands.filter(row => [4512, 8002].includes(row.rawCommand)).length;
    if (commands.some(row => row.wallAt === null))
        warnings.push("Recognised command lines are unaligned; counts refer to supplied logs, not an associated brew.");
    if (commands.some(row => row.wallAt !== null && (row.wallAt < brew.startedAt || row.wallAt > brew.endedAt)))
        warnings.push("Recognised commands outside this record interval are present; counts include other session activity.");
    const tail = frames.some(row => row.hex && row.wallAt !== null && row.wallAt > brew.endedAt);
    if (!uploadCommands) warnings.push("No recognised upload command available; upload coverage unknown.");
    if (!executeCommands) warnings.push("No recognised execute command available; execute coverage unknown.");
    if (!tail) warnings.push("No aligned frame tail beyond record endedAt available; later activity is unknown.");
    if (!samples.length) warnings.push("Sample array is empty; no observed sample span.");
    if (!Array.isArray(brew.plan) || !brew.plan.length) warnings.push("No plan stages available.");
    const indices = [...new Set(samples.map(sample => sample.pour))].sort((a, b) => a - b).map(index => {
        const rows = samples.filter(sample => sample.pour === index);
        return {
            index, count: rows.length, firstAtMs: rows[0].at, lastAtMs: rows.at(-1).at,
            water: channel(rows, "water"), cup: channel(rows, "cup")
        };
    });
    for (const stage of brew.plan ?? []) {
        if (!indices.some(row => row.index === stage.pourNumber))
            warnings.push(`Planned index ${stage.pourNumber} not observed in supplied samples; this is not proof it did not run.`);
    }
    if (origin !== null && samples.some(sample => origin + sample.at > brew.endedAt))
        warnings.push("Samples extend beyond record endedAt; clocks or input association need checking.");
    const timeline = [
        ...frames.map(row => ({...row, ...offsets(row.wallAt)})),
        ...samples.map((sample, sampleIndex) => {
            const wallAt = origin === null ? null : origin + sample.at;
            return {kind: "sample", sampleIndex, ...sample, wallAt, ...offsets(wallAt)};
        })
    ].sort((a, b) => a.wallAt === null ? (b.wallAt === null ? 0 : 1)
        : b.wallAt === null ? -1 : a.wallAt - b.wallAt);
    const first = samples[0];
    const last = samples.at(-1);
    return {
        clocks: {
            startedAt: brew.startedAt, pouringAt: origin, endedAt: brew.endedAt,
            logDate: logDate ?? null, sampleOrigin: origin === null ? "unknown" : "pouringAt"
        },
        plan: brew.plan ?? null,
        samples: {
            count: samples.length, last: last ?? null, indices,
            span: !first ? null : {
                firstAtMs: first.at, lastAtMs: last.at,
                firstFromStartedAtMs: origin === null ? null : origin + first.at - brew.startedAt,
                lastFromStartedAtMs: origin === null ? null : origin + last.at - brew.startedAt,
                firstFromPouringAtMs: origin === null ? null : first.at,
                lastFromPouringAtMs: origin === null ? null : last.at
            }
        },
        coverage: {uploadCommands, executeCommands, tailBeyondRecordEnd: date === null ? null : tail},
        warnings, timeline
    };
}

const USAGE = "Usage: node scripts/analyse-brew-capture.mjs --brew export.json --log session.txt [--log stored.txt] [--log-date YYYY-MM-DD]";

function main(args) {
    let brewPath;
    let logDate;
    const paths = [];
    for (let index = 0; index < args.length; index++) {
        const option = args[index];
        if (!["--brew", "--log", "--log-date"].includes(option))
            throw new Error(`Unknown option ${option}\n${USAGE}`);
        const value = args[++index];
        if (!value || value.startsWith("--")) throw new Error(`Missing value for ${option}\n${USAGE}`);
        if (option === "--log") paths.push(value);
        else if (option === "--brew" && brewPath === undefined) brewPath = value;
        else if (option === "--log-date" && logDate === undefined) logDate = value;
        else throw new Error(`Duplicate option ${option}`);
    }
    if (!brewPath || !paths.length) throw new Error(USAGE);
    const read = path => {
        try {
            return readFileSync(path, "utf8");
        } catch {
            throw new Error(`Cannot read input file: ${path}`);
        }
    };
    const report = analyseCapture(read(brewPath), paths.map(name => ({name, text: read(name)})), {logDate});
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    try {
        main(process.argv.slice(2));
    } catch (error) {
        process.stderr.write(`${error.message}\n`);
        process.exitCode = 1;
    }
}
