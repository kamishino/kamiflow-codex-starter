import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { mkdtemp } from "node:fs/promises";
import {
  DESKTOP_STATE_DEFAULTS,
  extractHashFromUrl,
  normalizeWindowBounds,
  readDesktopState,
  sanitizeDesktopState,
  sanitizeHashRoute,
  writeDesktopState
} from "../src/state-store.js";

function logPass(name) {
  console.log(`[desktop-test] PASS ${name}`);
}

async function runCase(name, fn) {
  try {
    await fn();
    logPass(name);
  } catch (err) {
    console.error(`[desktop-test] FAIL ${name}`);
    console.error(err instanceof Error ? err.stack || err.message : String(err));
    process.exitCode = 1;
  }
}

await runCase("sanitize hash route", async () => {
  assert.equal(sanitizeHashRoute("#/projects/default/plans/PLAN-1"), "#/projects/default/plans/PLAN-1");
  assert.equal(sanitizeHashRoute("bad route"), DESKTOP_STATE_DEFAULTS.DEFAULT_HASH);
  assert.equal(sanitizeHashRoute("#/bad route"), DESKTOP_STATE_DEFAULTS.DEFAULT_HASH);
});

await runCase("normalize window bounds", async () => {
  const next = normalizeWindowBounds({
    width: 1600,
    height: 920,
    x: 20.4,
    y: 32.2
  });
  assert.deepEqual(next, { width: 1600, height: 920, x: 20, y: 32 });

  const invalid = normalizeWindowBounds({ width: 100, height: 200 });
  assert.deepEqual(invalid, {});
});

await runCase("read and write sanitized desktop state", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "kfp-desktop-"));
  const filePath = path.join(tempDir, "state.json");
  const stored = await writeDesktopState(filePath, {
    lastHash: "invalid-hash",
    windowBounds: { width: 1280, height: 820, x: 10, y: 20 }
  });
  assert.equal(stored.lastHash, "#/");
  assert.deepEqual(stored.windowBounds, { width: 1280, height: 820, x: 10, y: 20 });

  const reloaded = await readDesktopState(filePath);
  assert.deepEqual(reloaded, stored);

  await fs.rm(tempDir, { recursive: true, force: true });
});

await runCase("extract hash from url", async () => {
  assert.equal(extractHashFromUrl("http://127.0.0.1:4310#/projects/default/plans/PLAN"), "#/projects/default/plans/PLAN");
  assert.equal(extractHashFromUrl("http://127.0.0.1:4310"), "#/");
});

await runCase("sanitize desktop state fallback", async () => {
  const next = sanitizeDesktopState(null);
  assert.deepEqual(next, {
    lastHash: "#/",
    windowBounds: {}
  });
});

if (!process.exitCode) {
  console.log("[desktop-test] all tests passed.");
}
