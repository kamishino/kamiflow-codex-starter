#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  collectRelativeFilePaths,
  installMetaRelativePath,
  readInstallMeta
} from "./skill-runtime.mjs";
import {
  readGitState,
  runCommand as runProcessCommand
} from "../resources/skills/kamiflow-core/scripts/lib-process.mjs";
import {
  countCheckboxes,
  detectRepoRole,
  extractSection,
  hasGitExcludeEntry,
  listPlanRecords,
  projectBriefAssetRelativeForRole,
  REPO_ROLE_CLIENT,
  REPO_ROLE_DOGFOOD,
  ROOT_AGENTS_PATH,
  resolveActivePlan
} from "../resources/skills/kamiflow-core/scripts/lib-plan.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");
const assetsRoot = path.join(repoRoot, "resources", "skills", "kamiflow-core", "assets", "forward-tests");
const manifestPath = path.join(assetsRoot, "scenarios.json");
const artifactRoot = path.join(repoRoot, ".local", "forward-tests");
const tempWorkspaceRoot = path.join(os.tmpdir(), "kamiflow-core-forward-tests");

const legacyPatterns = [
  /\bkfc\b/i,
  /\.kfc\b/i,
  /\bdogfood\b/i,
  /client\.rules|dogfood\.rules|base\.rules/i
];

const missingFailurePatterns = [
  /\bENOENT\b/i,
  /No such file or directory/i,
  /command not found/i,
  /Cannot find module/i,
  /\bnot recognized as an internal or external command\b/i,
  /\bmodule not found\b/i
];

const args = parseCliArgs(process.argv.slice(2));
const requestedScenario = String(args.scenario || "").trim();
const requestedMode = String(args.mode || "smoke").trim().toLowerCase();

await fsp.mkdir(artifactRoot, { recursive: true });
await fsp.mkdir(tempWorkspaceRoot, { recursive: true });

const manifest = JSON.parse(await fsp.readFile(manifestPath, "utf8"));
if (requestedMode && !["smoke", "full"].includes(requestedMode)) {
  throw new Error(`Unknown forward-test mode: ${requestedMode}`);
}

const scenarios = manifest.filter((scenario) => {
  if (requestedScenario) {
    return scenario.name === requestedScenario;
  }
  return Array.isArray(scenario.modes) && scenario.modes.includes(requestedMode);
});
if (requestedScenario && scenarios.length === 0) {
  throw new Error(`Unknown scenario: ${requestedScenario}`);
}
if (!requestedScenario && scenarios.length === 0) {
  throw new Error(`No scenarios matched forward-test mode: ${requestedMode}`);
}

const runStartMs = Date.now();
const runId = buildRunId();
const runDir = path.join(artifactRoot, runId);
await fsp.mkdir(runDir, { recursive: true });

const packStartedAtMs = Date.now();
const tarballPath = await packRepo(runDir);
const packFinishedAtMs = Date.now();
const results = [];

for (const scenario of scenarios) {
  const result = await runScenario({ scenario, tarballPath, runDir });
  results.push(result);
  console.log([
    `[${result.ok ? "PASS" : "BLOCK"}] ${scenario.name}: ${result.summary}`,
    `total ${formatDuration(result.timings_ms.total)}`,
    `install ${formatDuration(result.timings_ms.install)}`,
    `codex ${formatDuration(result.timings_ms.codex)}`
  ].join(" | "));
}

const runFinishedAtMs = Date.now();
const summary = {
  ok: results.every((result) => result.ok),
  mode: requestedScenario ? "scenario" : requestedMode,
  run_id: runId,
  repo_head: await safeRevParse("HEAD"),
  repo_branch: await safeRevParse("--abbrev-ref", "HEAD"),
  tarball: tarballPath,
  timings_ms: {
    total: runFinishedAtMs - runStartMs,
    pack: packFinishedAtMs - packStartedAtMs
  },
  results
};

await writeJson(path.join(runDir, "summary.json"), summary);
await fsp.writeFile(path.join(runDir, "summary.md"), renderSummaryMarkdown(summary), "utf8");

if (!summary.ok) {
  process.exitCode = 1;
}

process.exit(process.exitCode ?? 0);

