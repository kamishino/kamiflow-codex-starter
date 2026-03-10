import { spawn } from "node:child_process";

export interface CodexActionInput {
  plan_id: string;
  action_type: "start" | "plan" | "build" | "check" | "research" | "fix";
  mode_hint?: "Plan" | "Build";
  prompt?: string;
  full_auto?: boolean;
  cwd?: string;
}

export interface CodexActionResult {
  status: "completed" | "failed";
  command: string;
  stdout_tail: string;
  stderr_tail: string;
  exit_code: number;
  run_id: string;
  error_code?: "CODEX_NOT_FOUND" | "TIMEOUT" | "SPAWN_FAILED" | "NON_ZERO_EXIT";
  error_class?: "environment" | "configuration" | "timeout" | "runtime" | "unknown";
  recovery_hint?: string;
  failure_signature?: string;
}

const CODEX_ACTION_TIMEOUT_MS = 5 * 60 * 1000;
const CODEX_ACTION_TIMEOUT_ENV = "KFC_PLAN_CODEX_ACTION_TIMEOUT_MS";
const CODEX_EXECUTABLES_ENV = "KFC_PLAN_CODEX_EXECUTABLES";
const REQUEST_USER_INPUT_PATTERN = /\brequest_user_input\b/i;
const PLAN_MODE_NEGOTIATION_ERROR_PATTERNS = [
  "unexpected argument '--profile'",
  "unexpected argument '--config'",
  "unexpected argument '-c'",
  "unknown option '--profile'",
  "unknown option '--config'",
  "unknown option '-c'",
  "no profile named",
  "profile not found",
  "invalid value for '--profile'",
  "unknown field `features.collaboration_modes`",
  "unknown field `features.default_mode_request_user_input`",
  "failed to parse config override"
];

function tail(text: string, maxChars = 4000): string {
  if (text.length <= maxChars) {
    return text;
  }
  return text.slice(text.length - maxChars);
}

function buildReplayArg(arg: string): string {
  const value = String(arg);
  return /^[A-Za-z0-9._/-]+$/.test(value) ? value : JSON.stringify(value);
}

function buildReplayCommand(exe: string, args: string[]): string {
  const executable = String(exe || "codex")
    .replace(/\.cmd$/i, "")
    .replace(/\.exe$/i, "");
  return `${executable} ${args.map((item) => buildReplayArg(item)).join(" ")}`;
}

