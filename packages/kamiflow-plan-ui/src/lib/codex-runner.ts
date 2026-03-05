import { spawn } from "node:child_process";

export interface CodexActionInput {
  plan_id: string;
  action_type: "start" | "plan" | "build" | "check" | "research" | "fix";
  mode_hint?: "Plan" | "Build";
  prompt?: string;
}

export interface CodexActionResult {
  status: "completed" | "failed";
  command: string;
  stdout_tail: string;
  stderr_tail: string;
  exit_code: number;
  run_id: string;
  error_code?: "CODEX_NOT_FOUND" | "TIMEOUT" | "SPAWN_FAILED" | "NON_ZERO_EXIT";
}

const CODEX_ACTION_TIMEOUT_MS = 5 * 60 * 1000;
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

function applyPlanModePromptHint(prompt: string): string {
  if (REQUEST_USER_INPUT_PATTERN.test(prompt)) {
    return prompt;
  }
  return `${prompt}\n\nIf requirements are unclear, use request_user_input with 1-3 short multiple-choice questions.`;
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
  const defaultVariant = ["exec", "-"];
  if (!shouldPreferPlanInteractiveMode(input)) {
    return [defaultVariant];
  }
  return [
    [
      "exec",
      "--profile",
      "plan",
      "-c",
      "features.collaboration_modes=true",
      "-c",
      "features.default_mode_request_user_input=true",
      "-"
    ],
    ["exec", "-c", "features.collaboration_modes=true", "-c", "features.default_mode_request_user_input=true", "-"],
    ["exec", "--profile", "plan", "-"],
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
  run_id: string
): Promise<CodexActionResult> {
  const command = `${exe} ${args.map((item) => JSON.stringify(item)).join(" ")} <stdin>`;
  const useCmdWrapper = process.platform === "win32" && exe.toLowerCase().endsWith(".cmd");

  return await new Promise<CodexActionResult>((resolve) => {
    let stdout = "";
    let stderr = "";
    let child;
    try {
      if (useCmdWrapper) {
        const cmdLine = `${exe} ${args.map(quoteForCmd).join(" ")}`;
        child = spawn("cmd.exe", ["/d", "/s", "/c", cmdLine], {
          stdio: ["pipe", "pipe", "pipe"]
        });
      } else {
        child = spawn(exe, args, {
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
    }, CODEX_ACTION_TIMEOUT_MS);

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

export async function runCodexAction(input: CodexActionInput): Promise<CodexActionResult> {
  const prompt = buildPrompt(input);
  const argVariants = buildCodexExecArgVariants(input);
  const run_id = `run_${Date.now()}`;
  const candidates = codexExecutableCandidates();
  let lastResult: CodexActionResult | null = null;

  for (const exe of candidates) {
    let moveToNextExecutable = false;
    for (let index = 0; index < argVariants.length; index += 1) {
      const args = argVariants[index];
      const result = await runWithExecutable(exe, args, prompt, run_id);
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
    lastResult ?? {
      status: "failed",
      command: `codex ${fallbackArgs.map((item) => JSON.stringify(item)).join(" ")}`,
      stdout_tail: "",
      stderr_tail: "No executable candidate available.",
      exit_code: -1,
      run_id,
      error_code: "CODEX_NOT_FOUND"
    }
  );
}
