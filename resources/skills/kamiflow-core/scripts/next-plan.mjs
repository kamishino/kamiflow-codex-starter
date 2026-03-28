#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  NEXT_PLAN_FORMATS,
  buildNextPlanSuggestions,
  formatNextPlanSuggestions,
  readNextPlanCliInput
} from "./core/next-plan-core.mjs";
import { printJson } from "./lib-plan.mjs";

export {
  NEXT_PLAN_FORMATS,
  buildNextPlanSuggestions,
  formatNextPlanSuggestions
} from "./core/next-plan-core.mjs";

async function main() {
  const { projectDir, format } = await readNextPlanCliInput(process.argv.slice(2));

  if (!NEXT_PLAN_FORMATS.has(format)) {
    console.error(`Unsupported format: ${format}. Use text, markdown, or json.`);
    process.exit(1);
  }

  const result = await buildNextPlanSuggestions(projectDir);
  if (format === "json") {
    printJson(result);
    return;
  }

  console.log(formatNextPlanSuggestions(result, format));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