function parsePositiveInteger(raw: string | undefined): number | null {
  if (!raw || raw.trim().length === 0) {
    return null;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

function resolveCodexActionTimeoutMs(): number {
  return parsePositiveInteger(process.env[CODEX_ACTION_TIMEOUT_ENV]) ?? CODEX_ACTION_TIMEOUT_MS;
}

function applyPlanModePromptHint(prompt: string): string {
  if (REQUEST_USER_INPUT_PATTERN.test(prompt)) {
    return prompt;
  }
  return `${prompt}\n\nIf requirements are unclear, use request_user_input with 1-3 short multiple-choice questions.`;
}

function buildPositionalPromptCommand(prompt: string, fullAuto = false): string {
  const prefix = fullAuto ? "codex exec --full-auto" : "codex exec";
  return `${prefix} ${JSON.stringify(String(prompt || ""))}`;
}

export function shouldPreferPlanInteractiveMode(input: Pick<CodexActionInput, "mode_hint" | "prompt">): boolean {
  if (input.mode_hint === "Plan") {
    return true;
  }
  if (typeof input.prompt === "string" && REQUEST_USER_INPUT_PATTERN.test(input.prompt)) {
    return true;
  }
  return false;
}

export function buildCodexExecArgVariants(input: CodexActionInput): string[][] {
  const defaultVariant = ["exec", ...(input.full_auto ? ["--full-auto"] : []), "-"];
  if (!shouldPreferPlanInteractiveMode(input)) {
    return [defaultVariant];
  }
  return [
    [
      "exec",
      ...(input.full_auto ? ["--full-auto"] : []),
      "--profile",
      "plan",
      "-c",
      "features.collaboration_modes=true",
      "-c",
      "features.default_mode_request_user_input=true",
      "-"
    ],
    [
      "exec",
      ...(input.full_auto ? ["--full-auto"] : []),
      "-c",
      "features.collaboration_modes=true",
      "-c",
      "features.default_mode_request_user_input=true",
      "-"
    ],
    ["exec", ...(input.full_auto ? ["--full-auto"] : []), "--profile", "plan", "-"],
    defaultVariant
  ];
}

function buildPrompt(input: CodexActionInput): string {
  if (input.prompt && input.prompt.trim().length > 0) {
    if (shouldPreferPlanInteractiveMode(input)) {
      return applyPlanModePromptHint(input.prompt);
    }
    return input.prompt;
  }
  const mode = input.mode_hint ? ` Mode: ${input.mode_hint}.` : "";
  const basePrompt = `Plan ${input.plan_id}. Execute action: ${input.action_type}.${mode}`;
  if (shouldPreferPlanInteractiveMode(input)) {
    return applyPlanModePromptHint(basePrompt);
  }
  return basePrompt;
}

function codexExecutableCandidates(): string[] {
  const envCandidates = String(process.env[CODEX_EXECUTABLES_ENV] ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  if (envCandidates.length > 0) {
    return envCandidates;
  }
  if (process.platform !== "win32") {
    return ["codex"];
  }
  return ["codex", "codex.exe", "codex.cmd"];
}

function shouldTryNextCandidate(result: CodexActionResult): boolean {
  if (result.error_code === "CODEX_NOT_FOUND") {
    return true;
  }
  if (result.error_code === "SPAWN_FAILED") {
    const stderr = (result.stderr_tail || "").toLowerCase();
    return stderr.includes("spawn") && (stderr.includes("enoent") || stderr.includes("einval"));
  }
  return false;
}

function isPlanModeNegotiationFailure(result: CodexActionResult): boolean {
  if (result.error_code !== "NON_ZERO_EXIT") {
    return false;
  }
  const stderr = (result.stderr_tail || "").toLowerCase();
  return PLAN_MODE_NEGOTIATION_ERROR_PATTERNS.some((pattern) => stderr.includes(pattern));
}

function firstMeaningfulLine(text: string): string {
  const line = String(text || "")
    .split(/\r?\n/)
    .map((item) => item.trim())
    .find((item) => item.length > 0);
  return line ? (line.length > 180 ? line.slice(0, 177) + "..." : line) : "";
}

export function classifyCodexFailure(
  input: Pick<CodexActionResult, "error_code" | "stderr_tail">
): CodexActionResult["error_class"] {
  if (input.error_code === "CODEX_NOT_FOUND") {
    return "environment";
  }
  if (input.error_code === "TIMEOUT") {
    return "timeout";
  }
  const stderr = String(input.stderr_tail || "").toLowerCase();
  if (input.error_code === "SPAWN_FAILED") {
    if (stderr.includes("enoent") || stderr.includes("einval") || stderr.includes("eperm") || stderr.includes("spawn")) {
      return "environment";
    }
    return "runtime";
  }
  if (input.error_code === "NON_ZERO_EXIT") {
    if (PLAN_MODE_NEGOTIATION_ERROR_PATTERNS.some((pattern) => stderr.includes(pattern))) {
      return "configuration";
    }
    if (stderr.includes("unexpected argument") || stderr.includes("unknown option") || stderr.includes("invalid value")) {
      return "configuration";
    }
    return "runtime";
  }
  return "unknown";
}

function recoveryHintForFailure(errorClass: CodexActionResult["error_class"]): string {
  if (errorClass === "environment") {
    return "Ensure Codex CLI is installed and executable in PATH; retry in a no-profile shell.";
  }
  if (errorClass === "configuration") {
    return "Retry with fallback codex exec args that avoid unsupported profile/config overrides.";
  }
  if (errorClass === "timeout") {
    return "Retry with a narrower action scope or extend timeout budget.";
  }
  if (errorClass === "runtime") {
    return "Inspect stderr_tail, adjust prompt/inputs, and rerun the same action.";
  }
  return "Inspect stderr_tail and route to research if the cause is still unclear.";
}

function withFailureMetadata(result: CodexActionResult): CodexActionResult {
  if (result.status !== "failed") {
    return result;
  }
  const errorClass = classifyCodexFailure(result) || "unknown";
  return {
    ...result,
    error_class: errorClass,
    recovery_hint: recoveryHintForFailure(errorClass),
    failure_signature: firstMeaningfulLine(result.stderr_tail || result.error_code || "unknown failure")
  };
}

function quoteForCmd(arg: string): string {
  if (!/[ \t"&<>|^]/.test(arg)) {
    return arg;
  }
  return `"${arg.replace(/"/g, "\"\"")}"`;
}

async function runWithExecutable(
  exe: string,
  args: string[],
  prompt: string,
  run_id: string,
  cwd: string
): Promise<CodexActionResult> {
  const command = buildReplayCommand(exe, args);
  const useCmdWrapper = process.platform === "win32" && exe.toLowerCase().endsWith(".cmd");

  return await new Promise<CodexActionResult>((resolve) => {
    let stdout = "";
    let stderr = "";
    let child;
    try {
      if (useCmdWrapper) {
        const cmdLine = `${exe} ${args.map(quoteForCmd).join(" ")}`;
        child = spawn("cmd.exe", ["/d", "/s", "/c", cmdLine], {
          cwd,
          stdio: ["pipe", "pipe", "pipe"]
        });
      } else {
        child = spawn(exe, args, {
          cwd,
          stdio: ["pipe", "pipe", "pipe"]
        });
      }
    } catch (err) {
      const spawnErr = err as NodeJS.ErrnoException;
      resolve({
        status: "failed",
        command,
        stdout_tail: "",
        stderr_tail: tail(spawnErr?.message ? String(spawnErr.message) : String(err)),
        exit_code: -1,
        run_id,
        error_code: spawnErr?.code === "ENOENT" ? "CODEX_NOT_FOUND" : "SPAWN_FAILED"
      });
      return;
    }

    let finished = false;
    const timeout = setTimeout(() => {
      if (finished) {
        return;
      }
      finished = true;
      try {
        child.kill();
      } catch {
        // ignore
      }
      resolve({
        status: "failed",
        command,
        stdout_tail: tail(stdout),
        stderr_tail: tail(stderr),
        exit_code: -1,
        run_id,
        error_code: "TIMEOUT"
      });
    }, resolveCodexActionTimeoutMs());

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    if (child.stdin) {
      child.stdin.on("error", (err) => {
        stderr += `\nstdin_error: ${err instanceof Error ? err.message : String(err)}`;
      });
      child.stdin.end(prompt);
    }

    child.on("error", (err: NodeJS.ErrnoException) => {
      if (finished) {
        return;
      }
      finished = true;
      clearTimeout(timeout);
      resolve({
        status: "failed",
        command,
        stdout_tail: tail(stdout),
        stderr_tail: tail(`${stderr}\n${err.message}`),
        exit_code: -1,
        run_id,
        error_code: err.code === "ENOENT" ? "CODEX_NOT_FOUND" : "SPAWN_FAILED"
      });
    });

    child.on("close", (code) => {
      if (finished) {
        return;
      }
      finished = true;
      clearTimeout(timeout);
      resolve({
        status: code === 0 ? "completed" : "failed",
        command,
        stdout_tail: tail(stdout),
        stderr_tail: tail(stderr),
        exit_code: code ?? -1,
        run_id,
        error_code: code === 0 ? undefined : "NON_ZERO_EXIT"
      });
    });
  });
}

export function buildCodexExecManualCommand(input: Pick<CodexActionInput, "prompt" | "full_auto">): string {
  const prompt = String(input.prompt || "").trim();
  if (!prompt) {
    throw new Error("buildCodexExecManualCommand requires prompt.");
  }
  return buildPositionalPromptCommand(prompt, Boolean(input.full_auto));
}

export async function runCodexAction(input: CodexActionInput): Promise<CodexActionResult> {
  const prompt = buildPrompt(input);
  const argVariants = buildCodexExecArgVariants(input);
  const run_id = `run_${Date.now()}`;
  const cwd = String(input.cwd || "").trim() || process.cwd();
  const candidates = codexExecutableCandidates();
  let lastResult: CodexActionResult | null = null;

  for (const exe of candidates) {
    let moveToNextExecutable = false;
    for (let index = 0; index < argVariants.length; index += 1) {
      const args = argVariants[index];
      const result = withFailureMetadata(await runWithExecutable(exe, args, prompt, run_id, cwd));
      lastResult = result;
      if (result.status === "completed") {
        return result;
      }
      if (shouldTryNextCandidate(result)) {
        moveToNextExecutable = true;
        break;
      }
      const hasMoreVariants = index < argVariants.length - 1;
      if (hasMoreVariants && isPlanModeNegotiationFailure(result)) {
        continue;
      }
      return result;
    }
    if (!moveToNextExecutable && lastResult) {
      return lastResult;
    }
  }

  const fallbackArgs = argVariants[argVariants.length - 1] ?? ["exec", "-"];
  return (
    lastResult ??
    withFailureMetadata({
      status: "failed",
      command: buildPositionalPromptCommand(prompt, Boolean(input.full_auto)),
      stdout_tail: "",
      stderr_tail: "No executable candidate available.",
      exit_code: -1,
      run_id,
      error_code: "CODEX_NOT_FOUND"
    })
  );
}