async function runScenario({ scenario, tarballPath, runDir }) {
  const scenarioStartedAtMs = Date.now();
  const scenarioDir = path.join(runDir, scenario.name);
  const logDir = path.join(scenarioDir, "logs");
  const promptOutputPath = path.join(scenarioDir, "prompt.md");
  const lastMessagePath = path.join(logDir, "last-message.txt");
  const stdoutPath = path.join(logDir, "codex.stdout.jsonl");
  const stderrPath = path.join(logDir, "codex.stderr.log");
  const installLogPath = path.join(logDir, "install.log");
  const reinstallLogPath = path.join(logDir, "install-rerun.log");
  const doctorLogPath = path.join(logDir, "doctor.log");
  const readyCheckLogPath = path.join(logDir, "ready-check.log");
  const planHistoryLogPath = path.join(logDir, "plan-history.log");
  const finishStatusLogPath = path.join(logDir, "finish-status.log");
  const versionCloseoutLogPath = path.join(logDir, "version-closeout.log");
  const archiveLogPath = path.join(logDir, "archive-plan.log");
  const baselineCommitLogPath = path.join(logDir, "baseline-commit.log");
  const externalWorkspace = path.join(tempWorkspaceRoot, `${path.basename(runDir)}-${scenario.name}`);

  await fsp.rm(scenarioDir, { recursive: true, force: true });
  await fsp.rm(externalWorkspace, { recursive: true, force: true });
  await fsp.mkdir(logDir, { recursive: true });
  await fsp.mkdir(externalWorkspace, { recursive: true });

  if (scenario.fixtureDir) {
    await fsp.cp(path.join(assetsRoot, scenario.fixtureDir), externalWorkspace, { recursive: true, force: true });
  }
  if (scenario.initializeGit) {
    await runCommand("git", ["init", "-q"], { cwd: externalWorkspace });
  }
  if (scenario.projectBriefFile) {
    const projectBriefSource = path.join(assetsRoot, scenario.fixtureDir, scenario.projectBriefFile);
    const projectBriefTarget = path.join(externalWorkspace, ".local", "project.md");
    await fsp.mkdir(path.dirname(projectBriefTarget), { recursive: true });
    await fsp.copyFile(projectBriefSource, projectBriefTarget);
  }

  let prompt = "";
  if (!scenario.skipCodex) {
    const promptTemplate = await fsp.readFile(path.join(assetsRoot, scenario.promptFile), "utf8");
    prompt = renderPrompt(promptTemplate, {
      projectDir: externalWorkspace,
      skillPath: path.join(externalWorkspace, ".agents", "skills", "kamiflow-core", "SKILL.md")
    });
    await fsp.writeFile(promptOutputPath, prompt, "utf8");
  }

  const beforeState = await collectScenarioState(externalWorkspace, scenario);
  const installStartedAtMs = Date.now();
  const installResult = await runCommand("npx", ["--yes", "--package", tarballPath, "kamiflow-core", "install", "--project", externalWorkspace], {
    cwd: repoRoot
  });
  const installFinishedAtMs = Date.now();
  await fsp.writeFile(installLogPath, `${installResult.stdout}\n${installResult.stderr}`.trim(), "utf8");
  if (installResult.code !== 0) {
    const failure = buildFailureResult(scenario.name, "Install step failed.", [
      `install exit code: ${installResult.code}`
    ]);
    failure.timings_ms = {
      total: Date.now() - scenarioStartedAtMs,
      install: installFinishedAtMs - installStartedAtMs,
      codex: 0
    };
    await writeJson(path.join(scenarioDir, "result.json"), failure);
    await snapshotWorkspace(externalWorkspace, path.join(scenarioDir, "project"));
    await fsp.rm(externalWorkspace, { recursive: true, force: true });
    return failure;
  }
  const installState = await collectScenarioState(externalWorkspace, scenario);

  if (scenario.prepareCommittedBaseline) {
    const baselineCommitResult = await createBaselineCommit(externalWorkspace, scenario.baselineCommitMessage);
    await fsp.writeFile(baselineCommitLogPath, `${baselineCommitResult.stdout}\n${baselineCommitResult.stderr}`.trim(), "utf8");
    if (baselineCommitResult.code !== 0) {
      const failure = buildFailureResult(scenario.name, "Baseline commit step failed.", [
        `baseline commit exit code: ${baselineCommitResult.code}`
      ]);
      failure.timings_ms = {
        total: Date.now() - scenarioStartedAtMs,
        install: installFinishedAtMs - installStartedAtMs,
        codex: 0
      };
      await writeJson(path.join(scenarioDir, "result.json"), failure);
      await snapshotWorkspace(externalWorkspace, path.join(scenarioDir, "project"));
      await fsp.rm(externalWorkspace, { recursive: true, force: true });
      return failure;
    }
  }

  if (scenario.createDirtyWorktreeFile) {
    const dirtyRelativePath = String(scenario.createDirtyWorktreeFile);
    const dirtyTargetPath = path.join(externalWorkspace, dirtyRelativePath);
    await fsp.mkdir(path.dirname(dirtyTargetPath), { recursive: true });
    await fsp.writeFile(
      dirtyTargetPath,
      String(scenario.createDirtyWorktreeContent || `dirty worktree fixture for ${scenario.name}\n`),
      "utf8"
    );
  }

  let reinstallResult = { code: 0, stdout: "", stderr: "", timedOut: false };
  let reinstallState = null;
  if (scenario.rerunInstall) {
    reinstallResult = await runCommand("npx", ["--yes", "--package", tarballPath, "kamiflow-core", "install", "--project", externalWorkspace], {
      cwd: repoRoot
    });
    await fsp.writeFile(reinstallLogPath, `${reinstallResult.stdout}\n${reinstallResult.stderr}`.trim(), "utf8");
    if (reinstallResult.code !== 0) {
      const failure = buildFailureResult(scenario.name, "Second install step failed.", [
        `second install exit code: ${reinstallResult.code}`
      ]);
      failure.timings_ms = {
        total: Date.now() - scenarioStartedAtMs,
        install: installFinishedAtMs - installStartedAtMs,
        codex: 0
      };
      await writeJson(path.join(scenarioDir, "result.json"), failure);
      await snapshotWorkspace(externalWorkspace, path.join(scenarioDir, "project"));
      await fsp.rm(externalWorkspace, { recursive: true, force: true });
      return failure;
    }
    reinstallState = await collectScenarioState(externalWorkspace, scenario);
  }

  let doctorResult = { code: 0, stdout: "", stderr: "", timedOut: false };
  if (scenario.runMaintainerDoctor) {
    doctorResult = await runCommand("node", ["scripts/skill-doctor.mjs", "--project", externalWorkspace], {
      cwd: repoRoot
    });
    await fsp.writeFile(doctorLogPath, `${doctorResult.stdout}\n${doctorResult.stderr}`.trim(), "utf8");
  }

  let readyCheckResult = { code: 0, stdout: "", stderr: "", timedOut: false };
  if (scenario.runReadyCheck) {
    readyCheckResult = await runCommand("node", [path.join(".agents", "skills", "kamiflow-core", "scripts", "ready-check.mjs"), "--project", "."], {
      cwd: externalWorkspace
    });
    await fsp.writeFile(readyCheckLogPath, `${readyCheckResult.stdout}\n${readyCheckResult.stderr}`.trim(), "utf8");
  }

  let planHistoryResult = { code: 0, stdout: "", stderr: "", timedOut: false };
  if (scenario.runPlanHistory) {
    planHistoryResult = await runCommand("node", [
      path.join(".agents", "skills", "kamiflow-core", "scripts", "plan-history.mjs"),
      "--project",
      ".",
      "--query",
      String(scenario.planHistoryQuery || "")
    ], {
      cwd: externalWorkspace
    });
    await fsp.writeFile(planHistoryLogPath, `${planHistoryResult.stdout}\n${planHistoryResult.stderr}`.trim(), "utf8");
  }

  let finishStatusResult = { code: 0, stdout: "", stderr: "", timedOut: false };
  if (scenario.runFinishStatus) {
    finishStatusResult = await runCommand("node", [path.join(".agents", "skills", "kamiflow-core", "scripts", "finish-status.mjs"), "--project", "."], {
      cwd: externalWorkspace
    });
    await fsp.writeFile(finishStatusLogPath, `${finishStatusResult.stdout}\n${finishStatusResult.stderr}`.trim(), "utf8");
  }

  let versionCloseoutResult = { code: 0, stdout: "", stderr: "", timedOut: false };
  if (scenario.runVersionCloseout) {
    versionCloseoutResult = await runCommand("node", [path.join(".agents", "skills", "kamiflow-core", "scripts", "version-closeout.mjs"), "--project", "."], {
      cwd: externalWorkspace
    });
    await fsp.writeFile(versionCloseoutLogPath, `${versionCloseoutResult.stdout}\n${versionCloseoutResult.stderr}`.trim(), "utf8");
  }

  let archivePlanResult = { code: 0, stdout: "", stderr: "", timedOut: false };
  if (scenario.runArchivePlan) {
    archivePlanResult = await runCommand("node", [path.join(".agents", "skills", "kamiflow-core", "scripts", "archive-plan.mjs"), "--project", "."], {
      cwd: externalWorkspace
    });
    await fsp.writeFile(archiveLogPath, `${archivePlanResult.stdout}\n${archivePlanResult.stderr}`.trim(), "utf8");
  }

  let codexResult = { code: 0, stdout: "", stderr: "", timedOut: false };
  let finalMessage = "";
  let codexStartedAtMs = Date.now();
  let codexFinishedAtMs = codexStartedAtMs;
  if (!scenario.skipCodex) {
    codexStartedAtMs = Date.now();
    codexResult = await runCommand("codex", [
      "exec",
      "--cd",
      externalWorkspace,
      "--skip-git-repo-check",
      "--dangerously-bypass-approvals-and-sandbox",
      "--ephemeral",
      "--color",
      "never",
      "--json",
      "--output-last-message",
      lastMessagePath,
      "-"
    ], {
      cwd: repoRoot,
      input: prompt,
      timeoutMs: 12 * 60 * 1000
    });
    codexFinishedAtMs = Date.now();
    await fsp.writeFile(stdoutPath, codexResult.stdout, "utf8");
    await fsp.writeFile(stderrPath, codexResult.stderr, "utf8");
    finalMessage = fs.existsSync(lastMessagePath) ? await fsp.readFile(lastMessagePath, "utf8") : "";
  } else {
    await fsp.writeFile(stdoutPath, "", "utf8");
    await fsp.writeFile(stderrPath, "", "utf8");
  }
  const finalState = await collectScenarioState(externalWorkspace, scenario);
  const scenarioResult = await gradeScenario({
    scenario,
    workspace: externalWorkspace,
    beforeState,
    installState,
    finalState,
    reinstallResult,
    reinstallState,
    doctorResult,
    readyCheckResult,
    planHistoryResult,
    finishStatusResult,
    versionCloseoutResult,
    archivePlanResult,
    codexResult,
    finalMessage
  });
  scenarioResult.timings_ms = {
    total: Date.now() - scenarioStartedAtMs,
    install: installFinishedAtMs - installStartedAtMs,
    codex: codexFinishedAtMs - codexStartedAtMs
  };

  await snapshotWorkspace(externalWorkspace, path.join(scenarioDir, "project"));
  await writeJson(path.join(scenarioDir, "result.json"), scenarioResult);
  await fsp.rm(externalWorkspace, { recursive: true, force: true });
  return scenarioResult;
}

