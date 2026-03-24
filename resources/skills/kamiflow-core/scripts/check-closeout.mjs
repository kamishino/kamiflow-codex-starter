#!/usr/bin/env node
import {
  archivePassPlan,
  assessPlanCloseout,
  parseCliArgs,
  printJson,
  readReleasePolicy,
  resolvePlanRef,
  resolveProjectDir
} from "./lib-plan.mjs";
import { runShellCommand } from "./lib-process.mjs";

const DEFAULT_TIMEOUT_MS = 120000;
const MAX_OUTPUT_LENGTH = 4000;

const args = parseCliArgs(process.argv.slice(2));
const projectDir = resolveProjectDir(String(args.project || "."));
const requestedPlan = String(args.plan || "").trim();
const format = String(args.format || "json").trim().toLowerCase();
const archiveIfPass = Boolean(args["archive-if-pass"]);
const timeoutMs = normalizeTimeoutMs(args["timeout-ms"]);

const plan = await resolvePlanRef(projectDir, requestedPlan);
if (!plan) {
  emitAndExit({
    ok: false,
    check: "BLOCK",
    archived: false,
    reason: "No active plan matched the requested reference.",
    recovery: "node .agents/skills/kamiflow-core/scripts/ensure-plan.mjs --project ."
  }, format, 1);
}

const releasePolicy = await readReleasePolicy(projectDir);
const closeout = assessPlanCloseout(plan, releasePolicy);

if (!closeout.ok) {
  emitAndExit({
    ok: false,
    check: "BLOCK",
    archived: false,
    plan_id: plan.frontmatter.plan_id || "",
    plan_path: plan.path,
    findings: closeout.findings,
    validation_commands: closeout.validation_commands,
    release_impact: closeout.release_impact,
    reason: closeout.findings[0],
    recovery: "Resolve checklist, validation-command, or Release Impact gates before retrying closeout."
  }, format, 1);
}

const commandResults = [];
let blockedByCommand = false;
for (const commandText of closeout.validation_commands) {
  const result = await runShellCommand(commandText, {
    cwd: projectDir,
    timeoutMs
  });
  const normalized = {
    command: commandText,
    ok: result.code === 0 && !result.timedOut,
    code: result.code,
    timed_out: result.timedOut,
    signal: result.signal || "",
    stdout: trimOutput(result.stdout),
    stderr: trimOutput(result.stderr)
  };
  commandResults.push(normalized);
  if (!normalized.ok) {
    blockedByCommand = true;
    break;
  }
}

if (blockedByCommand) {
  const failedCommand = commandResults.find((result) => !result.ok);
  emitAndExit({
    ok: false,
    check: "BLOCK",
    archived: false,
    plan_id: plan.frontmatter.plan_id || "",
    plan_path: plan.path,
    findings: [
      failedCommand?.timed_out
        ? `Validation command timed out: ${failedCommand.command}`
        : `Validation command failed: ${failedCommand?.command || "unknown"}`
    ],
    validation_results: commandResults,
    release_impact: closeout.release_impact,
    reason: failedCommand?.timed_out
      ? `Validation command timed out: ${failedCommand.command}`
      : `Validation command failed: ${failedCommand?.command || "unknown"}`,
    recovery: "Fix the failing validation command or plan content, then rerun check-closeout.mjs."
  }, format, 1);
}

let archiveResult = null;
if (archiveIfPass) {
  try {
    archiveResult = await archivePassPlan(projectDir, plan);
  } catch (error) {
    emitAndExit({
      ok: false,
      check: "BLOCK",
      archived: false,
      plan_id: plan.frontmatter.plan_id || "",
      plan_path: plan.path,
      findings: [error.message],
      validation_results: commandResults,
      release_impact: closeout.release_impact,
      reason: error.message,
      recovery: "Resolve the archive collision or conflicting done plan before retrying with --archive-if-pass."
    }, format, 1);
  }
}

emitAndExit({
  ok: true,
  check: "PASS",
  archived: Boolean(archiveResult),
  plan_id: plan.frontmatter.plan_id || "",
  plan_path: plan.path,
  validation_results: commandResults,
  release_impact: closeout.release_impact,
  ...(archiveResult ? {
    archived_at: archiveResult.archived_at,
    archived_path: archiveResult.archived_path,
    rolled_over: archiveResult.rolled_over
  } : {}),
  reason: archiveResult
    ? "Closeout checks passed and the plan was archived."
    : "Closeout checks passed."
}, format, 0);

function normalizeTimeoutMs(rawValue) {
  const parsed = Number.parseInt(String(rawValue || ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_MS;
}

function trimOutput(text) {
  const normalized = String(text || "").trim();
  if (!normalized) {
    return "";
  }
  if (normalized.length <= MAX_OUTPUT_LENGTH) {
    return normalized;
  }
  return `${normalized.slice(0, MAX_OUTPUT_LENGTH - 3)}...`;
}

function emitAndExit(payload, outputFormat, exitCode) {
  if (outputFormat === "text") {
    console.log(renderText(payload));
  } else {
    printJson(payload);
  }
  process.exit(exitCode);
}

function renderText(payload) {
  const lines = [
    `Check: ${payload.check || "BLOCK"}`,
    `Archived: ${payload.archived ? "yes" : "no"}`,
    ...(payload.plan_id ? [`Plan ID: ${payload.plan_id}`] : []),
    ...(payload.plan_path ? [`Plan Path: ${payload.plan_path}`] : []),
    `Reason: ${payload.reason || "Unknown"}`
  ];

  if (Array.isArray(payload.findings) && payload.findings.length > 0) {
    lines.push("Findings:");
    for (const finding of payload.findings) {
      lines.push(`- ${finding}`);
    }
  }

  if (Array.isArray(payload.validation_results) && payload.validation_results.length > 0) {
    lines.push("Validation Results:");
    for (const result of payload.validation_results) {
      lines.push(`- ${result.ok ? "PASS" : "BLOCK"} | ${result.command}`);
    }
  }

  if (payload.archived_path) {
    lines.push(`Archived Path: ${payload.archived_path}`);
  }
  if (Array.isArray(payload.rolled_over) && payload.rolled_over.length > 0) {
    lines.push("Rolled Over:");
    for (const rolledOverPath of payload.rolled_over) {
      lines.push(`- ${rolledOverPath}`);
    }
  }

  return lines.join("\n");
}
