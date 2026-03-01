import { FIXTURES, fixturePath, run } from "./utils.mjs";

for (const fixture of FIXTURES) {
  const cwd = fixturePath(fixture);
  console.log(`[dogfood] Smoke testing fixture: ${fixture}`);
  run("npx", ["--no-install", "kamiflow", "doctor"], cwd);
  run("npx", ["--no-install", "kamiflow", "run"], cwd);
}

console.log("[dogfood] Smoke tests passed.");