async function gradeScenario({ scenario, workspace, beforeState, installState, finalState, reinstallResult, reinstallState, doctorResult, readyCheckResult, planHistoryResult, finishStatusResult, versionCloseoutResult, archivePlanResult, codexResult, finalMessage }) {
  const activePlan = await resolveActivePlan(workspace);
  const allPlans = await listPlanRecords(workspace, true);
  const donePlans = allPlans.filter((plan) => String(plan.frontmatter.status || "").toLowerCase() === "done");
  const latestDonePlan = donePlans.sort((left, right) => right.stat.mtimeMs - left.stat.mtimeMs)[0] || null;
  const combinedOutput = `${finalMessage}\n${codexResult.stdout}\n${codexResult.stderr}`;
  const userFacingOutput = finalMessage;
  const readyCheckPayload = parseJsonMaybe(readyCheckResult.stdout);
  const planHistoryPayload = parseJsonMaybe(planHistoryResult.stdout);
  const finishStatusPayload = parseJsonMaybe(finishStatusResult.stdout);
  const usageLimitBlocked = !scenario.skipCodex
    && /hit your usage limit|purchase more credits|try again at/i.test(combinedOutput);
  const closeoutArchiveRaceOnly = scenario.grader === "closeout-check"
    && /archive-plan\.mjs[\s\S]*"ok":\s*true/i.test(codexResult.stdout)
    && /ENOENT[\s\S]*finish-status\.mjs/i.test(combinedOutput);
  const findings = [];
  const checks = [];

  if (usageLimitBlocked) {
    return {
      scenario: scenario.name,
      ok: true,
      summary: "blocked by Codex usage limit; scenario execution skipped",
      checks: [
        {
          label: "codex-usage-limit-blocked",
          ok: true,
          detail: "Codex usage credits were exhausted before this scenario could be graded."
        }
      ],
      codex_exit_code: codexResult.code,
      active_plan: activePlan ? summarizePlan(activePlan) : null,
      latest_done_plan: latestDonePlan ? summarizePlan(latestDonePlan) : null,
      environment_blocked: true
    };
  }

  checks.push({
    label: "codex-exit-zero",
    ok: codexResult.code === 0,
    detail: `exit code ${codexResult.code}`
  });

  checks.push({
    label: "no-legacy-terms",
    ok: !legacyPatterns.some((pattern) => pattern.test(userFacingOutput)),
    detail: "final message avoids legacy KFC, .kfc, dogfood, and rules-profile references"
  });

  checks.push({
    label: "no-missing-command-or-file-failure",
    ok: closeoutArchiveRaceOnly || !missingFailurePatterns.some((pattern) => pattern.test(combinedOutput)),
    detail: "logs avoid missing file or missing command failures after install"
  });

  checks.push({
    label: "no-legacy-scaffold-generated",
    ok: !fs.existsSync(path.join(workspace, ".kfc")) && !fs.existsSync(path.join(workspace, ".codex", "rules")),
    detail: "workspace contains only the skill install, not legacy scaffold"
  });

  if (scenario.runFinishStatus) {
    checks.push({
      label: "finish-status-no-dep0190-warning",
      ok: !/\[DEP0190\]/i.test(`${finishStatusResult.stdout}\n${finishStatusResult.stderr}`),
      detail: "finish-status output should not emit the Node DEP0190 warning"
    });
  }

  if (scenario.runVersionCloseout) {
    checks.push({
      label: "version-closeout-no-dep0190-warning",
      ok: !/\[DEP0190\]/i.test(`${versionCloseoutResult.stdout}\n${versionCloseoutResult.stderr}`),
      detail: "version-closeout output should not emit the Node DEP0190 warning"
    });
  }

  if (scenario.runPlanHistory) {
    checks.push({
      label: "plan-history-exits-zero",
      ok: planHistoryResult.code === 0,
      detail: `exit code ${planHistoryResult.code}`
    });
    checks.push({
      label: "plan-history-returns-json",
      ok: Boolean(planHistoryPayload?.ok),
      detail: planHistoryPayload ? "helper returned JSON" : "plan-history did not return JSON"
    });
    checks.push({
      label: "plan-history-bounded-results",
      ok: Array.isArray(planHistoryPayload?.results) && planHistoryPayload.results.length <= 5,
      detail: Array.isArray(planHistoryPayload?.results) ? `${planHistoryPayload.results.length} results` : "plan-history results missing"
    });
    checks.push({
      label: "plan-history-does-not-mutate-tracked-files",
      ok: Object.keys(finalState.fileHashes).every((relativePath) => installState.fileHashes[relativePath] === finalState.fileHashes[relativePath]),
      detail: "tracked project brief and plan files should remain unchanged after read-only retrieval"
    });
    checks.push({
      label: "plan-history-keeps-worktree-clean",
      ok: Array.isArray(finalState.git?.dirtyPaths) && finalState.git.dirtyPaths.length === 0,
      detail: Array.isArray(finalState.git?.dirtyPaths) ? finalState.git.dirtyPaths.join(" | ") || "git worktree remained clean" : "git state missing"
    });
  }

  if (scenario.grader === "fresh-empty") {
    const lifecyclePhase = String(activePlan?.frontmatter.lifecycle_phase || "").toLowerCase();
    const startSummarySection = extractSection(activePlan?.content || "", "Start Summary");
    checks.push({
      label: "active-plan-created",
      ok: Boolean(activePlan),
      detail: activePlan ? activePlan.path : "no active plan found"
    });
    checks.push({
      label: "brainstorm-alias-routes-to-start",
      ok: lifecyclePhase === "start",
      detail: lifecyclePhase || "missing lifecycle_phase"
    });
    checks.push({
      label: "start-handoff-stays-in-plan-mode",
      ok: String(activePlan?.frontmatter.next_command || "").toLowerCase() === "plan"
        && String(activePlan?.frontmatter.next_mode || "") === "Plan",
      detail: `${String(activePlan?.frontmatter.next_command || "<missing>")} / ${String(activePlan?.frontmatter.next_mode || "<missing>")}`
    });
    checks.push({
      label: "start-is-not-build-ready",
      ok: String(activePlan?.frontmatter.decision || "").toUpperCase() !== "GO",
      detail: String(activePlan?.frontmatter.decision || "<missing>")
    });
    checks.push({
      label: "start-summary-placeholder-cleared",
      ok: Boolean(startSummarySection) && !/Required:\s*yes\|no/i.test(startSummarySection),
      detail: startSummarySection ? "start summary updated" : "missing Start Summary section"
    });
    checks.push({
      label: "no-premature-check-claim",
      ok: !/Check:\s*(PASS|BLOCK)/i.test(finalMessage),
      detail: "final message should not pretend build/check completed in a fresh planning scenario"
    });
  }

  if (scenario.grader === "bounded-unclear-start") {
    const lifecyclePhase = String(activePlan?.frontmatter.lifecycle_phase || "").toLowerCase();
    const startSummarySection = extractSection(activePlan?.content || "", "Start Summary");
    checks.push({
      label: "active-plan-created",
      ok: Boolean(activePlan),
      detail: activePlan ? activePlan.path : "no active plan found"
    });
    checks.push({
      label: "bounded-unclear-routes-to-start",
      ok: lifecyclePhase === "start",
      detail: lifecyclePhase || "missing lifecycle_phase"
    });
    checks.push({
      label: "start-handoff-stays-in-plan-mode",
      ok: String(activePlan?.frontmatter.next_command || "").toLowerCase() === "plan"
        && String(activePlan?.frontmatter.next_mode || "") === "Plan",
      detail: `${String(activePlan?.frontmatter.next_command || "<missing>")} / ${String(activePlan?.frontmatter.next_mode || "<missing>")}`
    });
    checks.push({
      label: "start-is-not-build-ready",
      ok: String(activePlan?.frontmatter.decision || "").toUpperCase() !== "GO",
      detail: String(activePlan?.frontmatter.decision || "<missing>")
    });
    checks.push({
      label: "start-summary-placeholder-cleared",
      ok: Boolean(startSummarySection) && !/Required:\s*yes\|no/i.test(startSummarySection),
      detail: startSummarySection ? "start summary updated" : "missing Start Summary section"
    });
    checks.push({
      label: "no-premature-check-claim",
      ok: !/Check:\s*(PASS|BLOCK)/i.test(finalMessage),
      detail: "final message should stay in idea-shaping mode and avoid build/check claims"
    });
  }

  if (scenario.grader === "plan-alias") {
    const lifecyclePhase = String(activePlan?.frontmatter.lifecycle_phase || "").toLowerCase();
    checks.push({
      label: "active-plan-created",
      ok: Boolean(activePlan),
      detail: activePlan ? activePlan.path : "no active plan found"
    });
    checks.push({
      label: "plan-alias-routes-to-plan",
      ok: lifecyclePhase === "plan",
      detail: lifecyclePhase || "missing lifecycle_phase"
    });
    checks.push({
      label: "build-handoff-set",
      ok: String(activePlan?.frontmatter.next_command || "").toLowerCase() === "build"
        && String(activePlan?.frontmatter.next_mode || "") === "Build",
      detail: `${String(activePlan?.frontmatter.next_command || "<missing>")} / ${String(activePlan?.frontmatter.next_mode || "<missing>")}`
    });
    checks.push({
      label: "plan-decision-is-go",
      ok: String(activePlan?.frontmatter.decision || "").toUpperCase() === "GO",
      detail: String(activePlan?.frontmatter.decision || "<missing>")
    });
    checks.push({
      label: "no-premature-check-claim",
      ok: !/Check:\s*(PASS|BLOCK)/i.test(finalMessage),
      detail: "final message should not pretend implementation or verification already happened"
    });
  }

  if (scenario.grader === "project-brief-plan") {
    const afterHash = await hashFile(path.join(workspace, scenario.primaryFile));
    const lifecyclePhase = String(activePlan?.frontmatter.lifecycle_phase || "").toLowerCase();
    const projectFitSection = extractSection(activePlan?.content || "", "Project Fit");
    const combinedPlanOutput = `${projectFitSection}\n${activePlan?.content || ""}\n${finalMessage}`;
    checks.push({
      label: "project-brief-preserved",
      ok: installState.primaryFileHash === beforeState.primaryFileHash,
      detail: installState.primaryFileHash === beforeState.primaryFileHash ? "existing .local/project.md preserved during install" : ".local/project.md was overwritten during install"
    });
    checks.push({
      label: "project-brief-remains-present",
      ok: Boolean(afterHash),
      detail: afterHash ? ".local/project.md still present after planning" : ".local/project.md missing after planning"
    });
    checks.push({
      label: "project-brief-routes-to-plan",
      ok: lifecyclePhase === "plan",
      detail: lifecyclePhase || "missing lifecycle_phase"
    });
    checks.push({
      label: "build-handoff-set",
      ok: String(activePlan?.frontmatter.next_command || "").toLowerCase() === "build"
        && String(activePlan?.frontmatter.next_mode || "") === "Build",
      detail: `${String(activePlan?.frontmatter.next_command || "<missing>")} / ${String(activePlan?.frontmatter.next_mode || "<missing>")}`
    });
    checks.push({
      label: "project-fit-recorded",
      ok: Boolean(projectFitSection) && /(offline-first|sqlite|without accounts|no auth)/i.test(combinedPlanOutput),
      detail: projectFitSection || "plan did not capture project-brief priorities or guardrails"
    });
    checks.push({
      label: "no-premature-check-claim",
      ok: !/Check:\s*(PASS|BLOCK)/i.test(finalMessage),
      detail: "final message should not pretend implementation or verification already happened"
    });
  }

  if (scenario.grader === "research-alias") {
    const afterHash = await hashFile(path.join(workspace, scenario.primaryFile));
    const lifecyclePhase = String(activePlan?.frontmatter.lifecycle_phase || "").toLowerCase();
    const nextCommand = String(activePlan?.frontmatter.next_command || "").toLowerCase();
    checks.push({
      label: "implementation-blocked",
      ok: afterHash === beforeState.primaryFileHash,
      detail: afterHash === beforeState.primaryFileHash ? "target file unchanged" : "target file was modified"
    });
    checks.push({
      label: "research-alias-routes-to-research",
      ok: lifecyclePhase === "research",
      detail: lifecyclePhase || "missing lifecycle_phase"
    });
    checks.push({
      label: "research-ends-with-next-route",
      ok: ["start", "plan", "fix"].includes(nextCommand),
      detail: nextCommand || "<missing>"
    });
    checks.push({
      label: "no-premature-check-claim",
      ok: !/Check:\s*(PASS|BLOCK)/i.test(finalMessage),
      detail: "final message should not claim validation closeout during research"
    });
  }

  if (scenario.grader === "operational-summary-active-plan") {
    const afterHash = await hashFile(path.join(workspace, scenario.primaryFile));
    const trackedPlanPath = String(scenario.trackedPlanFile || "");
    checks.push({
      label: "active-plan-still-present",
      ok: Boolean(activePlan),
      detail: activePlan ? activePlan.path : "no active plan found"
    });
    checks.push({
      label: "implementation-file-unchanged",
      ok: afterHash === beforeState.primaryFileHash,
      detail: afterHash === beforeState.primaryFileHash ? "target file unchanged" : "target file was modified"
    });
    checks.push({
      label: "active-plan-unchanged",
      ok: finalState.fileHashes[trackedPlanPath] === installState.fileHashes[trackedPlanPath],
      detail: finalState.fileHashes[trackedPlanPath] === installState.fileHashes[trackedPlanPath]
        ? "active plan unchanged"
        : "active plan was mutated"
    });
    checks.push({
      label: "git-state-unchanged",
      ok: hasExactDirtyPaths(finalState.git.dirtyPaths, installState.git.dirtyPaths),
      detail: `${formatDirtyPathDetail(installState.git.dirtyPaths)} => ${formatDirtyPathDetail(finalState.git.dirtyPaths)}`
    });
    checks.push({
      label: "no-premature-check-claim",
      ok: !/Check:\s*(PASS|BLOCK)/i.test(finalMessage),
      detail: "final message should stay lightweight and avoid build/check claims"
    });
  }

  if (scenario.grader === "repo-role-smoke") {
    const repoRole = await detectRepoRole(repoRoot);
    const clientRole = await detectRepoRole(workspace);
    const agentsPath = path.join(workspace, ROOT_AGENTS_PATH);
    const agentsText = fs.existsSync(agentsPath) ? await fsp.readFile(agentsPath, "utf8") : "";
    const projectBriefPath = path.join(workspace, ".local", "project.md");
    const projectBriefText = fs.existsSync(projectBriefPath) ? await fsp.readFile(projectBriefPath, "utf8") : "";
    const clientAgentsExcluded = await hasGitExcludeEntry(workspace, ROOT_AGENTS_PATH);
    const clientInstallMeta = await readInstallMeta(path.join(workspace, ".agents", "skills", "kamiflow-core"));

    checks.push({
      label: "source-repo-detected-as-dogfood",
      ok: repoRole === REPO_ROLE_DOGFOOD,
      detail: repoRole
    });
    checks.push({
      label: "client-temp-repo-detected-as-client",
      ok: clientRole === REPO_ROLE_CLIENT,
      detail: clientRole
    });
    checks.push({
      label: "dogfood-template-selected",
      ok: projectBriefAssetRelativeForRole(repoRole).replaceAll("\\", "/") === "assets/project-brief-dogfood.md",
      detail: projectBriefAssetRelativeForRole(repoRole).replaceAll("\\", "/")
    });
    checks.push({
      label: "client-template-selected",
      ok: projectBriefAssetRelativeForRole(clientRole).replaceAll("\\", "/") === "assets/project-brief-client.md",
      detail: projectBriefAssetRelativeForRole(clientRole).replaceAll("\\", "/")
    });
    checks.push({
      label: "client-agents-created",
      ok: fs.existsSync(agentsPath),
      detail: fs.existsSync(agentsPath) ? "AGENTS.md present" : "AGENTS.md missing"
    });
    checks.push({
      label: "client-agents-state-contract",
      ok: agentsText.includes(".local/project.md") && agentsText.includes(".local/plans/*.md"),
      detail: "generated AGENTS.md must reference project memory and plan state"
    });
    checks.push({
      label: "client-project-brief-created",
      ok: fs.existsSync(projectBriefPath),
      detail: fs.existsSync(projectBriefPath) ? ".local/project.md present" : ".local/project.md missing"
    });
    checks.push({
      label: "client-project-brief-uses-client-template",
      ok: /human-facing product brief for this client repo/i.test(projectBriefText),
      detail: "client project brief should come from the client template"
    });
    checks.push({
      label: "client-agents-excluded-in-git",
      ok: clientAgentsExcluded,
      detail: clientAgentsExcluded ? "AGENTS.md excluded in .git/info/exclude" : "AGENTS.md missing from .git/info/exclude"
    });
    checks.push({
      label: "client-install-meta-present",
      ok: clientInstallMeta.valid,
      detail: clientInstallMeta.valid ? clientInstallMeta.path : clientInstallMeta.reason
    });
    checks.push({
      label: "client-install-meta-profile",
      ok: clientInstallMeta.valid && clientInstallMeta.metadata.runtime_profile === "client-runtime",
      detail: clientInstallMeta.valid ? clientInstallMeta.metadata.runtime_profile : "<missing>"
    });
  }

  if (scenario.grader === "reinstall-idempotence") {
    checks.push({
      label: "second-install-exit-zero",
      ok: reinstallResult.code === 0,
      detail: `exit code ${reinstallResult.code}`
    });
    checks.push({
      label: "runtime-file-set-stable",
      ok: installState.runtimeSkill.files.join("\n") === reinstallState?.runtimeSkill.files.join("\n"),
      detail: installState.runtimeSkill.files.join("\n") === reinstallState?.runtimeSkill.files.join("\n")
        ? "runtime file list unchanged across reinstall"
        : "runtime file list changed across reinstall"
    });
    checks.push({
      label: "runtime-contents-stable",
      ok: installState.runtimeSkill.digest === reinstallState?.runtimeSkill.digest,
      detail: installState.runtimeSkill.digest === reinstallState?.runtimeSkill.digest
        ? "runtime contents unchanged apart from install metadata"
        : "runtime contents changed across reinstall"
    });
    checks.push({
      label: "agents-preserved-on-rerun",
      ok: installState.fileHashes["AGENTS.md"] === reinstallState?.fileHashes["AGENTS.md"],
      detail: installState.fileHashes["AGENTS.md"] === reinstallState?.fileHashes["AGENTS.md"]
        ? "AGENTS.md unchanged on rerun"
        : "AGENTS.md changed on rerun"
    });
    checks.push({
      label: "project-brief-preserved-on-rerun",
      ok: installState.fileHashes[".local/project.md"] === reinstallState?.fileHashes[".local/project.md"],
      detail: installState.fileHashes[".local/project.md"] === reinstallState?.fileHashes[".local/project.md"]
        ? ".local/project.md unchanged on rerun"
        : ".local/project.md changed on rerun"
    });
    checks.push({
      label: "install-meta-present-after-rerun",
      ok: reinstallState?.installMeta.valid === true,
      detail: reinstallState?.installMeta.valid ? reinstallState.installMeta.path : reinstallState?.installMeta.reason || "missing"
    });
  }

  if (scenario.grader === "preserve-existing-agents") {
    const agentsText = fs.existsSync(path.join(workspace, "AGENTS.md")) ? await fsp.readFile(path.join(workspace, "AGENTS.md"), "utf8") : "";
    const agentsExcluded = await hasGitExcludeEntry(workspace, ROOT_AGENTS_PATH);
    checks.push({
      label: "existing-agents-preserved",
      ok: beforeState.fileHashes["AGENTS.md"] === installState.fileHashes["AGENTS.md"],
      detail: beforeState.fileHashes["AGENTS.md"] === installState.fileHashes["AGENTS.md"]
        ? "existing AGENTS.md preserved"
        : "existing AGENTS.md was modified"
    });
    checks.push({
      label: "existing-agents-stays-user-owned",
      ok: !/generated local repo contract for a client repo/i.test(agentsText),
      detail: "installer must not replace user-owned AGENTS.md with the generated template"
    });
    checks.push({
      label: "existing-agents-not-git-excluded",
      ok: !agentsExcluded,
      detail: agentsExcluded ? "existing AGENTS.md should not be auto-excluded" : "existing AGENTS.md left out of .git/info/exclude"
    });
    checks.push({
      label: "install-meta-present",
      ok: installState.installMeta.valid,
      detail: installState.installMeta.valid ? installState.installMeta.path : installState.installMeta.reason
    });
  }

  if (scenario.grader === "preserve-existing-project-brief") {
    checks.push({
      label: "existing-project-brief-preserved",
      ok: beforeState.fileHashes[".local/project.md"] === installState.fileHashes[".local/project.md"],
      detail: beforeState.fileHashes[".local/project.md"] === installState.fileHashes[".local/project.md"]
        ? "existing .local/project.md preserved"
        : "existing .local/project.md was modified"
    });
    checks.push({
      label: "install-meta-present",
      ok: installState.installMeta.valid,
      detail: installState.installMeta.valid ? installState.installMeta.path : installState.installMeta.reason
    });
  }

  if (scenario.grader === "doctor-client-install") {
    checks.push({
      label: "install-meta-present",
      ok: installState.installMeta.valid,
      detail: installState.installMeta.valid ? installState.installMeta.path : installState.installMeta.reason
    });
    checks.push({
      label: "maintainer-doctor-passes",
      ok: doctorResult.code === 0 && /Repo Skill Status:\s*PASS/i.test(doctorResult.stdout),
      detail: doctorResult.code === 0 ? "maintainer doctor reported PASS" : `doctor exit code ${doctorResult.code}`
    });
    checks.push({
      label: "doctor-uses-client-profile",
      ok: /Runtime Profile:\s*client-runtime/i.test(doctorResult.stdout),
      detail: /Runtime Profile:\s*client-runtime/i.test(doctorResult.stdout) ? "doctor reported client-runtime" : "doctor did not report client-runtime"
    });
  }

  if (scenario.grader === "ready-check-placeholder") {
    const readyCheckOutput = `${readyCheckResult.stdout}\n${readyCheckResult.stderr}`;
    checks.push({
      label: "ready-check-blocks-placeholder-plan",
      ok: readyCheckResult.code !== 0,
      detail: `exit code ${readyCheckResult.code}`
    });
    checks.push({
      label: "ready-check-build-ready-false",
      ok: readyCheckPayload?.build_ready === false,
      detail: readyCheckPayload ? `build_ready=${String(readyCheckPayload.build_ready)}` : "ready-check did not return JSON"
    });
    checks.push({
      label: "goal-placeholder-reported",
      ok: /Goal still contains placeholder content/i.test(readyCheckOutput),
      detail: "ready-check should report placeholder Goal content"
    });
    checks.push({
      label: "project-fit-placeholder-reported",
      ok: /Project Fit is missing a concrete priority or guardrail tie-back/i.test(readyCheckOutput),
      detail: "ready-check should report placeholder Project Fit content"
    });
    checks.push({
      label: "validation-placeholder-reported",
      ok: /Validation Commands/i.test(readyCheckOutput),
      detail: "ready-check should report placeholder Validation Commands content"
    });
  }

  if (scenario.grader === "ready-check-build-ready") {
    checks.push({
      label: "ready-check-passes-build-ready-plan",
      ok: readyCheckResult.code === 0,
      detail: `exit code ${readyCheckResult.code}`
    });
    checks.push({
      label: "ready-check-build-ready-true",
      ok: readyCheckPayload?.build_ready === true,
      detail: readyCheckPayload ? `build_ready=${String(readyCheckPayload.build_ready)}` : "ready-check did not return JSON"
    });
    checks.push({
      label: "ready-check-has-no-findings",
      ok: Array.isArray(readyCheckPayload?.findings) && readyCheckPayload.findings.length === 0,
      detail: Array.isArray(readyCheckPayload?.findings) ? `${readyCheckPayload.findings.length} findings` : "ready-check did not return findings"
    });
  }

  if (scenario.grader === "plan-history-archived-plan") {
    const topResult = Array.isArray(planHistoryPayload?.results) ? planHistoryPayload.results[0] : null;
    checks.push({
      label: "plan-history-prefers-archived-release-plan",
      ok: topResult?.source_type === "archived-plan" && topResult?.plan_id === "PLAN-2026-03-23-001",
      detail: topResult ? `${topResult.source_type} / ${topResult.plan_id || "<missing>"}` : "<missing>"
    });
    checks.push({
      label: "plan-history-archived-match-snippet",
      ok: Array.isArray(topResult?.snippets) && topResult.snippets.some((snippet) => /tag command|release-only commit|release history/i.test(String(snippet))),
      detail: Array.isArray(topResult?.snippets) ? topResult.snippets.join(" | ") : "<missing>"
    });
  }

  if (scenario.grader === "plan-history-project-brief") {
    const topResult = Array.isArray(planHistoryPayload?.results) ? planHistoryPayload.results[0] : null;
    checks.push({
      label: "plan-history-prefers-project-brief",
      ok: topResult?.source_type === "project-brief",
      detail: topResult ? topResult.source_type : "<missing>"
    });
    checks.push({
      label: "plan-history-project-brief-section-match",
      ok: Array.isArray(topResult?.matched_sections) && topResult.matched_sections.includes("Current Priorities"),
      detail: Array.isArray(topResult?.matched_sections) ? topResult.matched_sections.join(" | ") : "<missing>"
    });
  }

  if (scenario.grader === "plan-history-active-plan") {
    const topResult = Array.isArray(planHistoryPayload?.results) ? planHistoryPayload.results[0] : null;
    checks.push({
      label: "plan-history-prefers-active-plan",
      ok: topResult?.source_type === "active-plan" && topResult?.plan_id === "PLAN-2026-03-24-001",
      detail: topResult ? `${topResult.source_type} / ${topResult.plan_id || "<missing>"}` : "<missing>"
    });
    checks.push({
      label: "plan-history-active-plan-snippet",
      ok: Array.isArray(topResult?.snippets) && topResult.snippets.some((snippet) => /retrieval helper|bounded matches|snippets/i.test(String(snippet))),
      detail: Array.isArray(topResult?.snippets) ? topResult.snippets.join(" | ") : "<missing>"
    });
  }

  if (scenario.grader === "plan-history-weak-query") {
    checks.push({
      label: "plan-history-weak-query-empty",
      ok: Array.isArray(planHistoryPayload?.results) && planHistoryPayload.results.length === 0,
      detail: Array.isArray(planHistoryPayload?.results) ? `${planHistoryPayload.results.length} results` : "<missing>"
    });
  }

  if (scenario.grader === "finish-status-commit-only") {
    checks.push({
      label: "finish-status-exits-zero",
      ok: finishStatusResult.code === 0,
      detail: `exit code ${finishStatusResult.code}`
    });
    checks.push({
      label: "finish-status-recommends-commit-only",
      ok: finishStatusPayload?.recommended_action === "commit-only",
      detail: finishStatusPayload?.recommended_action || "<missing>"
    });
    checks.push({
      label: "finish-status-release-not-ready",
      ok: finishStatusPayload?.release_ready === false,
      detail: finishStatusPayload ? `release_ready=${String(finishStatusPayload.release_ready)}` : "finish-status did not return JSON"
    });
    checks.push({
      label: "finish-status-blocks-none-impact-release",
      ok: /Release Impact is none/i.test((finishStatusPayload?.release_blockers || []).join(" | ")),
      detail: (finishStatusPayload?.release_blockers || []).join(" | ") || "<missing>"
    });
  }

  if (scenario.grader === "finish-status-release-only") {
    checks.push({
      label: "finish-status-exits-zero",
      ok: finishStatusResult.code === 0,
      detail: `exit code ${finishStatusResult.code}`
    });
    checks.push({
      label: "finish-status-recommends-release-only",
      ok: finishStatusPayload?.recommended_action === "release-only",
      detail: finishStatusPayload?.recommended_action || "<missing>"
    });
    checks.push({
      label: "finish-status-release-ready",
      ok: finishStatusPayload?.release_ready === true,
      detail: finishStatusPayload ? `release_ready=${String(finishStatusPayload.release_ready)}` : "finish-status did not return JSON"
    });
    checks.push({
      label: "finish-status-uses-patch-plan",
      ok: finishStatusPayload?.release_plan?.release_impact === "patch",
      detail: finishStatusPayload?.release_plan?.release_impact || "<missing>"
    });
  }

  if (scenario.grader === "finish-status-commit-and-release") {
    checks.push({
      label: "finish-status-exits-zero",
      ok: finishStatusResult.code === 0,
      detail: `exit code ${finishStatusResult.code}`
    });
    checks.push({
      label: "finish-status-recommends-commit-and-release",
      ok: finishStatusPayload?.recommended_action === "commit-and-release",
      detail: finishStatusPayload?.recommended_action || "<missing>"
    });
    checks.push({
      label: "finish-status-release-blocked-by-dirty-worktree",
      ok: /Git worktree is not clean/i.test((finishStatusPayload?.release_blockers || []).join(" | ")),
      detail: (finishStatusPayload?.release_blockers || []).join(" | ") || "<missing>"
    });
    checks.push({
      label: "finish-status-release-not-ready",
      ok: finishStatusPayload?.release_ready === false,
      detail: finishStatusPayload ? `release_ready=${String(finishStatusPayload.release_ready)}` : "finish-status did not return JSON"
    });
  }

  if (scenario.grader === "finish-status-non-opt-in") {
    checks.push({
      label: "finish-status-exits-zero",
      ok: finishStatusResult.code === 0,
      detail: `exit code ${finishStatusResult.code}`
    });
    checks.push({
      label: "finish-status-keeps-non-opt-in-commit-only",
      ok: finishStatusPayload?.recommended_action === "commit-only",
      detail: finishStatusPayload?.recommended_action || "<missing>"
    });
    checks.push({
      label: "finish-status-release-not-ready",
      ok: finishStatusPayload?.release_ready === false,
      detail: finishStatusPayload ? `release_ready=${String(finishStatusPayload.release_ready)}` : "finish-status did not return JSON"
    });
    checks.push({
      label: "finish-status-reports-semver-disabled",
      ok: /SemVer workflow is disabled/i.test((finishStatusPayload?.release_blockers || []).join(" | ")),
      detail: (finishStatusPayload?.release_blockers || []).join(" | ") || "<missing>"
    });
  }

  if (scenario.grader === "semver-non-opt-in") {
    checks.push({
      label: "archive-without-release-impact-still-passes",
      ok: archivePlanResult.code === 0 && !activePlan && Boolean(latestDonePlan),
      detail: archivePlanResult.code === 0 ? "archive succeeded without SemVer enforcement" : `archive exit code ${archivePlanResult.code}`
    });
    checks.push({
      label: "package-version-unchanged",
      ok: installState.fileHashes["package.json"] === finalState.fileHashes["package.json"],
      detail: installState.fileHashes["package.json"] === finalState.fileHashes["package.json"] ? "package.json unchanged" : "package.json changed"
    });
  }

  if (scenario.grader === "semver-impact-required") {
    const archiveOutput = `${archivePlanResult.stdout}\n${archivePlanResult.stderr}`;
    checks.push({
      label: "archive-blocked-without-release-impact",
      ok: archivePlanResult.code !== 0,
      detail: `archive exit code ${archivePlanResult.code}`
    });
    checks.push({
      label: "release-impact-error-reported",
      ok: /Release Impact/i.test(archiveOutput),
      detail: "archive output should mention missing or unresolved Release Impact"
    });
    checks.push({
      label: "active-plan-remains-present",
      ok: Boolean(activePlan),
      detail: activePlan ? activePlan.path : "active plan missing"
    });
  }

  if (scenario.grader === "semver-none-impact") {
    checks.push({
      label: "none-impact-archives",
      ok: archivePlanResult.code === 0 && !activePlan && Boolean(latestDonePlan),
      detail: archivePlanResult.code === 0 ? "archive succeeded with none impact" : `archive exit code ${archivePlanResult.code}`
    });
    checks.push({
      label: "package-version-unchanged",
      ok: installState.fileHashes["package.json"] === finalState.fileHashes["package.json"],
      detail: installState.fileHashes["package.json"] === finalState.fileHashes["package.json"] ? "package.json unchanged" : "package.json changed"
    });
    checks.push({
      label: "lockfile-unchanged",
      ok: installState.fileHashes["package-lock.json"] === finalState.fileHashes["package-lock.json"],
      detail: installState.fileHashes["package-lock.json"] === finalState.fileHashes["package-lock.json"] ? "package-lock.json unchanged" : "package-lock.json changed"
    });
  }

  if (scenario.grader === "semver-dirty-worktree") {
    checks.push({
      label: "version-closeout-blocks-dirty-worktree",
      ok: versionCloseoutResult.code !== 0,
      detail: `exit code ${versionCloseoutResult.code}`
    });
    checks.push({
      label: "dirty-worktree-error-reported",
      ok: /Git worktree is not clean|Commit the functional changes first/i.test(`${versionCloseoutResult.stdout}\n${versionCloseoutResult.stderr}`),
      detail: "version closeout should tell the user to commit functional changes first"
    });
    checks.push({
      label: "package-version-unchanged",
      ok: installState.fileHashes["package.json"] === finalState.fileHashes["package.json"],
      detail: installState.fileHashes["package.json"] === finalState.fileHashes["package.json"] ? "package.json unchanged" : "package.json changed"
    });
    checks.push({
      label: "lockfile-version-unchanged",
      ok: installState.fileHashes["package-lock.json"] === finalState.fileHashes["package-lock.json"],
      detail: installState.fileHashes["package-lock.json"] === finalState.fileHashes["package-lock.json"] ? "package-lock.json unchanged" : "package-lock.json changed"
    });
  }

  if (scenario.grader === "semver-patch-closeout") {
    checks.push({
      label: "version-closeout-exits-zero",
      ok: versionCloseoutResult.code === 0,
      detail: `exit code ${versionCloseoutResult.code}`
    });
    checks.push({
      label: "patch-bump-computed",
      ok: await readPackageVersion(path.join(workspace, "package.json")) === "0.4.3",
      detail: await readPackageVersion(path.join(workspace, "package.json"))
    });
    checks.push({
      label: "lockfile-version-updated",
      ok: await readPackageLockVersion(path.join(workspace, "package-lock.json")) === "0.4.3",
      detail: await readPackageLockVersion(path.join(workspace, "package-lock.json")) || "<missing>"
    });
    checks.push({
      label: "guided-commit-output-present",
      ok: /git commit -m "release: v0\.4\.3"/i.test(versionCloseoutResult.stdout),
      detail: "version closeout should print the guided release commit command"
    });
    checks.push({
      label: "tag-output-present",
      ok: /git tag v0\.4\.3/i.test(versionCloseoutResult.stdout),
      detail: "version closeout should print the guided release tag command"
    });
    checks.push({
      label: "only-version-files-changed",
      ok: hasExactDirtyPaths(finalState.git.dirtyPaths, ["package.json", "package-lock.json"]),
      detail: formatDirtyPathDetail(finalState.git.dirtyPaths)
    });
  }

  if (scenario.grader === "semver-major-pre1") {
    checks.push({
      label: "version-closeout-exits-zero",
      ok: versionCloseoutResult.code === 0,
      detail: `exit code ${versionCloseoutResult.code}`
    });
    checks.push({
      label: "strict-pre1-major-bump",
      ok: await readPackageVersion(path.join(workspace, "package.json")) === "1.0.0",
      detail: await readPackageVersion(path.join(workspace, "package.json"))
    });
    checks.push({
      label: "guided-commit-output-present",
      ok: /git commit -m "release: v1\.0\.0"/i.test(versionCloseoutResult.stdout),
      detail: "version closeout should print the guided release commit command"
    });
    checks.push({
      label: "tag-output-present",
      ok: /git tag v1\.0\.0/i.test(versionCloseoutResult.stdout),
      detail: "version closeout should print the guided release tag command"
    });
    checks.push({
      label: "only-version-files-changed",
      ok: hasExactDirtyPaths(finalState.git.dirtyPaths, ["package.json", "package-lock.json"]),
      detail: formatDirtyPathDetail(finalState.git.dirtyPaths)
    });
  }

  if (scenario.grader === "semver-no-lockfile") {
    checks.push({
      label: "version-closeout-exits-zero",
      ok: versionCloseoutResult.code === 0,
      detail: `exit code ${versionCloseoutResult.code}`
    });
    checks.push({
      label: "minor-bump-without-lockfile",
      ok: await readPackageVersion(path.join(workspace, "package.json")) === "1.3.0",
      detail: await readPackageVersion(path.join(workspace, "package.json"))
    });
    checks.push({
      label: "missing-lockfile-reported",
      ok: /package-lock\.json \(not present\)/i.test(versionCloseoutResult.stdout),
      detail: "version closeout should report the missing lockfile as skipped"
    });
    checks.push({
      label: "tag-output-present",
      ok: /git tag v1\.3\.0/i.test(versionCloseoutResult.stdout),
      detail: "version closeout should print the guided release tag command"
    });
    checks.push({
      label: "only-version-files-changed",
      ok: hasExactDirtyPaths(finalState.git.dirtyPaths, ["package.json"]),
      detail: formatDirtyPathDetail(finalState.git.dirtyPaths)
    });
  }

  if (scenario.grader === "draft-not-ready") {
    const afterHash = await hashFile(path.join(workspace, scenario.primaryFile));
    checks.push({
      label: "implementation-blocked",
      ok: afterHash === beforeState.primaryFileHash,
      detail: afterHash === beforeState.primaryFileHash ? "target file unchanged" : "target file was modified"
    });
    checks.push({
      label: "readiness-failure-surfaced",
      ok: /ready-check\.mjs|build-ready|decision is not GO|Goal still contains placeholder content|Project Fit is missing a concrete priority or guardrail tie-back|Validation Commands/i.test(finalMessage),
      detail: "final message should mention readiness blocking or the recovery command"
    });
    checks.push({
      label: "no-false-pass",
      ok: !/Check:\s*PASS/i.test(finalMessage),
      detail: "final message should not claim PASS when build readiness failed"
    });
  }

  if (scenario.grader === "small-bug") {
    const checkRun = await runCommand("node", ["check.js"], { cwd: workspace });
    const implementationCounts = countCheckboxes(extractSection(activePlan?.content || "", "Implementation Tasks"));
    checks.push({
      label: "validation-command-passes",
      ok: checkRun.code === 0,
      detail: checkRun.code === 0 ? "node check.js exited 0" : `node check.js exit code ${checkRun.code}`
    });
    checks.push({
      label: "check-pass-reported",
      ok: /Check:\s*PASS/i.test(finalMessage),
      detail: "final message should report Check: PASS"
    });
    checks.push({
      label: "plan-remains-active",
      ok: Boolean(activePlan),
      detail: activePlan ? activePlan.path : "no active plan found"
    });
    checks.push({
      label: "implementation-progress-recorded",
      ok: implementationCounts.checked > 0,
      detail: `${implementationCounts.checked}/${implementationCounts.total} implementation items checked`
    });
    checks.push({
      label: "handoff-set-to-check",
      ok: String(activePlan?.frontmatter.next_command || "").toLowerCase() === "check",
      detail: String(activePlan?.frontmatter.next_command || "<missing>")
    });
  }

  if (scenario.grader === "closeout-check") {
    const checkRun = await runCommand("node", ["check.js"], { cwd: workspace });
    const acceptanceCounts = countCheckboxes(extractSection(latestDonePlan?.content || "", "Acceptance Criteria"));
    const goNoGoCounts = countCheckboxes(extractSection(latestDonePlan?.content || "", "Go/No-Go Checklist"));
    checks.push({
      label: "validation-command-passes",
      ok: checkRun.code === 0,
      detail: checkRun.code === 0 ? "node check.js exited 0" : `node check.js exit code ${checkRun.code}`
    });
    checks.push({
      label: "check-pass-reported",
      ok: /Check:\s*PASS/i.test(finalMessage),
      detail: "final message should report Check: PASS"
    });
    checks.push({
      label: "plan-archived",
      ok: !activePlan && Boolean(latestDonePlan),
      detail: latestDonePlan ? latestDonePlan.path : "no archived PASS plan found"
    });
    checks.push({
      label: "archive-frontmatter-correct",
      ok: String(latestDonePlan?.frontmatter.status || "").toLowerCase() === "done"
        && String(latestDonePlan?.frontmatter.decision || "").toUpperCase() === "PASS"
        && Boolean(latestDonePlan?.frontmatter.archived_at),
      detail: latestDonePlan
        ? `status=${latestDonePlan.frontmatter.status || ""}, decision=${latestDonePlan.frontmatter.decision || ""}`
        : "missing done plan"
    });
    checks.push({
      label: "closeout-checklists-complete",
      ok: acceptanceCounts.total > 0
        && acceptanceCounts.total === acceptanceCounts.checked
        && goNoGoCounts.total > 0
        && goNoGoCounts.total === goNoGoCounts.checked,
      detail: `acceptance ${acceptanceCounts.checked}/${acceptanceCounts.total}, go-no-go ${goNoGoCounts.checked}/${goNoGoCounts.total}`
    });
  }

  if (scenario.grader === "commit-please-active-plan") {
    const trackedPlanPath = String(scenario.trackedPlanFile || "");
    checks.push({
      label: "head-subject-not-baseline",
      ok: finalState.git.headSubject !== String(scenario.baselineCommitMessage || ""),
      detail: finalState.git.headSubject || "<missing>"
    });
    checks.push({
      label: "commit-stays-functional",
      ok: !/^release:\s*v/i.test(finalState.git.headSubject),
      detail: finalState.git.headSubject || "<missing>"
    });
    checks.push({
      label: "no-release-tag-created",
      ok: !finalState.git.tagsAtHead.some((tag) => /^v\d+\.\d+\.\d+$/.test(tag)),
      detail: finalState.git.tagsAtHead.join(" | ") || "none"
    });
    checks.push({
      label: "worktree-clean-after-commit",
      ok: hasExactDirtyPaths(finalState.git.dirtyPaths, []),
      detail: formatDirtyPathDetail(finalState.git.dirtyPaths)
    });
    checks.push({
      label: "package-version-unchanged",
      ok: await readPackageVersion(path.join(workspace, "package.json")) === "0.4.2"
        && await readPackageLockVersion(path.join(workspace, "package-lock.json")) === "0.4.2",
      detail: `package=${await readPackageVersion(path.join(workspace, "package.json")) || "<missing>"}, lock=${await readPackageLockVersion(path.join(workspace, "package-lock.json")) || "<missing>"}`
    });
    checks.push({
      label: "active-plan-unchanged",
      ok: finalState.fileHashes[trackedPlanPath] === installState.fileHashes[trackedPlanPath],
      detail: finalState.fileHashes[trackedPlanPath] === installState.fileHashes[trackedPlanPath]
        ? "active plan unchanged"
        : "active plan was mutated"
    });
    checks.push({
      label: "no-premature-check-claim",
      ok: !/Check:\s*(PASS|BLOCK)/i.test(finalMessage),
      detail: "final message should stay operational and avoid build/check claims"
    });
  }

  if (scenario.grader === "release-please-active-plan") {
    const trackedPlanPath = String(scenario.trackedPlanFile || "");
    checks.push({
      label: "release-commit-created",
      ok: finalState.git.headSubject === "release: v0.4.3",
      detail: finalState.git.headSubject || "<missing>"
    });
    checks.push({
      label: "release-tag-created",
      ok: finalState.git.tagsAtHead.includes("v0.4.3"),
      detail: finalState.git.tagsAtHead.join(" | ") || "none"
    });
    checks.push({
      label: "worktree-clean-after-release",
      ok: hasExactDirtyPaths(finalState.git.dirtyPaths, []),
      detail: formatDirtyPathDetail(finalState.git.dirtyPaths)
    });
    checks.push({
      label: "package-version-bumped",
      ok: await readPackageVersion(path.join(workspace, "package.json")) === "0.4.3"
        && await readPackageLockVersion(path.join(workspace, "package-lock.json")) === "0.4.3",
      detail: `package=${await readPackageVersion(path.join(workspace, "package.json")) || "<missing>"}, lock=${await readPackageLockVersion(path.join(workspace, "package-lock.json")) || "<missing>"}`
    });
    checks.push({
      label: "active-plan-unchanged",
      ok: finalState.fileHashes[trackedPlanPath] === installState.fileHashes[trackedPlanPath],
      detail: finalState.fileHashes[trackedPlanPath] === installState.fileHashes[trackedPlanPath]
        ? "active plan unchanged"
        : "active plan was mutated"
    });
  }

  if (scenario.grader === "finish-please-active-plan") {
    const trackedPlanPath = String(scenario.trackedPlanFile || "");
    const finishDirtyPaths = normalizeDirtyPaths(finalState.git.dirtyPaths);
    checks.push({
      label: "release-tag-created",
      ok: finalState.git.tagsAtHead.includes("v0.4.3"),
      detail: finalState.git.tagsAtHead.join(" | ") || "none"
    });
    checks.push({
      label: "worktree-clean-after-finish",
      ok: hasExactDirtyPaths(finalState.git.dirtyPaths, [])
        || finishDirtyPaths.every((relativePath) => relativePath.startsWith(".local/plans/")),
      detail: formatDirtyPathDetail(finalState.git.dirtyPaths)
    });
    checks.push({
      label: "package-version-bumped",
      ok: await readPackageVersion(path.join(workspace, "package.json")) === "0.4.3"
        && await readPackageLockVersion(path.join(workspace, "package-lock.json")) === "0.4.3",
      detail: `package=${await readPackageVersion(path.join(workspace, "package.json")) || "<missing>"}, lock=${await readPackageLockVersion(path.join(workspace, "package-lock.json")) || "<missing>"}`
    });
    checks.push({
      label: "finish-keeps-valid-plan-state",
      ok: (
        Boolean(activePlan)
        && finalState.fileHashes[trackedPlanPath] === installState.fileHashes[trackedPlanPath]
      ) || (
        !activePlan
        && Boolean(latestDonePlan)
        && String(latestDonePlan.frontmatter.decision || "").toUpperCase() === "PASS"
      ),
      detail: activePlan
        ? "active PASS plan remained in place"
        : latestDonePlan
          ? latestDonePlan.path
          : "no active or archived PASS plan found"
    });
    checks.push({
      label: "finish-status-cleared",
      ok: /no further release closeout is pending|release is already applied at HEAD|already looks released at HEAD|release closeout is already applied at HEAD|no further closeout work is pending|no further finish action is pending|none for this finish action/i.test(finalMessage),
      detail: "final message should confirm that finish-status no longer sees release closeout pending"
    });
  }

  for (const check of checks) {
    if (!check.ok) {
      findings.push(`${check.label}: ${check.detail}`);
    }
  }

  return {
    scenario: scenario.name,
    ok: findings.length === 0,
    summary: findings.length === 0 ? "all grading checks passed" : findings[0],
    checks,
    codex_exit_code: codexResult.code,
    active_plan: activePlan ? summarizePlan(activePlan) : null,
    latest_done_plan: latestDonePlan ? summarizePlan(latestDonePlan) : null
  };
}

