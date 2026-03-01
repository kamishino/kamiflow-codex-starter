import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runCli } from "../src/cli.js";
import { parsePlanFileContent } from "../src/parser/plan-parser.js";
import { validateParsedPlan } from "../src/schema/validate-plan.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let failed = 0;

async function runCase(name, fn) {
  try {
    await fn();
    console.log(`[test] PASS ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`[test] FAIL ${name}`);
    console.error(`  ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function withTempDir(fn) {
  const tempBase = await fs.mkdtemp(path.join(os.tmpdir(), "kfp-"));
  try {
    await fn(tempBase);
  } finally {
    await fs.rm(tempBase, { recursive: true, force: true });
  }
}

await runCase("parse and validate template plan", async () => {
  const templatePath = path.resolve(__dirname, "../templates/plan-template.md");
  const markdown = await fs.readFile(templatePath, "utf8");
  const parsed = parsePlanFileContent(markdown, templatePath);
  const errors = validateParsedPlan(parsed);
  assert.equal(parsed.frontmatter.plan_id, "PLAN-YYYY-MM-DD-001");
  assert.equal(errors.length, 0);
});

await runCase("init creates plan template", async () => {
  await withTempDir(async (tempDir) => {
    const exitCode = await runCli(["init", "--project", tempDir]);
    assert.equal(exitCode, 0);
    const plansDir = path.join(tempDir, ".local", "plans");
    const files = await fs.readdir(plansDir);
    assert.ok(files.some((name) => name.endsWith(".md")));
  });
});

await runCase("validate succeeds for generated template", async () => {
  await withTempDir(async (tempDir) => {
    const initExit = await runCli(["init", "--project", tempDir]);
    assert.equal(initExit, 0);
    const validateExit = await runCli(["validate", "--project", tempDir]);
    assert.equal(validateExit, 0);
  });
});

if (failed > 0) {
  process.exitCode = 1;
  console.error(`[test] ${failed} test(s) failed.`);
} else {
  console.log("[test] all tests passed.");
}
