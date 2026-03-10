import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
const packageDir = process.cwd();
const { runCli } = await import(pathToFileURL(path.join(packageDir, "dist/cli.js")).href);
const { parsePlanFileContent } = await import(
  pathToFileURL(path.join(packageDir, "dist/parser/plan-parser.js")).href
);
const { validateParsedPlan } = await import(
  pathToFileURL(path.join(packageDir, "dist/schema/validate-plan.js")).href
);
const { SSEStream } = await import(pathToFileURL(path.join(packageDir, "dist/server/sse-stream.js")).href);
const { detectProjectRoot } = await import(
  pathToFileURL(path.join(packageDir, "dist/lib/project-detect.js")).href
);
const {
  buildCodexExecArgVariants,
  buildCodexExecManualCommand,
  classifyCodexFailure,
  runCodexAction,
  shouldPreferPlanInteractiveMode
} = await import(pathToFileURL(path.join(packageDir, "dist/lib/codex-runner.js")).href);
const { buildPlanDiagramTabsModel, buildTechnicalSolutionDiagramModel } = await import(
  pathToFileURL(path.join(packageDir, "dist/lib/plan-diagram.js")).href
);
const { lintAndRepairMermaid } = await import(
  pathToFileURL(path.join(packageDir, "dist/lib/mermaid-safety.js")).href
);
const { readRunlogSignal } = await import(pathToFileURL(path.join(packageDir, "dist/lib/runlog.js")).href);
const {
  buildClientAgentsManagedBlock,
  createClientReadyArtifacts,
  evaluateClientSetupCompletion
} = await import(pathToFileURL(path.join(packageDir, "..", "..", "dist/commands/client.js")).href);
const { analyzeCommitMessageSemver } = await import(
  pathToFileURL(path.join(packageDir, "..", "..", "dist/scripts/release/semver-from-commits.js")).href
);

const __dirname = path.join(packageDir, "test");

let failed = 0;
const cliArgs = new Set(process.argv.slice(2));
const testMode = cliArgs.has("--full") ? "full" : cliArgs.has("--integration") ? "integration" : "fast";
const runIntegrationCases = testMode !== "fast";
const originalCodexExecutableOverride = process.env.KFC_PLAN_CODEX_EXECUTABLES;
const originalCodexTimeoutOverride = process.env.KFC_PLAN_CODEX_ACTION_TIMEOUT_MS;

if (testMode === "fast") {
  process.env.KFC_PLAN_CODEX_EXECUTABLES = "__kfc_plan_missing_codex__";
  process.env.KFC_PLAN_CODEX_ACTION_TIMEOUT_MS = "1500";
} else {
  delete process.env.KFC_PLAN_CODEX_EXECUTABLES;
  if (!process.env.KFC_PLAN_CODEX_ACTION_TIMEOUT_MS) {
    process.env.KFC_PLAN_CODEX_ACTION_TIMEOUT_MS = "15000";
  }
}

console.log(`[test] mode=${testMode}`);

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

async function runCaseIf(name, enabled, fn) {
  if (!enabled) {
    console.log(`[test] SKIP ${name}`);
    return;
  }
  await runCase(name, fn);
}

async function withTempDir(fn) {
  const tempBase = await fs.mkdtemp(path.join(os.tmpdir(), "kfc-plan-"));
  try {
    await fn(tempBase);
  } finally {
    await fs.rm(tempBase, { recursive: true, force: true });
  }
}

async function runNodeProcess(command, args, cwd) {
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({
        exitCode: code ?? -1,
        stdout,
        stderr
      });
    });
  });
}

async function withSuppressedConsoleError(fn) {
  const originalConsoleError = console.error;
  console.error = () => {};
  try {
    return await fn();
  } finally {
    console.error = originalConsoleError;
  }
}

