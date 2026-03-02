import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "../..");
const SOURCE_REL = path.join("resources", "docs", "CLIENT_KICKOFF_PROMPT.md");
const TARGET_REL = "CLIENT_KICKOFF_PROMPT.md";
const SOURCE_PATH = path.join(ROOT_DIR, SOURCE_REL);
const TARGET_PATH = path.join(ROOT_DIR, TARGET_REL);
const VERIFY_ONLY = process.argv.includes("--verify");

function normalize(value) {
  return String(value).replace(/\r\n/g, "\n");
}

function buildGenerated(sourceContent) {
  const body = normalize(sourceContent).trimEnd();
  return [
    "<!-- GENERATED FILE. Do not edit directly. -->",
    `<!-- Source: ${SOURCE_REL.replace(/\\/g, "/")} -->`,
    "",
    body,
    ""
  ].join("\n");
}

try {
  const source = fs.readFileSync(SOURCE_PATH, "utf8");
  const expected = buildGenerated(source);
  const current = fs.existsSync(TARGET_PATH)
    ? fs.readFileSync(TARGET_PATH, "utf8")
    : "";

  if (VERIFY_ONLY) {
    if (!fs.existsSync(TARGET_PATH)) {
      console.error(`[client-kickoff-sync] Missing ${TARGET_REL}. Run: npm run docs:sync:client-kickoff`);
      process.exit(1);
    }

    if (normalize(current) !== normalize(expected)) {
      console.error(
        `[client-kickoff-sync] ${TARGET_REL} is out of sync with ${SOURCE_REL}. Run: npm run docs:sync:client-kickoff`
      );
      process.exit(1);
    }

    console.log("[client-kickoff-sync] OK");
    process.exit(0);
  }

  if (normalize(current) === normalize(expected)) {
    console.log("[client-kickoff-sync] No changes");
    process.exit(0);
  }

  fs.writeFileSync(TARGET_PATH, expected, "utf8");
  console.log(`[client-kickoff-sync] Updated ${TARGET_REL} from ${SOURCE_REL}`);
} catch (err) {
  console.error(`[client-kickoff-sync] ERROR: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}
