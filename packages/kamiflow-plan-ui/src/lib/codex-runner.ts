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

function tail(text: string, maxChars = 4000): string {
  if (text.length <= maxChars) {
    return text;
  }
  return text.slice(text.length - maxChars);
}

function buildPrompt(input: CodexActionInput): string {
  if (input.prompt && input.prompt.trim().length > 0) {
    return input.prompt;
  }
  const mode = input.mode_hint ? ` Mode: ${input.mode_hint}.` : "";
  return `Plan ${input.plan_id}. Execute action: ${input.action_type}.${mode}`;
}

export async function runCodexAction(input: CodexActionInput): Promise<CodexActionResult> {
  const prompt = buildPrompt(input);
  const exe = process.platform === "win32" ? "codex.cmd" : "codex";
  const args = ["exec", prompt];
  const run_id = `run_${Date.now()}`;
  const command = `${exe} ${args.map((item) => JSON.stringify(item)).join(" ")}`;

  return await new Promise<CodexActionResult>((resolve) => {
    let stdout = "";
    let stderr = "";
    const child = spawn(exe, args, {
      stdio: ["ignore", "pipe", "pipe"]
    });

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
    }, 60_000);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

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