function toLocalDateStamp(date = new Date()) {
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function buildClientPlan(planId = "PLAN-2026-03-10-001") {
  return `---
plan_id: ${planId}
request_id: REQ-2026-03-10-001
title: Test Client Plan
status: draft
decision: NO_GO
selected_mode: Plan
next_mode: Plan
next_command: plan
lifecycle_phase: plan
updated_at: 2026-03-10T00:00:00.000Z
archived_at:
---

## Start Summary
- Required: no
- Reason: Validate client onboarding behavior.

## Goal
- Exercise the client onboarding contract.

## Open Decisions
- [x] D1: Example decision resolved.
- Remaining Count: 0

## Implementation Tasks
- [ ] Update \`src/example.ts\` with the onboarding flow.

## Acceptance Criteria
- [ ] Contract behavior is reflected in generated artifacts.

## Validation Commands
- npm run test

## Go/No-Go Checklist
- [x] Goal is explicit

## WIP Log
- Status: Draft plan ready for onboarding.
- Blockers: None.
- Next step: Continue planning.
`;
}

await runCase("parse and validate template plan", async () => {
  const templatePath = path.resolve(__dirname, "../templates/plan-template.md");
  const markdown = await fs.readFile(templatePath, "utf8");
  const parsed = parsePlanFileContent(markdown, templatePath);
  const errors = validateParsedPlan(parsed);
  assert.equal(parsed.frontmatter.plan_id, "PLAN-YYYY-MM-DD-001");
  assert.equal(parsed.frontmatter.diagram_mode, "auto");
  assert.ok(parsed.sections["Technical Solution Diagram"]);
  assert.ok(parsed.sections["Technical Solution Diagram"].includes("```mermaid"));
  assert.equal(errors.length, 0);
});

await runCase("validate fails when Start Summary required fields are placeholder", async () => {
  const markdown = `---
plan_id: PLAN-2026-03-02-001
title: Invalid Start Summary
status: draft
decision: NO_GO
selected_mode: Plan
next_mode: Plan
next_command: plan
updated_at: 2026-03-02
---

## Start Summary
- Required: yes
- Reason: TBD
- Selected Idea: TBD
- Alternatives Considered: TBD
- Pre-mortem Risk: TBD
- Handoff Confidence: 1

## Goal
- Define the desired outcome.

## Scope (In/Out)
- In:
- Out:

## Constraints
- Technical:
- Time:
- Risk:

## Assumptions
- A1:
- A2:

## Open Decisions
- [ ] D1:
- Remaining Count: 1

## Implementation Tasks
- [ ] Task 1
- [ ] Task 2

## Acceptance Criteria
- [ ] Criterion 1
- [ ] Criterion 2

## Validation Commands
- command 1
- command 2

## Risks & Rollback
- Risk:
- Mitigation:
- Rollback:

## Go/No-Go Checklist
- [ ] Goal is explicit
- [ ] Scope in/out is explicit
- [ ] No unresolved high-impact decisions
- [ ] Feasibility is validated
- [ ] Acceptance criteria are testable
- [ ] Tasks are implementation-ready
- [ ] Risks and rollback are defined
- [ ] Validation commands are concrete
- [ ] Dependencies/access are ready
- [ ] First build step is explicit

## WIP Log
- Status:
- Blockers:
- Next step:
`;
  const parsed = parsePlanFileContent(markdown, "<memory>");
  const errors = validateParsedPlan(parsed);
  assert.ok(errors.some((item) => item.includes("Start Summary")));
  assert.equal(parsed.sections["Technical Solution Diagram"], undefined);
});

await runCase("parser does not backfill technical solution diagram section when missing", async () => {
  const markdown = `---
plan_id: PLAN-2026-03-05-001
title: Backfill Diagram
status: in_progress
decision: GO
selected_mode: Plan
next_mode: Build
next_command: build
updated_at: 2026-03-05
---

## Start Summary
- Required: no
- Reason: Clear request.
- Selected Idea: Backfill test
- Alternatives Considered: none
- Pre-mortem Risk: low
- Handoff Confidence: 5

## Goal
- Validate parser backfill.

## Scope (In/Out)
- In: parser
- Out: unrelated

## Constraints
- none

## Assumptions
- A1: data exists

## Open Decisions
- [x] D1: none
- Remaining Count: 0

## Implementation Tasks
- [ ] task one

## Acceptance Criteria
- [ ] criterion one

## Validation Commands
- npm test

## Risks & Rollback
- Risk: none
- Mitigation: none
- Rollback: none

## Go/No-Go Checklist
- [x] Goal is explicit
- [x] Scope in/out is explicit
- [x] No unresolved high-impact decisions
- [x] Tasks and validation commands are implementation-ready

## WIP Log
- Status: ready
- Blockers: none
- Next step: build
`;
  const parsed = parsePlanFileContent(markdown, "<memory>");
  assert.equal(parsed.sections["Technical Solution Diagram"], undefined);
});

await runCase("parser does not backfill technical solution diagram when diagram_mode is auto", async () => {
  const markdown = `---
plan_id: PLAN-2026-03-05-002
title: Auto Diagram Mode
status: in_progress
decision: GO
selected_mode: Plan
next_mode: Build
next_command: build
diagram_mode: auto
updated_at: 2026-03-05
---

## Start Summary
- Required: no
- Reason: Clear request.
- Selected Idea: Auto mode
- Alternatives Considered: none
- Pre-mortem Risk: low
- Handoff Confidence: 5

## Goal
- Keep diagram optional.

## Scope (In/Out)
- In: parser
- Out: unrelated

## Constraints
- none

## Assumptions
- A1: data exists

## Open Decisions
- [x] D1: none
- Remaining Count: 0

## Implementation Tasks
- [ ] task one

## Acceptance Criteria
- [ ] criterion one

## Validation Commands
- npm test

## Risks & Rollback
- Risk: none
- Mitigation: none
- Rollback: none

## Go/No-Go Checklist
- [x] Goal is explicit
- [x] Scope in/out is explicit
- [x] No unresolved high-impact decisions
- [x] Tasks and validation commands are implementation-ready

## WIP Log
- Status: ready
- Blockers: none
- Next step: build
`;
  const parsed = parsePlanFileContent(markdown, "<memory>");
  assert.equal(parsed.sections["Technical Solution Diagram"], undefined);
  const errors = validateParsedPlan(parsed);
  assert.equal(errors.length, 0, errors.join("\n"));
});

await runCase("validate fails on invalid diagram_mode value", async () => {
  const markdown = `---
plan_id: PLAN-2026-03-05-003
title: Invalid Diagram Mode
status: in_progress
decision: GO
selected_mode: Plan
next_mode: Build
next_command: build
diagram_mode: maybe
updated_at: 2026-03-05
---

## Start Summary
- Required: no
- Reason: Clear request.
- Selected Idea: Invalid mode test
- Alternatives Considered: none
- Pre-mortem Risk: low
- Handoff Confidence: 5

## Goal
- Validate mode policy.

## Scope (In/Out)
- In: validator
- Out: unrelated

## Constraints
- none

## Assumptions
- A1: data exists

## Open Decisions
- [x] D1: none
- Remaining Count: 0

## Implementation Tasks
- [ ] task one

## Acceptance Criteria
- [ ] criterion one

## Validation Commands
- npm test

## Risks & Rollback
- Risk: none
- Mitigation: none
- Rollback: none

## Go/No-Go Checklist
- [x] Goal is explicit
- [x] Scope in/out is explicit
- [x] No unresolved high-impact decisions
- [x] Tasks and validation commands are implementation-ready

## WIP Log
- Status: ready
- Blockers: none
- Next step: build
`;
  const parsed = parsePlanFileContent(markdown, "<memory>");
  const errors = validateParsedPlan(parsed);
  assert.ok(errors.some((item) => item.includes("diagram_mode")));
});

await runCase("init creates plan template", async () => {
  await withTempDir(async (tempDir) => {
    const exitCode = await runCli(["init", "--project", tempDir]);
    assert.equal(exitCode, 0);
    const plansDir = path.join(tempDir, ".local", "plans");
    const files = await fs.readdir(plansDir);
    assert.ok(files.some((name) => name.endsWith(".md")));
    const createdFile = files.find((name) => name.endsWith(".md"));
    const markdown = await fs.readFile(path.join(plansDir, createdFile), "utf8");
    const parsed = parsePlanFileContent(markdown, createdFile);
    assert.ok(/^PLAN-\d{4}-\d{2}-\d{2}-\d{3}$/.test(parsed.frontmatter.plan_id), parsed.frontmatter.plan_id);
    assert.notEqual(parsed.frontmatter.plan_id, "PLAN-YYYY-MM-DD-001");
  });
});

await runCase("init --new creates unique incremented plan files", async () => {
  await withTempDir(async (tempDir) => {
    const first = await runCli(["init", "--project", tempDir, "--new"]);
    assert.equal(first, 0);
    const second = await runCli(["init", "--project", tempDir, "--new"]);
    assert.equal(second, 0);

    const plansDir = path.join(tempDir, ".local", "plans");
    const files = (await fs.readdir(plansDir)).filter((name) => name.endsWith(".md")).sort();
    assert.equal(files.length, 2);
    assert.ok(/-\d{3}-plan(?:-[a-z0-9-]+)?\.md$/i.test(files[0]));
    assert.ok(/-\d{3}-plan(?:-[a-z0-9-]+)?\.md$/i.test(files[1]));
    assert.notEqual(files[0], files[1]);
  });
});

await runCase("kfc-plan init rejects --project when value is another flag", async () => {
  const exitCode = await withSuppressedConsoleError(() => runCli(["init", "--project", "--new"]));
  assert.equal(exitCode, 1);
});

await runCase("kfc plan init rejects --project when value is another flag", async () => {
  await withTempDir(async (tempDir) => {
    const rootBin = path.resolve(__dirname, "../../../bin/kamiflow.js");
    let result;
    try {
      result = await runNodeProcess(process.execPath, [rootBin, "plan", "init", "--project", "--new"], tempDir);
    } catch (err) {
      if (err && typeof err === "object" && err.code === "EPERM") {
        console.log("[test] SKIP kfc plan init invalid-flag test: subprocess spawn is blocked (EPERM).");
        return;
      }
      throw err;
    }
    assert.equal(result.exitCode, 1, `stdout: ${result.stdout}\nstderr: ${result.stderr}`);

    const accidentalDir = path.join(tempDir, "--new");
    let exists = true;
    try {
      await fs.access(accidentalDir);
    } catch {
      exists = false;
    }
    assert.equal(exists, false, "should not create accidental --new directory");
  });
});

await runCase("init supports topic/route slug in filename", async () => {
  await withTempDir(async (tempDir) => {
    const exitCode = await runCli([
      "init",
      "--project",
      tempDir,
      "--new",
      "--route",
      "build",
      "--topic",
      "Improve Kami Flow Core"
    ]);
    assert.equal(exitCode, 0);
    const plansDir = path.join(tempDir, ".local", "plans");
    const files = (await fs.readdir(plansDir)).filter((name) => name.endsWith(".md"));
    assert.equal(files.length, 1);
    assert.ok(/-\d{3}-build-improve-kami-flow-core\.md$/i.test(files[0]));
    const markdown = await fs.readFile(path.join(plansDir, files[0]), "utf8");
    const parsed = parsePlanFileContent(markdown, files[0]);
    assert.equal(parsed.frontmatter.title, "Improve Kami Flow Core");
    assert.ok(/^PLAN-\d{4}-\d{2}-\d{2}-\d{3}$/.test(parsed.frontmatter.plan_id), parsed.frontmatter.plan_id);
  });
});

await runCase("init --new uses next available daily sequence across slugs", async () => {
  await withTempDir(async (tempDir) => {
    const plansDir = path.join(tempDir, ".local", "plans");
    await fs.mkdir(plansDir, { recursive: true });
    const dateStamp = toLocalDateStamp();
    const existingPlan = `${dateStamp}-001-plan-existing.md`;
    await fs.writeFile(path.join(plansDir, existingPlan), "# existing", "utf8");

    const exitCode = await runCli([
      "init",
      "--project",
      tempDir,
      "--new",
      "--route",
      "build",
      "--topic",
      "Global Seq"
    ]);
    assert.equal(exitCode, 0);

    const files = (await fs.readdir(plansDir)).filter((name) => name.endsWith(".md")).sort();
    assert.equal(files.length, 2);
    const createdFile = files.find((name) => /-002-build-global-seq\.md$/i.test(name));
    assert.ok(createdFile, files.join(", "));

    const markdown = await fs.readFile(path.join(plansDir, createdFile), "utf8");
    const parsed = parsePlanFileContent(markdown, createdFile);
    assert.equal(parsed.frontmatter.plan_id, `PLAN-${dateStamp}-002`);
  });
});

await runCase("init --new uses monotonic sequence across active and done folders", async () => {
  await withTempDir(async (tempDir) => {
    const plansDir = path.join(tempDir, ".local", "plans");
    const doneDir = path.join(plansDir, "done");
    await fs.mkdir(doneDir, { recursive: true });
    const dateStamp = toLocalDateStamp();

    await fs.writeFile(path.join(plansDir, `${dateStamp}-001-plan-active.md`), "# active", "utf8");
    await fs.writeFile(path.join(doneDir, `${dateStamp}-004-plan-archived.md`), "# done", "utf8");

    const exitCode = await runCli([
      "init",
      "--project",
      tempDir,
      "--new",
      "--route",
      "build",
      "--topic",
      "Monotonic Seq"
    ]);
    assert.equal(exitCode, 0);

    const files = (await fs.readdir(plansDir)).filter((name) => name.endsWith(".md")).sort();
    const createdFile = files.find((name) => /-005-build-monotonic-seq\.md$/i.test(name));
    assert.ok(createdFile, files.join(", "));

    const markdown = await fs.readFile(path.join(plansDir, createdFile), "utf8");
    const parsed = parsePlanFileContent(markdown, createdFile);
    assert.equal(parsed.frontmatter.plan_id, `PLAN-${dateStamp}-005`);
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

await runCase("detectProjectRoot prefers git root then package then cwd", async () => {
  await withTempDir(async (tempDir) => {
    const gitRoot = path.join(tempDir, "git-root");
    const gitNested = path.join(gitRoot, "a", "b");
    await fs.mkdir(path.join(gitRoot, ".git"), { recursive: true });
    await fs.mkdir(gitNested, { recursive: true });
    const detectedGit = await detectProjectRoot(gitNested);
    assert.equal(detectedGit, gitRoot);

    const pkgRoot = path.join(tempDir, "pkg-root");
    const pkgNested = path.join(pkgRoot, "x", "y");
    await fs.mkdir(pkgNested, { recursive: true });
    await fs.writeFile(path.join(pkgRoot, "package.json"), "{}", "utf8");
    const detectedPkg = await detectProjectRoot(pkgNested);
    assert.equal(detectedPkg, pkgRoot);

    const plainRoot = path.join(tempDir, "plain");
    const plainNested = path.join(plainRoot, "m", "n");
    await fs.mkdir(plainNested, { recursive: true });
    const detectedPlain = await detectProjectRoot(plainNested);
    assert.equal(detectedPlain, plainNested);
  });
});

await runCase("project skill sync writes kamiflow-core runtime artifact", async () => {
  const repoRoot = path.resolve(__dirname, "../../..");
  const syncModule = await import(pathToFileURL(path.join(repoRoot, "dist/lib/skill-sync.js")).href);

  await withTempDir(async (tempDir) => {
    const targetDir = path.join(tempDir, ".agents", "skills");
    const result = await syncModule.syncSkillsArtifacts({
      sourceDir: syncModule.getSkillsSourceDir(repoRoot),
      targetDir,
      includeSkills: ["kamiflow-core"],
      force: true
    });

    assert.ok(result.synced_skills.includes("kamiflow-core"));
    const skillPath = syncModule.resolveSkillArtifactPath(targetDir, "kamiflow-core");
    const content = await fs.readFile(skillPath, "utf8");
    assert.match(content, /name:\s*kamiflow-core/);
  });
});

await runCase("global KFC Plan contrast policy check passes", async () => {
  const policyPath = path.resolve(__dirname, "../../../dist/scripts/policy/verify-kfc-plan-contrast.js");
  const policyModule = await import(pathToFileURL(policyPath).href);
  const result = await policyModule.verifyKfpContrast();
  assert.equal(result.failures.length, 0, result.failures.join("\n"));
});

await runCase("KFC Plan spacing grid policy check passes", async () => {
  const policyPath = path.resolve(__dirname, "../../../dist/scripts/policy/verify-kfc-plan-spacing-grid.js");
  const policyModule = await import(pathToFileURL(policyPath).href);
  const result = await policyModule.verifyKfpSpacingGrid();
  assert.equal(result.violations.length, 0, result.violations.join("\n"));
});

await runCase("codex runner does not throw on spawn failures", async () => {
  const result = await runCodexAction({
    plan_id: "PLAN-TEST-001",
    action_type: "plan",
    prompt: "invalid\u0000prompt"
  });
  assert.equal(typeof result.status, "string");
  assert.equal(typeof result.run_id, "string");
  assert.ok(result.status === "failed" || result.status === "completed");
  if (testMode === "fast") {
    assert.equal(result.status, "failed");
    assert.ok(result.error_code === "CODEX_NOT_FOUND" || result.error_code === "SPAWN_FAILED");
  }
  if (result.status === "failed") {
    assert.ok(result.error_code === "SPAWN_FAILED" || result.error_code === "CODEX_NOT_FOUND");
    assert.ok(
      result.error_class === "environment" ||
        result.error_class === "configuration" ||
        result.error_class === "timeout" ||
        result.error_class === "runtime" ||
        result.error_class === "unknown"
    );
    assert.equal(typeof result.recovery_hint, "string");
    assert.equal(typeof result.failure_signature, "string");
  } else {
    assert.equal(typeof result.exit_code, "number");
  }
});

await runCaseIf("codex runner integration path remains available", runIntegrationCases, async () => {
  const previousExecutables = process.env.KFC_PLAN_CODEX_EXECUTABLES;
  const previousTimeout = process.env.KFC_PLAN_CODEX_ACTION_TIMEOUT_MS;
  try {
    delete process.env.KFC_PLAN_CODEX_EXECUTABLES;
    process.env.KFC_PLAN_CODEX_ACTION_TIMEOUT_MS = "15000";
    const result = await runCodexAction({
      plan_id: "PLAN-TEST-001-INTEGRATION",
      action_type: "plan",
      prompt: "Integration smoke test."
    });
    assert.equal(typeof result.status, "string");
    assert.equal(typeof result.run_id, "string");
    assert.ok(result.status === "failed" || result.status === "completed");
    if (result.status === "failed") {
      assert.ok(
        result.error_code === "CODEX_NOT_FOUND" ||
          result.error_code === "SPAWN_FAILED" ||
          result.error_code === "TIMEOUT" ||
          result.error_code === "NON_ZERO_EXIT"
      );
    }
  } finally {
    if (previousExecutables === undefined) {
      delete process.env.KFC_PLAN_CODEX_EXECUTABLES;
    } else {
      process.env.KFC_PLAN_CODEX_EXECUTABLES = previousExecutables;
    }
    if (previousTimeout === undefined) {
      delete process.env.KFC_PLAN_CODEX_ACTION_TIMEOUT_MS;
    } else {
      process.env.KFC_PLAN_CODEX_ACTION_TIMEOUT_MS = previousTimeout;
    }
  }
});

await runCase("codex runner classifies failure classes deterministically", async () => {
  assert.equal(classifyCodexFailure({ error_code: "CODEX_NOT_FOUND", stderr_tail: "" }), "environment");
  assert.equal(classifyCodexFailure({ error_code: "TIMEOUT", stderr_tail: "" }), "timeout");
  assert.equal(
    classifyCodexFailure({
      error_code: "NON_ZERO_EXIT",
      stderr_tail: "error: unexpected argument '--profile' found"
    }),
    "configuration"
  );
  assert.equal(
    classifyCodexFailure({
      error_code: "NON_ZERO_EXIT",
      stderr_tail: "runtime failure while executing action"
    }),
    "runtime"
  );
});

await runCase("codex runner enables plan-interactive variants for Plan mode", async () => {
  const variants = buildCodexExecArgVariants({
    plan_id: "PLAN-TEST-002",
    action_type: "plan",
    mode_hint: "Plan"
  });
  assert.ok(variants.length >= 2);
  assert.deepEqual(variants.at(-1), ["exec", "-"]);
  assert.ok(variants[0].includes("--profile") || variants[0].includes("-c"));
  assert.equal(shouldPreferPlanInteractiveMode({ mode_hint: "Plan" }), true);
});

await runCase("codex runner enables plan-interactive variants when prompt references request_user_input", async () => {
  const variants = buildCodexExecArgVariants({
    plan_id: "PLAN-TEST-003",
    action_type: "build",
    mode_hint: "Build",
    prompt: "Please call request_user_input for clarification before build."
  });
  assert.ok(variants.length >= 2);
  assert.deepEqual(variants.at(-1), ["exec", "-"]);
  assert.equal(
    shouldPreferPlanInteractiveMode({
      mode_hint: "Build",
      prompt: "Use request_user_input when you need clarification."
    }),
    true
  );
});

await runCase("codex runner keeps default args when no plan-interactive hint is present", async () => {
  const variants = buildCodexExecArgVariants({
    plan_id: "PLAN-TEST-004",
    action_type: "build",
    mode_hint: "Build",
    prompt: "Implement task 1 and run acceptance checks."
  });
  assert.deepEqual(variants, [["exec", "-"]]);
  assert.equal(
    shouldPreferPlanInteractiveMode({
      mode_hint: "Build",
      prompt: "Implement task 2."
    }),
    false
  );
});

await runCase("codex runner supports full-auto execution variants and manual fallback command", async () => {
  const variants = buildCodexExecArgVariants({
    plan_id: "PLAN-TEST-005",
    action_type: "start",
    prompt: "Read AGENTS.md first, then read .kfc/CODEX_READY.md and execute the mission.",
    full_auto: true
  });
  assert.deepEqual(variants, [["exec", "--full-auto", "-"]]);
  assert.equal(
    buildCodexExecManualCommand({
      prompt: "Read AGENTS.md first, then read .kfc/CODEX_READY.md and execute the mission.",
      full_auto: true
    }),
    'codex exec --full-auto "Read AGENTS.md first, then read .kfc/CODEX_READY.md and execute the mission."'
  );
});

await runCase("codex runner preserves full-auto mode in failure command metadata", async () => {
  const previousExecutables = process.env.KFC_PLAN_CODEX_EXECUTABLES;
  try {
    process.env.KFC_PLAN_CODEX_EXECUTABLES = "__kfc_plan_missing_codex__";
    const result = await runCodexAction({
      plan_id: "PLAN-TEST-006",
      action_type: "start",
      prompt: "Read AGENTS.md first, then read .kfc/CODEX_READY.md and execute the mission.",
      full_auto: true
    });
    assert.equal(result.status, "failed");
    assert.ok(result.command.includes("--full-auto"));
  } finally {
    if (previousExecutables === undefined) {
      delete process.env.KFC_PLAN_CODEX_EXECUTABLES;
    } else {
      process.env.KFC_PLAN_CODEX_EXECUTABLES = previousExecutables;
    }
  }
});

await runCase("runlog parser extracts runtime signal from latest jsonl entry", async () => {
  await withTempDir(async (tempDir) => {
    const runsDir = path.join(tempDir, ".local", "runs");
    await fs.mkdir(runsDir, { recursive: true });
    const filePath = path.join(runsDir, "PLAN-2026-03-05-123.jsonl");
    await fs.writeFile(
      filePath,
      [
        JSON.stringify({
          status: "started",
          action_type: "build",
          run_id: "run_old",
          plan_id: "PLAN-2026-03-05-123",
          stdout_tail: "build started"
        }),
        JSON.stringify({
          status: "failed",
          action_type: "build",
          run_id: "run_new",
          plan_id: "PLAN-2026-03-05-123",
          stderr_tail: "build failed at test stage"
        })
      ].join("\n"),
      "utf8"
    );

    const signal = await readRunlogSignal(filePath);
    assert.ok(signal);
    assert.equal(signal.plan_id, "PLAN-2026-03-05-123");
    assert.equal(signal.event_type, "runlog_failed");
    assert.equal(signal.run_state, "FAIL");
    assert.equal(signal.run_id, "run_new");
    assert.equal(signal.action_type, "build");
    assert.ok(String(signal.detail).includes("failed"));
  });
});

await runCase("runlog parser includes onboarding metadata when present", async () => {
  await withTempDir(async (tempDir) => {
    const runsDir = path.join(tempDir, ".local", "runs");
    await fs.mkdir(runsDir, { recursive: true });
    const filePath = path.join(runsDir, "PLAN-2026-03-05-124.jsonl");
    await fs.writeFile(
      filePath,
      JSON.stringify({
        event_type: "runlog_updated",
        status: "PASS",
        action_type: "onboarding",
        plan_id: "PLAN-2026-03-05-124",
        phase: "Plan",
        message: "PASS ONBOARDING ready_brief",
        detail: "Client onboarding handoff artifacts are ready.",
        onboarding_status: "PASS",
        onboarding_stage: "ready_brief",
        onboarding_error_code: "CLIENT_ONBOARDING_PASS",
        onboarding_recovery: "None",
        onboarding_next: "Read AGENTS.md first, then read .kfc/CODEX_READY.md and execute the mission."
      }) + "\n",
      "utf8"
    );

    const signal = await readRunlogSignal(filePath);
    assert.ok(signal);
    assert.equal(signal.plan_id, "PLAN-2026-03-05-124");
    assert.equal(signal.action_type, "onboarding");
    assert.equal(signal.phase, "Plan");
    assert.equal(signal.onboarding_status, "PASS");
    assert.equal(signal.onboarding_stage, "ready_brief");
    assert.equal(signal.onboarding_error_code, "CLIENT_ONBOARDING_PASS");
    assert.equal(signal.onboarding_recovery, "None");
    assert.equal(signal.onboarding_next, "Read AGENTS.md first, then read .kfc/CODEX_READY.md and execute the mission.");
  });
});

await runCase("client AGENTS contract stays evergreen when CODEX_READY is absent", async () => {
  const managed = buildClientAgentsManagedBlock();
  assert.ok(managed.includes("If `.kfc/CODEX_READY.md` exists"));
  assert.ok(managed.includes("If `.kfc/CODEX_READY.md` is absent"));
  assert.ok(managed.includes("manual cleanup fallback"));
});

await runCase("client ready artifacts reuse existing mission instead of blocking", async () => {
  await withTempDir(async (tempDir) => {
    const plansDir = path.join(tempDir, ".local", "plans");
    await fs.mkdir(plansDir, { recursive: true });
    await fs.writeFile(path.join(plansDir, "2026-03-10-001-plan.md"), buildClientPlan(), "utf8");
    await fs.mkdir(path.join(tempDir, ".kfc"), { recursive: true });
    await fs.writeFile(
      path.join(tempDir, ".kfc", "CODEX_READY.md"),
      "# CODEX READY\n\n## Mission\n- Preserve this mission\n",
      "utf8"
    );

    const ready = await createClientReadyArtifacts({
      projectDir: tempDir,
      force: false,
      goal: "",
      profileName: "client",
      inspection: {
        inspectionStatus: "PASS",
        repoShape: "ready",
        applyMode: "auto",
        reason: "Existing repo ready.",
        recovery: "None",
        next: "Continue automatically.",
        plannedChanges: ["reuse existing managed onboarding artifacts"],
        plannedChangesSummary: "reuse existing managed onboarding artifacts",
        onboardingPath: "verify_existing_repo"
      }
    });

    assert.equal(ready.reusedExisting, true);
    const nextReady = await fs.readFile(path.join(tempDir, ".kfc", "CODEX_READY.md"), "utf8");
    assert.ok(nextReady.includes("- Preserve this mission"));
  });
});

await runCase("client setup completion detects archived done plan", async () => {
  await withTempDir(async (tempDir) => {
    const doneDir = path.join(tempDir, ".local", "plans", "done");
    await fs.mkdir(doneDir, { recursive: true });
    await fs.writeFile(
      path.join(doneDir, "2026-03-10-001-plan.md"),
      `---
plan_id: PLAN-2026-03-10-001
status: done
decision: PASS
updated_at: 2026-03-10T00:00:00.000Z
archived_at: 2026-03-10T00:05:00.000Z
---
`,
      "utf8"
    );

    const completion = await evaluateClientSetupCompletion(tempDir, "PLAN-2026-03-10-001");
    assert.equal(completion.complete, true);
    assert.ok(String(completion.reason).includes("archived successfully"));
  });
});

await runCase("single commit semver analyzer distinguishes none patch minor and major", async () => {
  assert.equal(
    analyzeCommitMessageSemver("docs(readme): clarify usage", "0.1.0").bump,
    "none"
  );
  assert.equal(
    analyzeCommitMessageSemver("fix(client): handle rerun", "0.1.0").bump,
    "patch"
  );
  assert.equal(
    analyzeCommitMessageSemver("feat(client): add handoff reuse", "0.1.0").bump,
    "minor"
  );
  const major = analyzeCommitMessageSemver("feat(client)!: replace bootstrap flow", "0.1.0");
  assert.equal(major.bump, "major");
  assert.equal(major.suggestedNextVersion, "1.0.0");
});

await runCase("technical solution diagram model reads mermaid from solution section", async () => {
  const input = {
    summary: {
      plan_id: "PLAN-TEST-DIAGRAM-001"
    },
    sections: {
      "Implementation Tasks": "- [x] T1 Prepare API\n- [ ] T2 Render UI",
      "Technical Solution Diagram": "```mermaid\nflowchart TD\nIDEA --> API --> UI\n```"
    }
  };
  const first = buildTechnicalSolutionDiagramModel(input);
  const second = buildTechnicalSolutionDiagramModel(input);
  assert.equal(first.source_type, "section");
  assert.equal(first.section_name, "Technical Solution Diagram");
  assert.equal(first.mermaid_source, second.mermaid_source);
  assert.ok(first.mermaid_source.includes("IDEA --> API --> UI"));
  assert.ok(first.mermaid_render.includes("flowchart LR"));
  assert.ok(first.warnings.some((item) => item.includes("landscape")));
});

await runCase("mermaid safety lints and repairs unsafe pipe in node labels", async () => {
  const source = "flowchart LR\nA{resources/skills|rules changed?} --> B[Apply]";
  const result = lintAndRepairMermaid(source);
  assert.equal(result.valid, false);
  assert.equal(result.issues.length, 1);
  assert.equal(result.issues[0].code, "unsafe_label_pipe");
  assert.ok(result.repaired_source.includes("resources/skills / rules changed?"));
});

await runCase("validate fails when required technical diagram contains unsafe pipe label", async () => {
  const markdown = `---
plan_id: PLAN-2026-03-06-777
title: Mermaid safety validation
status: in_progress
decision: GO
selected_mode: Build
next_mode: Plan
next_command: check
updated_at: 2026-03-06T13:00:00+07:00
diagram_mode: required
---

## Start Summary
- Required: no
- Reason: clear request
- Selected Idea: enforce mermaid safety
- Alternatives Considered: none
- Pre-mortem Risk: false positive
- Handoff Confidence: 5

## Goal
- Validate Mermaid safety for technical diagrams.

## Scope (In/Out)
- In: required technical diagrams
- Out: non-required diagrams

## Constraints
- Technical: none
- Time: now
- Risk: low

## Assumptions
- A1: enforce label safety

## Technical Solution Diagram
\`\`\`mermaid
flowchart LR
F --> H{resources/skills|rules changed?}
\`\`\`

## Implementation Tasks
- [ ] Add Mermaid safety checks.

## Acceptance Criteria
- [ ] Validation reports unsafe node labels.

## Validation Commands
- npm --prefix packages/kfc-plan-web test

## Go/No-Go Checklist
- [ ] No blocking issues remain.

## WIP Log
- 2026-03-06T13:00:00+07:00 - Status: validate.
- 2026-03-06T13:00:00+07:00 - Blockers: none.
- 2026-03-06T13:00:00+07:00 - Next step: fix syntax.
`;

  const parsed = parsePlanFileContent(markdown, "/tmp/plan.md");
  const errors = validateParsedPlan(parsed);
  assert.ok(errors.some((item) => item.includes("Mermaid safety violation")));
});

await runCase("technical solution diagram model derives placeholder when section is missing", async () => {
  const model = buildTechnicalSolutionDiagramModel({
    summary: { plan_id: "PLAN-TEST-DIAGRAM-002" },
    sections: {
      "Implementation Tasks": "- [ ] Task One\n- [x] Task Two"
    }
  });
  assert.equal(model.source_type, "derived");
  assert.ok(model.mermaid_render.includes("derived_solution_placeholder=true"));
  assert.ok(model.mermaid_source.includes("Start Implementation") || model.mermaid_source.includes("Selected Solution"));
  assert.ok(model.warnings.length >= 1);
});

await runCase("diagram tabs hide technical when diagram_mode is hidden", async () => {
  const model = buildPlanDiagramTabsModel({
    summary: { plan_id: "PLAN-TEST-DIAGRAM-003", diagram_mode: "hidden" },
    sections: {
      "Implementation Tasks": "- [ ] Task One\n- [x] Task Two"
    }
  });
  assert.equal(model.tabs.some((tab) => tab.key === "technical"), false);
  assert.equal(model.default_tab, "tasks");
});

await runCase("diagram tabs default to tasks for auto mode without technical section", async () => {
  const model = buildPlanDiagramTabsModel({
    summary: { plan_id: "PLAN-TEST-DIAGRAM-004", diagram_mode: "auto" },
    sections: {
      "Implementation Tasks": "- [ ] Task One\n- [x] Task Two"
    }
  });
  assert.equal(model.tabs.some((tab) => tab.key === "technical"), false);
  assert.equal(model.default_tab, "tasks");
});

await runCase("diagram tabs default to tasks when required mode has no technical section", async () => {
  const model = buildPlanDiagramTabsModel({
    summary: { plan_id: "PLAN-TEST-DIAGRAM-004B", diagram_mode: "required" },
    sections: {
      "Implementation Tasks": "- [ ] Task One\n- [x] Task Two"
    }
  });
  assert.equal(model.tabs.some((tab) => tab.key === "technical"), false);
  assert.equal(model.default_tab, "tasks");
});

await runCase("diagram tabs default to tasks when technical diagram is invalid", async () => {
  const model = buildPlanDiagramTabsModel({
    summary: { plan_id: "PLAN-TEST-DIAGRAM-004C", diagram_mode: "required" },
    sections: {
      "Implementation Tasks": "- [ ] Task One\n- [x] Task Two",
      "Technical Solution Diagram": "```mermaid\nflowchart LR\nA --> B\n"
    }
  });
  assert.equal(model.tabs.some((tab) => tab.key === "technical"), true);
  assert.equal(model.default_tab, "tasks");
});

await runCase("diagram tabs keep technical visible for required mode", async () => {
  const model = buildPlanDiagramTabsModel({
    summary: { plan_id: "PLAN-TEST-DIAGRAM-005", diagram_mode: "required" },
    sections: {
      "Implementation Tasks": "- [ ] Task One",
      "Technical Solution Diagram": "```mermaid\nflowchart LR\nA --> B\n```"
    }
  });
  assert.equal(model.tabs.some((tab) => tab.key === "technical"), true);
  assert.equal(model.default_tab, "technical");
});

await runCase("api returns plan list (when server deps are installed)", async () => {
  let createServer;
  try {
    ({ createServer } = await import("../dist/server/create-server.js"));
  } catch (err) {
    if (err && typeof err === "object" && (err.code === "ERR_MODULE_NOT_FOUND" || err.code === "MODULE_NOT_FOUND")) {
      console.log("[test] SKIP server test: install package dependencies first.");
      return;
    }
    throw err;
  }

  await withTempDir(async (tempDir) => {
    const initExit = await runCli(["init", "--project", tempDir]);
    assert.equal(initExit, 0);

    const server = await createServer({
      projectDir: tempDir,
      withWatcher: false,
      uiMode: "operator",
      runCodexAction: async () => ({
        status: "completed",
        command: "codex exec \"test\"",
        stdout_tail: "ok",
        stderr_tail: "",
        exit_code: 0,
        run_id: "run_test"
      })
    });
    await server.ready();
    const health = await server.inject({
      method: "GET",
      url: "/api/health"
    });
    assert.equal(health.statusCode, 200);
    assert.deepEqual(JSON.parse(health.payload), { ok: true });

    const listResponse = await server.inject({
      method: "GET",
      url: "/api/plans"
    });
    assert.equal(listResponse.statusCode, 200);
    const payload = JSON.parse(listResponse.payload);
    assert.ok(Array.isArray(payload.plans));
    assert.ok(payload.plans.length >= 1);
    assert.equal(payload.plans[0].is_archived, false);

    const projectsResponse = await server.inject({
      method: "GET",
      url: "/api/projects"
    });
    assert.equal(projectsResponse.statusCode, 200);
    const projectsPayload = JSON.parse(projectsResponse.payload);
    assert.ok(Array.isArray(projectsPayload.projects));
    assert.equal(projectsPayload.projects[0].project_id, "default");

    const scopedListResponse = await server.inject({
      method: "GET",
      url: "/api/projects/default/plans"
    });
    assert.equal(scopedListResponse.statusCode, 200);
    const scopedListPayload = JSON.parse(scopedListResponse.payload);
    assert.ok(Array.isArray(scopedListPayload.plans));

    const planId = payload.plans[0].plan_id;
    const detailResponse = await server.inject({
      method: "GET",
      url: `/api/plans/${encodeURIComponent(planId)}`
    });
    assert.equal(detailResponse.statusCode, 200);
    const detail = JSON.parse(detailResponse.payload);
    assert.equal(detail.summary.plan_id, planId);

    const missingResponse = await server.inject({
      method: "GET",
      url: "/api/plans/DOES_NOT_EXIST"
    });
    assert.equal(missingResponse.statusCode, 404);
    const missing = JSON.parse(missingResponse.payload);
    assert.equal(missing.error_code, "PLAN_NOT_FOUND");

    const badPlanPath = path.join(tempDir, ".local", "plans", "bad-plan.md");
    await fs.writeFile(
      badPlanPath,
      `---
plan_id: BAD-PLAN
title: bad
status: draft
decision: GO
selected_mode: Plan
next_mode: Build
next_command: build
updated_at: 2026-03-01
---

## Goal
- only one section
`,
      "utf8"
    );

    const listAfterBad = await server.inject({
      method: "GET",
      url: "/api/plans"
    });
    assert.equal(listAfterBad.statusCode, 200);
    const payloadAfterBad = JSON.parse(listAfterBad.payload);
    const badSummary = payloadAfterBad.plans.find((item) => item.plan_id === "BAD-PLAN");
    assert.ok(badSummary);
    assert.equal(badSummary.is_valid, false);
    assert.ok(badSummary.error_count > 0);

    const patchStatus = await server.inject({
      method: "PATCH",
      url: `/api/plans/${encodeURIComponent(planId)}/status`,
      payload: { status: "active", expected_updated_at: detail.summary.updated_at }
    });
    assert.equal(patchStatus.statusCode, 200);
    const patchStatusPayload = JSON.parse(patchStatus.payload);
    assert.equal(patchStatusPayload.summary.status, "active");

    const patchDecision = await server.inject({
      method: "PATCH",
      url: `/api/plans/${encodeURIComponent(planId)}/decision`,
      payload: { decision: "GO", expected_updated_at: patchStatusPayload.summary.updated_at }
    });
    assert.equal(patchDecision.statusCode, 200);
    const patchDecisionPayload = JSON.parse(patchDecision.payload);
    assert.equal(patchDecisionPayload.summary.decision, "GO");

    const patchTask = await server.inject({
      method: "PATCH",
      url: `/api/plans/${encodeURIComponent(planId)}/task`,
      payload: { task_index: 0, checked: true, expected_updated_at: patchDecisionPayload.summary.updated_at }
    });
    assert.equal(patchTask.statusCode, 200);

    const patchGate = await server.inject({
      method: "PATCH",
      url: `/api/plans/${encodeURIComponent(planId)}/gate`,
      payload: { gate_index: 0, checked: true, expected_updated_at: patchDecisionPayload.summary.updated_at }
    });
    assert.equal(patchGate.statusCode, 200);

    const progress = await server.inject({
      method: "POST",
      url: `/api/plans/${encodeURIComponent(planId)}/progress`,
      payload: {
        ac_updates: [
          { index: 0, checked: true },
          { index: 1, checked: true }
        ],
        wip: {
          status: "validated",
          blockers: "none",
          next_step: "archive"
        },
        handoff: {
          status: "done",
          next_command: "done",
          next_mode: "done"
        }
      }
    });
    assert.equal(progress.statusCode, 200);

    const complete = await server.inject({
      method: "POST",
      url: `/api/plans/${encodeURIComponent(planId)}/complete`,
      payload: { check_passed: true }
    });
    assert.equal(complete.statusCode, 200);
    const completePayload = JSON.parse(complete.payload);
    assert.equal(typeof completePayload.archived_path, "string");

    const listAfterArchive = await server.inject({
      method: "GET",
      url: "/api/plans?include_done=true"
    });
    assert.equal(listAfterArchive.statusCode, 200);
    const archivePayload = JSON.parse(listAfterArchive.payload);
    const archivedItem = archivePayload.plans.find((item) => item.plan_id === planId);
    assert.ok(archivedItem);
    assert.equal(archivedItem.is_archived, true);

    const codexAction = await server.inject({
      method: "POST",
      url: "/api/codex/action",
      payload: { plan_id: planId, action_type: "plan", mode_hint: "Plan" }
    });
    assert.equal(codexAction.statusCode, 403);
    const codexPayload = JSON.parse(codexAction.payload);
    assert.equal(codexPayload.error_code, "CODEX_ACTION_DISABLED");

    const indexResponse = await server.inject({
      method: "GET",
      url: "/"
    });
    assert.equal(indexResponse.statusCode, 200);
    assert.ok(indexResponse.payload.includes("toolbar-controls"));
    assert.ok(indexResponse.payload.includes("plan-search-input"));
    assert.ok(indexResponse.payload.includes("plan-selection-help"));
    assert.ok(indexResponse.payload.includes("plan-search-results"));
    assert.ok(indexResponse.payload.includes("No selected plan. Click to browse or type to filter."));
    assert.ok(indexResponse.payload.includes("Plan Picker"));
    assert.ok(indexResponse.payload.includes("Plan View"));
    assert.ok(indexResponse.payload.includes('type="importmap"'));
    assert.ok(indexResponse.payload.includes("lucide-preact"));
    assert.ok(indexResponse.payload.includes("theme-preference"));
    assert.ok(indexResponse.payload.includes("Theme"));
    assert.ok(indexResponse.payload.includes("theme_pref"));
    assert.ok(!indexResponse.payload.includes("workspace-badge"));
    assert.ok(!indexResponse.payload.includes("project-badge"));
    assert.ok(!indexResponse.payload.includes("api-badge"));
    assert.ok(!indexResponse.payload.includes("plan-selected-pill"));
    assert.ok(indexResponse.payload.includes("Phase Timeline"));
    assert.ok(indexResponse.payload.includes("Implementation Plan Status"));
    assert.ok(!indexResponse.payload.includes("Next Step"));
    assert.ok(!indexResponse.payload.includes("Plan Health"));
    assert.ok(indexResponse.payload.includes("Execution Timeline"));
    assert.ok(indexResponse.payload.includes("Execution Type"));
    assert.ok(indexResponse.payload.includes("activity-density"));
    assert.ok(indexResponse.payload.includes("Density"));
    assert.ok(indexResponse.payload.includes("1. Now"));
    assert.ok(indexResponse.payload.includes("2. Plan Status"));
    assert.ok(indexResponse.payload.includes("3. Timeline"));

    const appJsResponse = await server.inject({
      method: "GET",
      url: "/assets/app.js"
    });
    assert.equal(appJsResponse.statusCode, 200);
    assert.ok(appJsResponse.payload.includes('./client/main.js'));

    const clientMainResponse = await server.inject({
      method: "GET",
      url: "/assets/client/main.js"
    });
    assert.equal(clientMainResponse.statusCode, 200);
    assert.ok(clientMainResponse.payload.includes("No plan selected."));
    assert.ok(clientMainResponse.payload.includes("Choose a plan from the toolbar plan picker."));

    const vendorResponse = await server.inject({
      method: "GET",
      url: "/assets/vendor/kfc-web-ui/index.js"
    });
    assert.equal(vendorResponse.statusCode, 200);
    assert.ok(vendorResponse.payload.includes("Card"));
    assert.ok(vendorResponse.payload.includes("Badge"));

    const stylesResponse = await server.inject({
      method: "GET",
      url: "/assets/styles.css"
    });
    assert.equal(stylesResponse.statusCode, 200);
    assert.ok(stylesResponse.payload.includes(":root[data-theme=\"dark\"]"));
    assert.ok(stylesResponse.payload.includes("color-scheme: dark"));
    assert.ok(stylesResponse.payload.includes("--bg-glow-a-fade"));
    assert.ok(stylesResponse.payload.includes(".toolbar-field-theme"));
    assert.ok(stylesResponse.payload.includes(".journal-header"));
    assert.ok(stylesResponse.payload.includes(".empty-state"));
    assert.ok(stylesResponse.payload.includes(".activity-tag-error"));
    assert.ok(stylesResponse.payload.includes(".activity-overview-stack"));
    assert.ok(stylesResponse.payload.includes(".activity-quick-grid"));
    assert.ok(stylesResponse.payload.includes(".activity-block"));
    assert.ok(stylesResponse.payload.includes("@media (min-width: 1500px)"));
    assert.ok(stylesResponse.payload.includes(".phase-timeline"));
    assert.ok(stylesResponse.payload.includes(".phase-step-current"));
    assert.ok(stylesResponse.payload.includes(".phase-current-summary"));
    assert.ok(stylesResponse.payload.includes(".phase-next-cue"));
    assert.ok(stylesResponse.payload.includes(".phase-connector-done"));
    assert.ok(stylesResponse.payload.includes(".panel-kicker"));
    assert.ok(stylesResponse.payload.includes(".snapshot-stack"));
    assert.ok(stylesResponse.payload.includes(".implementation-flow-card"));
    assert.ok(stylesResponse.payload.includes(".implementation-flow-mermaid"));
    assert.ok(stylesResponse.payload.includes(".implementation-flow-warning"));
    assert.ok(stylesResponse.payload.includes(".implementation-flow-toolbar"));
    assert.ok(stylesResponse.payload.includes(".implementation-flow-button"));
    assert.ok(stylesResponse.payload.includes(".plan-check"));
    assert.ok(stylesResponse.payload.includes(".checklist-item-nested"));
    assert.ok(stylesResponse.payload.includes(".checklist-children"));
    assert.ok(stylesResponse.payload.includes(".inline-code-chip"));
    assert.ok(stylesResponse.payload.includes(".plan-file-link"));
    assert.ok(stylesResponse.payload.includes(".activity-detail"));
    assert.ok(stylesResponse.payload.includes(".activity-block-activity"));
    assert.ok(stylesResponse.payload.includes(".activity-block-evidence-missing"));
    assert.ok(stylesResponse.payload.includes(".activity-evidence-state"));
    assert.ok(stylesResponse.payload.includes(".activity-confidence-chip"));
    assert.ok(stylesResponse.payload.includes(".activity-timeline-list"));
    assert.ok(stylesResponse.payload.includes(".activity-debug-details"));
    assert.ok(stylesResponse.payload.includes(".activity-progress-strip"));
    assert.ok(stylesResponse.payload.includes(".activity-progress-kv-tasks"));
    assert.ok(stylesResponse.payload.includes(".activity-current-signal"));
    assert.ok(stylesResponse.payload.includes(".activity-current-summary"));
    assert.ok(stylesResponse.payload.includes(".activity-pinned-blockers"));
    assert.ok(stylesResponse.payload.includes(".activity-trace-hint"));
    assert.ok(stylesResponse.payload.includes("#activity-density"));
    assert.ok(stylesResponse.payload.includes(".activity-timeline-badge-status"));
    assert.ok(stylesResponse.payload.includes(".activity-timeline-action-message"));
    assert.ok(stylesResponse.payload.includes(".activity-timeline-node"));
    assert.ok(stylesResponse.payload.includes(".activity-summary-state-pulse"));
    assert.ok(stylesResponse.payload.includes(".implementation-flow-mermaid svg"));
    assert.ok(stylesResponse.payload.includes("height: 100% !important"));
    assert.ok(stylesResponse.payload.includes("height: clamp(208px, 38vh, 420px)"));
    assert.ok(stylesResponse.payload.includes(".journal-filter-group"));
    assert.ok(stylesResponse.payload.includes(".toolbar-field-selected"));
    assert.ok(stylesResponse.payload.includes("--space-4"));
    assert.ok(stylesResponse.payload.includes("@supports (color: oklch"));
    assert.ok(stylesResponse.payload.includes("@media (prefers-reduced-motion: reduce)"));

    await server.close();
  });
});

await runCase("automation apply updates transitions and archives on PASS", async () => {
  let createServer;
  try {
    ({ createServer } = await import("../dist/server/create-server.js"));
  } catch (err) {
    if (err && typeof err === "object" && (err.code === "ERR_MODULE_NOT_FOUND" || err.code === "MODULE_NOT_FOUND")) {
      console.log("[test] SKIP automation test: install package dependencies first.");
      return;
    }
    throw err;
  }

  await withTempDir(async (tempDir) => {
    const initExit = await runCli(["init", "--project", tempDir]);
    assert.equal(initExit, 0);

    const server = await createServer({
      projectDir: tempDir,
      withWatcher: false,
      uiMode: "operator",
      runCodexAction: async () => ({
        status: "completed",
        command: "codex exec \"test\"",
        stdout_tail: "ok",
        stderr_tail: "",
        exit_code: 0,
        run_id: "run_test"
      })
    });
    await server.ready();

    const listResponse = await server.inject({ method: "GET", url: "/api/plans" });
    assert.equal(listResponse.statusCode, 200);
    const listPayload = JSON.parse(listResponse.payload);
    const planId = listPayload.plans[0].plan_id;

    const badAction = await server.inject({
      method: "POST",
      url: `/api/plans/${encodeURIComponent(planId)}/automation/apply`,
      payload: { action_type: "unknown_action" }
    });
    assert.equal(badAction.statusCode, 400);

    const buildScopeViolation = await server.inject({
      method: "POST",
      url: `/api/plans/${encodeURIComponent(planId)}/automation/apply`,
      payload: {
        action_type: "build_result",
        ac_updates: [{ index: 0, checked: true }]
      }
    });
    assert.equal(buildScopeViolation.statusCode, 400);
    const buildScopePayload = JSON.parse(buildScopeViolation.payload);
    assert.equal(buildScopePayload.error_code, "PHASE_SCOPE_VIOLATION");

    const buildApply = await server.inject({
      method: "POST",
      url: `/api/plans/${encodeURIComponent(planId)}/automation/apply`,
      payload: {
        action_type: "build_result",
        task_updates: [{ index: 0, checked: true }],
        wip: {
          status: "in_progress",
          blockers: "none",
          next_step: "run check",
          evidence: ["cmd:npm run plan-ui:test -> pass"]
        }
      }
    });
    assert.equal(buildApply.statusCode, 200);
    const buildPayload = JSON.parse(buildApply.payload);
    assert.equal(buildPayload.summary.next_command, "check");
    assert.equal(buildPayload.summary.next_mode, "Plan");
    assert.equal(buildPayload.archive.archived, false);

    const checkScopeViolation = await server.inject({
      method: "POST",
      url: `/api/plans/${encodeURIComponent(planId)}/automation/apply`,
      payload: {
        action_type: "check_result",
        task_updates: [{ index: 0, checked: true }],
        check: { result: "BLOCK", findings: [] }
      }
    });
    assert.equal(checkScopeViolation.statusCode, 400);
    const checkScopePayload = JSON.parse(checkScopeViolation.payload);
    assert.equal(checkScopePayload.error_code, "PHASE_SCOPE_VIOLATION");

    const blockApply = await server.inject({
      method: "POST",
      url: `/api/plans/${encodeURIComponent(planId)}/automation/apply`,
      payload: {
        action_type: "check_result",
        check: {
          result: "BLOCK",
          findings: ["missing acceptance criteria coverage"]
        },
        wip: {
          next_step: "apply fix"
        }
      }
    });
    assert.equal(blockApply.statusCode, 200);
    const blockPayload = JSON.parse(blockApply.payload);
    assert.equal(blockPayload.summary.decision, "NO_GO");
    assert.equal(blockPayload.summary.next_command, "fix");
    assert.equal(blockPayload.summary.next_mode, "Build");
    assert.equal(blockPayload.archive.archived, false);

    const passApply = await server.inject({
      method: "POST",
      url: `/api/plans/${encodeURIComponent(planId)}/automation/apply`,
      payload: {
        action_type: "check_result",
        ac_updates: [
          { index: 0, checked: true },
          { index: 1, checked: true }
        ],
        check: {
          result: "PASS",
          findings: []
        },
        wip: {
          status: "done",
          blockers: "none",
          next_step: "archive complete",
          evidence: ["check:PASS"]
        }
      }
    });
    assert.equal(passApply.statusCode, 200);
    const passPayload = JSON.parse(passApply.payload);
    assert.equal(passPayload.archive.archived, true);
    assert.equal(typeof passPayload.archive.archived_path, "string");

    const listAfter = await server.inject({ method: "GET", url: "/api/plans?include_done=true" });
    assert.equal(listAfter.statusCode, 200);
    const listAfterPayload = JSON.parse(listAfter.payload);
    const archivedPlan = listAfterPayload.plans.find((item) => item.plan_id === planId);
    assert.ok(archivedPlan);
    assert.equal(archivedPlan.is_archived, true);

    await server.close();
  });
});

await runCase("check PASS loops to fix when completion is below 100%", async () => {
  let createServer;
  try {
    ({ createServer } = await import("../dist/server/create-server.js"));
  } catch (err) {
    if (err && typeof err === "object" && (err.code === "ERR_MODULE_NOT_FOUND" || err.code === "MODULE_NOT_FOUND")) {
      console.log("[test] SKIP completion-gate test: install package dependencies first.");
      return;
    }
    throw err;
  }

  await withTempDir(async (tempDir) => {
    const initExit = await runCli(["init", "--project", tempDir]);
    assert.equal(initExit, 0);

    const server = await createServer({
      projectDir: tempDir,
      withWatcher: false,
      uiMode: "operator",
      runCodexAction: async () => ({
        status: "completed",
        command: "codex exec \"test\"",
        stdout_tail: "ok",
        stderr_tail: "",
        exit_code: 0,
        run_id: "run_test"
      })
    });
    await server.ready();

    const listResponse = await server.inject({ method: "GET", url: "/api/plans" });
    assert.equal(listResponse.statusCode, 200);
    const listPayload = JSON.parse(listResponse.payload);
    const planId = listPayload.plans[0].plan_id;

    const transitionBlocked = await server.inject({
      method: "POST",
      url: `/api/plans/${encodeURIComponent(planId)}/automation/apply`,
      payload: {
        action_type: "check_result",
        check: { result: "PASS", findings: [] }
      }
    });
    assert.equal(transitionBlocked.statusCode, 409);
    const transitionBlockedPayload = JSON.parse(transitionBlocked.payload);
    assert.equal(transitionBlockedPayload.error_code, "FLOW_TRANSITION_BLOCK");

    const buildApply = await server.inject({
      method: "POST",
      url: `/api/plans/${encodeURIComponent(planId)}/automation/apply`,
      payload: {
        action_type: "build_result",
        wip: {
          status: "in_progress",
          blockers: "none",
          next_step: "run check"
        }
      }
    });
    assert.equal(buildApply.statusCode, 200);

    const checkPassIncomplete = await server.inject({
      method: "POST",
      url: `/api/plans/${encodeURIComponent(planId)}/automation/apply`,
      payload: {
        action_type: "check_result",
        ac_updates: [
          { index: 0, checked: true },
          { index: 1, checked: true }
        ],
        check: { result: "PASS", findings: [] }
      }
    });
    assert.equal(checkPassIncomplete.statusCode, 200);
    const incompletePayload = JSON.parse(checkPassIncomplete.payload);
    assert.equal(incompletePayload.summary.next_command, "fix");
    assert.equal(incompletePayload.summary.next_mode, "Build");
    assert.equal(incompletePayload.summary.decision, "NO_GO");
    assert.equal(incompletePayload.archive.archived, false);
    assert.ok(Array.isArray(incompletePayload.applied));
    assert.ok(incompletePayload.applied.includes("completion:block"));

    await server.close();
  });
});

await runCase("observer mode blocks mutation and codex action APIs", async () => {
  let createServer;
  try {
    ({ createServer } = await import("../dist/server/create-server.js"));
  } catch (err) {
    if (err && typeof err === "object" && (err.code === "ERR_MODULE_NOT_FOUND" || err.code === "MODULE_NOT_FOUND")) {
      console.log("[test] SKIP observer lock test: install package dependencies first.");
      return;
    }
    throw err;
  }

  await withTempDir(async (tempDir) => {
    const initExit = await runCli(["init", "--project", tempDir]);
    assert.equal(initExit, 0);

    const server = await createServer({
      projectDir: tempDir,
      withWatcher: false
    });
    await server.ready();

    const listResponse = await server.inject({ method: "GET", url: "/api/plans" });
    assert.equal(listResponse.statusCode, 200);
    const listPayload = JSON.parse(listResponse.payload);
    const planId = listPayload.plans[0].plan_id;

    const statusPatch = await server.inject({
      method: "PATCH",
      url: `/api/plans/${encodeURIComponent(planId)}/status`,
      payload: { status: "in_progress" }
    });
    assert.equal(statusPatch.statusCode, 403);
    const statusPayload = JSON.parse(statusPatch.payload);
    assert.equal(statusPayload.error_code, "READ_ONLY_MODE");

    const codexAction = await server.inject({
      method: "POST",
      url: "/api/codex/action",
      payload: { plan_id: planId, action_type: "plan", mode_hint: "Plan" }
    });
    assert.equal(codexAction.statusCode, 403);
    const codexPayload = JSON.parse(codexAction.payload);
    assert.equal(codexPayload.error_code, "CODEX_ACTION_DISABLED");

    await server.close();
  });
});

await runCase("sse stream supports replay and heartbeat", async () => {
  const writes = [];
  const reply = {
    raw: {
      write(chunk) {
        writes.push(chunk);
      }
    }
  };

  const stream = new SSEStream(3);
  const firstId = stream.publish("plan_updated", { n: 1 }, "P1");
  stream.publish("plan_updated", { n: 2 }, "P1");
  stream.publish("plan_updated", { n: 3 }, "P1");

  stream.subscribe("P1", reply, String(firstId));
  stream.sendHeartbeat();

  const payload = writes.join("");
  assert.ok(payload.includes("event: connected"));
  assert.ok(payload.includes("event: plan_updated"));
  assert.ok(payload.includes("event: heartbeat"));
});

if (originalCodexExecutableOverride === undefined) {
  delete process.env.KFC_PLAN_CODEX_EXECUTABLES;
} else {
  process.env.KFC_PLAN_CODEX_EXECUTABLES = originalCodexExecutableOverride;
}
if (originalCodexTimeoutOverride === undefined) {
  delete process.env.KFC_PLAN_CODEX_ACTION_TIMEOUT_MS;
} else {
  process.env.KFC_PLAN_CODEX_ACTION_TIMEOUT_MS = originalCodexTimeoutOverride;
}

if (failed > 0) {
  process.exitCode = 1;
  console.error(`[test] ${failed} test(s) failed.`);
} else {
  console.log("[test] all tests passed.");
}
