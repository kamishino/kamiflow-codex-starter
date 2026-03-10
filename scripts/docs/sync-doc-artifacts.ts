import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const VERIFY_ONLY = process.argv.includes("--verify");

const ARTIFACTS = [
  { label: "quickstart", fileName: "sync-quickstart.js" },
  { label: "client-kickoff", fileName: "sync-client-kickoff.js" },
  { label: "changelog", fileName: "sync-changelog.js" }
];

function runArtifact(scriptFileName: string) {
  const scriptPath = path.join(__dirname, scriptFileName);
  const args = [scriptPath, ...(VERIFY_ONLY ? ["--verify"] : [])];
  const result = spawnSync(process.execPath, args, {
    stdio: "inherit",
    encoding: "utf8"
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

try {
  for (const artifact of ARTIFACTS) {
    runArtifact(artifact.fileName);
  }
  console.log(`[docs-sync] ${VERIFY_ONLY ? "Verification" : "Sync"} OK`);
} catch (err) {
  console.error(`[docs-sync] ERROR: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}
