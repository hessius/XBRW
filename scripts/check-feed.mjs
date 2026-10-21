// Check a roaster feed the way the app reads it.
//
//   npm run check-feed -- https://your-shop.example/collections/coffee?view=xbrw
//   npm run check-feed -- path/to/feed.json
//
// A URL is fetched with the app's own Accept header (a Shopify store answers
// differently without it), then the body is read by the app's parser under
// jest (scripts/check-feed.test.ts), which prints what the app would show.
import {spawnSync} from "node:child_process";
import {readFileSync} from "node:fs";
import {dirname, join, resolve} from "node:path";
import {fileURLToPath} from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = process.argv[2];
if (!source) {
  console.error("Usage: npm run check-feed -- <feed URL or file>");
  process.exit(2);
}

let file;
let body;
if (/^https?:\/\//i.test(source)) {
  if (!source.toLowerCase().startsWith("https://")) {
    console.error("The app only reads feeds over https.");
    process.exit(1);
  }
  let response;
  try {
    response = await fetch(source, {headers: {Accept: "application/json, text/plain, */*"}});
  } catch (error) {
    console.error(`Could not fetch ${source}: ${error.message}`);
    process.exit(1);
  }
  console.log(`HTTP ${response.status}, ${response.headers.get("content-type") ?? "no content type"}`);
  if (!response.ok) process.exit(1);
  body = await response.text();
} else {
  file = resolve(source);
  readFileSync(file); // Fails here, plainly, if the file is not there.
}

const jest = join(root, "node_modules", "jest", "bin", "jest.js");
const result = spawnSync(process.execPath,
  [jest, "--selectProjects", "ios", "--runTestsByPath", "scripts/check-feed.test.ts", "--silent"],
  {
    cwd: root,
    stdio: body === undefined ? "inherit" : ["pipe", "inherit", "inherit"],
    input: body,
    env: {...process.env, CHECK_FEED_FILE: file ?? "", CHECK_FEED_STDIN: body === undefined ? "" : "1"}
  });
process.exit(result.status ?? 1);