async function packRepo(runDir) {
  const packResult = await runCommand("npm", ["pack", "--json"], { cwd: repoRoot });
  if (packResult.code !== 0) {
    throw new Error(`npm pack failed:\n${packResult.stderr || packResult.stdout}`);
  }

  let parsed;
  try {
    parsed = JSON.parse(packResult.stdout.trim());
  } catch (error) {
    throw new Error(`npm pack --json did not return valid JSON: ${error.message}`);
  }

  const fileName = parsed?.[0]?.filename;
  if (!fileName) {
    throw new Error("npm pack --json did not report a tarball filename.");
  }

  const sourceTarball = path.join(repoRoot, fileName);
  const targetTarball = path.join(runDir, fileName);
  await fsp.rename(sourceTarball, targetTarball);
  return targetTarball;
}

async function collectScenarioState(workspace, scenario) {
  const trackedFiles = new Set(Array.isArray(scenario.trackedFiles) ? scenario.trackedFiles : []);
  if (scenario.primaryFile) {
    trackedFiles.add(scenario.primaryFile);
  }
  const fileHashes = {};
  for (const relativePath of trackedFiles) {
    fileHashes[relativePath] = await hashFile(path.join(workspace, relativePath));
  }

  const runtimeSkill = await collectRuntimeSkillState(workspace);
  const installMeta = await readInstallMeta(path.join(workspace, ".agents", "skills", "kamiflow-core"));
  const state = {
    fileHashes,
    runtimeSkill,
    installMeta,
    git: await collectGitState(workspace)
  };
  if (scenario.primaryFile) {
    state.primaryFileHash = fileHashes[scenario.primaryFile] || "";
  }
  return state;
}

