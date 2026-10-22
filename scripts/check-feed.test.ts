/**
 * The jest half of `npm run check-feed`. Skipped in an ordinary test run.
 *
 * It runs under jest because the feed parser is app code (TypeScript, `@/`
 * imports, React Native neighbours). The CLI supplies a local file path or
 * pipes a fetched body through stdin without leaving a downloaded file behind.
 */
import {readFileSync} from "node:fs";

import {checkRoasterFeed} from "@/library/roasterFeedCheck";

const file = process.env.CHECK_FEED_FILE;
const stdin = process.env.CHECK_FEED_STDIN === "1";
const run = !stdin && (file === undefined || file === "") ? it.skip : it;

run("checks a roaster feed", () => {
    const report = checkRoasterFeed(readFileSync(stdin ? 0 : file as string, "utf8"));
    process.stdout.write(`\n${report.lines.join("\n")}\n\n`);
    expect(report.ok).toBe(true);
});
