import { FIXTURES, fixturePath, run } from "./utils.js";

for (const fixture of FIXTURES) {
  const cwd = fixturePath(fixture);
  console.log(`[dogfood] Smoke testing fixture: ${fixture}`);
  run("npx", ["--no-install", "kfc", "doctor"], cwd);
  run("npx", ["--no-install", "kfc", "run"], cwd);
}

console.log("[dogfood] Smoke tests passed.");