async function collectGitState(workspace) {
  return readGitState(workspace);
}

async function collectRuntimeSkillState(workspace) {
  const runtimeSkillDir = path.join(workspace, ".agents", "skills", "kamiflow-core");
  if (!fs.existsSync(runtimeSkillDir)) {
    return {
      exists: false,
      files: [],
      digest: ""
    };
  }

  const files = (await collectRelativeFilePaths(runtimeSkillDir))
    .filter((relativePath) => relativePath !== installMetaRelativePath);

  return {
    exists: true,
    files,
    digest: files.length > 0 ? await hashRelativeFiles(runtimeSkillDir, files) : ""
  };
}

function summarizePlan(plan) {
  return {
    path: plan.path,
    plan_id: plan.frontmatter.plan_id || "",
    lifecycle_phase: plan.frontmatter.lifecycle_phase || "",
    next_command: plan.frontmatter.next_command || "",
    next_mode: plan.frontmatter.next_mode || "",
    status: plan.frontmatter.status || "",
    decision: plan.frontmatter.decision || ""
  };
}

function buildFailureResult(scenarioName, summary, findings) {
  return {
    scenario: scenarioName,
    ok: false,
    summary,
    checks: findings.map((detail) => ({ label: "runner", ok: false, detail }))
  };
}

