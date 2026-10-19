/**
 * The jest half of `npm run check-feed`. Skipped in an ordinary test run.
 *
 * It runs under jest because the feed parser is app code (TypeScript, `@/`
 * imports, React Native neighbours) and jest is what already knows how to
 * load it. `scripts/check-feed.mjs` fetches the feed, writes it to a file and
 * names that file in `CHECK_FEED_FILE`; this prints the report.
 */
import {readFileSync} from "node:fs";

import {checkRoasterFeed} from "@/library/roasterFeedCheck";

const file = process.env.CHECK_FEED_FILE;
const run = file === undefined || file === "" ? it.skip : it;

run("checks a roaster feed", () => {
    const report = checkRoasterFeed(readFileSync(file as string, "utf8"));
    process.stdout.write(`\n${report.lines.join("\n")}\n\n`);
    expect(report.ok).toBe(true);
});
