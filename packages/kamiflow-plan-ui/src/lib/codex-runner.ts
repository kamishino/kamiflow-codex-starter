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
  const args = ["exec", "-"];
  const run_id = `run_${Date.now()}`;
  const candidates = codexExecutableCandidates();
  let lastResult: CodexActionResult | null = null;

  for (const exe of candidates) {
    const result = await runWithExecutable(exe, args, prompt, run_id);
    lastResult = result;
    if (result.status === "completed") {
      return result;
    }
    if (!shouldTryNextCandidate(result)) {
      return result;
    }
  }

  return (
    lastResult ?? {
      status: "failed",
      command: `codex ${args.map((item) => JSON.stringify(item)).join(" ")}`,
      stdout_tail: "",
      stderr_tail: "No executable candidate available.",
      exit_code: -1,
      run_id,
      error_code: "CODEX_NOT_FOUND"
    }
  );
}