function renderPrompt(template, values) {
  return template
    .replaceAll("{{PROJECT_DIR}}", values.projectDir)
    .replaceAll("{{SKILL_PATH}}", values.skillPath);
}

function renderSummaryMarkdown(summary) {
  const lines = [
    "# Forward Test Summary",
    "",
    `- Overall: ${summary.ok ? "PASS" : "BLOCK"}`,
    `- Mode: ${summary.mode}`,
    `- Run ID: ${summary.run_id}`,
    `- Tarball: ${summary.tarball}`,
    `- Total Duration: ${formatDuration(summary.timings_ms.total)}`,
    `- Pack Duration: ${formatDuration(summary.timings_ms.pack)}`,
    ""
  ];

  for (const result of summary.results) {
    lines.push(`## ${result.scenario}`);
    lines.push(`- Result: ${result.ok ? "PASS" : "BLOCK"}`);
    lines.push(`- Summary: ${result.summary}`);
    lines.push(`- Total Duration: ${formatDuration(result.timings_ms.total)}`);
    lines.push(`- Install Duration: ${formatDuration(result.timings_ms.install)}`);
    lines.push(`- Codex Duration: ${formatDuration(result.timings_ms.codex)}`);
    for (const check of result.checks) {
      lines.push(`- ${check.ok ? "[x]" : "[ ]"} ${check.label}: ${check.detail}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

async function snapshotWorkspace(sourceDir, targetDir) {
  await fsp.rm(targetDir, { recursive: true, force: true });
  if (!fs.existsSync(sourceDir)) {
    return;
  }
  await fsp.mkdir(path.dirname(targetDir), { recursive: true });
  await fsp.cp(sourceDir, targetDir, { recursive: true, force: true });
}

async function hashFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return "";
  }
  const buffer = await fsp.readFile(filePath);
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

async function writeJson(filePath, payload) {
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  await fsp.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function parseJsonMaybe(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed) {
    return null;
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

async function readPackageVersion(filePath) {
  if (!fs.existsSync(filePath)) {
    return "";
  }
  const parsed = JSON.parse(await fsp.readFile(filePath, "utf8"));
  return String(parsed?.version || "").trim();
}

async function readPackageLockVersion(filePath) {
  if (!fs.existsSync(filePath)) {
    return "";
  }
  const parsed = JSON.parse(await fsp.readFile(filePath, "utf8"));
  return String(parsed?.packages?.[""]?.version || parsed?.version || "").trim();
}

async function createBaselineCommit(workspace, message = "baseline-before-version-closeout") {
  const gitUserName = await runCommand("git", ["config", "user.name", "kamiflow-forward-test"], { cwd: workspace });
  if (gitUserName.code !== 0) {
    return gitUserName;
  }
  const gitUserEmail = await runCommand("git", ["config", "user.email", "forward-test@example.invalid"], { cwd: workspace });
  if (gitUserEmail.code !== 0) {
    return gitUserEmail;
  }
  const gitAdd = await runCommand("git", ["add", "-A"], { cwd: workspace });
  if (gitAdd.code !== 0) {
    return gitAdd;
  }
  return await runCommand("git", ["commit", "-m", message], { cwd: workspace });
}

function hasExactDirtyPaths(actualPaths, expectedPaths) {
  const actual = normalizeDirtyPaths(actualPaths);
  const expected = normalizeDirtyPaths(expectedPaths);
  if (actual.length !== expected.length) {
    return false;
  }
  return actual.every((value, index) => value === expected[index]);
}

function normalizeDirtyPaths(paths) {
  return [...new Set((Array.isArray(paths) ? paths : [])
    .map((value) => String(value || "").replaceAll("\\", "/").trim())
    .filter(Boolean))]
    .sort();
}

function formatDirtyPathDetail(paths) {
  const normalized = normalizeDirtyPaths(paths);
  return normalized.length > 0 ? normalized.join(" | ") : "none";
}

async function hashRelativeFiles(rootDir, relativePaths) {
  const hash = crypto.createHash("sha256");
  for (const relativePath of relativePaths) {
    const buffer = await fsp.readFile(path.join(rootDir, relativePath));
    hash.update(`${relativePath}\n`, "utf8");
    hash.update(buffer);
    hash.update("\n---\n", "utf8");
  }
  return hash.digest("hex");
}

async function safeRevParse(...argsList) {
  const result = await runCommand("git", ["rev-parse", ...argsList], { cwd: repoRoot });
  return result.code === 0 ? result.stdout.trim() : "";
}

function buildRunId() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hour = String(now.getHours()).padStart(2, "0");
  const minute = String(now.getMinutes()).padStart(2, "0");
  const second = String(now.getSeconds()).padStart(2, "0");
  return `${year}${month}${day}-${hour}${minute}${second}`;
}

function formatDuration(durationMs) {
  const safeMs = Math.max(0, Number(durationMs || 0));
  if (safeMs < 1000) {
    return `${safeMs}ms`;
  }
  const totalSeconds = Math.round(safeMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) {
    return `${seconds}s`;
  }
  return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
}

function parseCliArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      continue;
    }
    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      parsed[key] = true;
      continue;
    }
    parsed[key] = next;
    index += 1;
  }
  return parsed;
}

async function runCommand(command, args, options = {}) {
  return await runProcessCommand(command, args, {
    ...options,
    cwd: options.cwd || repoRoot
  });
}
