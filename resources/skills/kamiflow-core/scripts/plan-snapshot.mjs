#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseCliArgs,
  printJson,
  resolveProjectDir
} from "./lib-plan.mjs";
import {
  SNAPSHOT_FORMATS,
  buildPlanSnapshot,
  formatPlanSnapshot
} from "./core/plan-snapshot-core.mjs";

export {
  SNAPSHOT_FORMATS,
  buildPlanSnapshot,
  formatPlanSnapshot
} from "./core/plan-snapshot-core.mjs";

async function main() {
  const args = parseCliArgs(process.argv.slice(2));
  const projectDir = resolveProjectDir(String(args.project || "."));
  const format = String(args.format || "text").trim().toLowerCase();

  if (!SNAPSHOT_FORMATS.has(format)) {
    console.error(`Unsupported format: ${format}. Use text, markdown, or json.`);
    process.exit(1);
  }

  const snapshot = await buildPlanSnapshot(projectDir);
  if (format === "json") {
    printJson(snapshot);
    return;
  }

  console.log(formatPlanSnapshot(snapshot, format));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
