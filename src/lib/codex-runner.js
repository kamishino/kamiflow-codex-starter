import { spawn } from "node:child_process";

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;
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

function tail(text, maxChars = 4000) {
  const value = String(text || "");
  if (value.length <= maxChars) {
    return value;
  }
  return value.slice(value.length - maxChars);
}

function firstMeaningfulLine(text) {
  const line = String(text || "")
    .split(/\r?\n/)
    .map((item) => item.trim())
    .find((item) => item.length > 0);
  return line ? (line.length > 180 ? `${line.slice(0, 177)}...` : line) : "";
}

function quoteForCmd(arg) {
  if (!/[ \t"&<>|^]/.test(arg)) {
    return arg;
  }
  return `"${arg.replace(/"/g, "\"\"")}"`;
}

function buildPositionalPromptCommand(prompt, fullAuto = false) {
  const prefix = fullAuto ? "codex exec --full-auto" : "codex exec";
  return `${prefix} ${JSON.stringify(String(prompt || ""))}`;
}

function buildResumePromptCommand(sessionId, prompt, fullAuto = false) {
  const prefix = fullAuto ? "codex exec --full-auto" : "codex exec";
  return `${prefix} resume ${JSON.stringify(String(sessionId || ""))} ${JSON.stringify(String(prompt || ""))}`;
}

function codexExecutableCandidates() {
  if (process.platform !== "win32") {
    return ["codex"];
  }
  return ["codex", "codex.exe", "codex.cmd"];
}

function buildArgVariants(modeHint, fullAuto = false) {
  const defaultVariant = ["exec", ...(fullAuto ? ["--full-auto"] : []), "-"];
  if (String(modeHint || "") !== "Plan") {
    return [defaultVariant];
  }
  return [
    [
      "exec",
      ...(fullAuto ? ["--full-auto"] : []),
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
      ...(fullAuto ? ["--full-auto"] : []),
      "-c",
      "features.collaboration_modes=true",
      "-c",
      "features.default_mode_request_user_input=true",
      "-"
    ],
    ["exec", ...(fullAuto ? ["--full-auto"] : []), "--profile", "plan", "-"],
    defaultVariant
  ];
}

function shouldTryNextExecutable(result) {
  if (result.error_code === "CODEX_NOT_FOUND") {
    return true;
  }
  if (result.error_code === "SPAWN_FAILED") {
    const stderr = String(result.stderr_tail || "").toLowerCase();
    return stderr.includes("spawn") && (stderr.includes("enoent") || stderr.includes("einval"));
  }
  return false;
}

function isPlanModeNegotiationFailure(result) {
  if (result.error_code !== "NON_ZERO_EXIT") {
    return false;
  }
  const stderr = String(result.stderr_tail || "").toLowerCase();
  return PLAN_MODE_NEGOTIATION_ERROR_PATTERNS.some((pattern) => stderr.includes(pattern));
}

function classifyFailure(result) {
  if (result.error_code === "CODEX_NOT_FOUND") {
    return "environment";
  }
  if (result.error_code === "TIMEOUT") {
    return "timeout";
  }
  const stderr = String(result.stderr_tail || "").toLowerCase();
  if (result.error_code === "SPAWN_FAILED") {
    if (stderr.includes("enoent") || stderr.includes("einval") || stderr.includes("eperm") || stderr.includes("spawn")) {
      return "environment";
    }
    return "runtime";
  }
  if (result.error_code === "NON_ZERO_EXIT") {
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

function recoveryHintForClass(errorClass) {
  if (errorClass === "environment") {
    return "Ensure Codex CLI is installed and executable in PATH; retry in a no-profile shell.";
  }
  if (errorClass === "configuration") {
    return "Retry with fallback codex exec args that avoid unsupported profile/config overrides.";
  }
  if (errorClass === "timeout") {
    return "Retry with a narrower action scope or increase timeout budget.";
  }
  if (errorClass === "runtime") {
    return "Inspect stderr_tail, refine prompt scope, and rerun the same route.";
  }
  return "Inspect stderr_tail and route to research if cause is still unclear.";
}

function withFailureMetadata(result) {
  if (result.status !== "failed") {
    return result;
  }
  const errorClass = classifyFailure(result);
  return {
    ...result,
    error_class: errorClass,
    recovery_hint: recoveryHintForClass(errorClass),
    failure_signature: firstMeaningfulLine(result.stderr_tail || result.error_code || "unknown failure")
  };
}

async function runWithExecutable(executable, args, prompt, runId, timeoutMs, cwd = process.cwd(), promptMode = "stdin") {
  const command = `${executable} ${args.map((item) => JSON.stringify(item)).join(" ")}${promptMode === "stdin" ? " <stdin>" : ""}`;
  const useCmdWrapper = process.platform === "win32" && executable.toLowerCase().endsWith(".cmd");

  return await new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let child;

    try {
      if (useCmdWrapper) {
        const cmdLine = `${executable} ${args.map(quoteForCmd).join(" ")}`;
        child = spawn("cmd.exe", ["/d", "/s", "/c", cmdLine], {
          cwd,
          stdio: ["pipe", "pipe", "pipe"]
        });
      } else {
        child = spawn(executable, args, {
          cwd,
          stdio: ["pipe", "pipe", "pipe"]
        });
      }
    } catch (err) {
      resolve({
        status: "failed",
        command,
        stdout_tail: "",
        stderr_tail: tail(err?.message || String(err)),
        exit_code: -1,
        run_id: runId,
        error_code: err?.code === "ENOENT" ? "CODEX_NOT_FOUND" : "SPAWN_FAILED"
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
        // no-op
      }
      resolve({
        status: "failed",
        command,
        stdout_tail: tail(stdout),
        stderr_tail: tail(stderr),
        exit_code: -1,
        run_id: runId,
        error_code: "TIMEOUT"
      });
    }, timeoutMs);

    child.stdout?.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr?.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.stdin?.on("error", (err) => {
      stderr += `\nstdin_error: ${err instanceof Error ? err.message : String(err)}`;
    });
    child.stdin?.end(promptMode === "stdin" ? prompt : undefined);

    child.on("error", (err) => {
      if (finished) {
        return;
      }
      finished = true;
      clearTimeout(timeout);
      resolve({
        status: "failed",
        command,
        stdout_tail: tail(stdout),
        stderr_tail: tail(`${stderr}\n${err?.message || String(err)}`),
        exit_code: -1,
        run_id: runId,
        error_code: err?.code === "ENOENT" ? "CODEX_NOT_FOUND" : "SPAWN_FAILED"
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
        run_id: runId,
        error_code: code === 0 ? undefined : "NON_ZERO_EXIT"
      });
    });
  });
}

export function buildCodexExecManualCommand(input) {
  const prompt = String(input?.prompt || "").trim();
  if (!prompt) {
    throw new Error("buildCodexExecManualCommand requires prompt.");
  }
  return buildPositionalPromptCommand(prompt, Boolean(input?.full_auto));
}

export function buildCodexResumeManualCommand(input) {
  const sessionId = String(input?.session_id || "").trim();
  const prompt = String(input?.prompt || "").trim();
  if (!sessionId) {
    throw new Error("buildCodexResumeManualCommand requires session_id.");
  }
  if (!prompt) {
    throw new Error("buildCodexResumeManualCommand requires prompt.");
  }
  return buildResumePromptCommand(sessionId, prompt, Boolean(input?.full_auto));
}

export async function runCodexAction(input) {
  const planId = String(input?.plan_id || "").trim();
  const actionType = String(input?.action_type || "").trim();
  if (!planId) {
    throw new Error("runCodexAction requires plan_id.");
  }
  if (!actionType) {
    throw new Error("runCodexAction requires action_type.");
  }

  const prompt = String(input?.prompt || "").trim();
  if (!prompt) {
    throw new Error("runCodexAction requires prompt.");
  }

  const timeoutMs = Number.isInteger(input?.timeout_ms) && input.timeout_ms > 0
    ? input.timeout_ms
    : DEFAULT_TIMEOUT_MS;
  const runId = String(input?.run_id || `run_${Date.now()}`);
  const modeHint = String(input?.mode_hint || "");
  const fullAuto = Boolean(input?.full_auto);
  const cwd = String(input?.cwd || "").trim() || process.cwd();
  const argVariants = buildArgVariants(modeHint, fullAuto);
  const executables = codexExecutableCandidates();
  let lastResult = null;

  for (const executable of executables) {
    let moveToNextExecutable = false;
    for (let idx = 0; idx < argVariants.length; idx += 1) {
      const args = argVariants[idx];
      const result = withFailureMetadata(
        await runWithExecutable(executable, args, prompt, runId, timeoutMs, cwd)
      );
      lastResult = result;
      if (result.status === "completed") {
        return result;
      }
      if (shouldTryNextExecutable(result)) {
        moveToNextExecutable = true;
        break;
      }
      const hasMoreVariants = idx < argVariants.length - 1;
      if (hasMoreVariants && isPlanModeNegotiationFailure(result)) {
        continue;
      }
      return result;
    }
    if (!moveToNextExecutable && lastResult) {
      return lastResult;
    }
  }

  const fallbackArgs = argVariants[argVariants.length - 1] || ["exec", "-"];
  return withFailureMetadata(
    lastResult || {
      status: "failed",
      command: buildPositionalPromptCommand(prompt, fullAuto),
      stdout_tail: "",
      stderr_tail: "No executable candidate available.",
      exit_code: -1,
      run_id: runId,
      error_code: "CODEX_NOT_FOUND"
    }
  );
}

export async function runCodexResumeAction(input) {
  const planId = String(input?.plan_id || "").trim();
  const actionType = String(input?.action_type || "").trim();
  const sessionId = String(input?.session_id || "").trim();
  const prompt = String(input?.prompt || "").trim();
  if (!planId) {
    throw new Error("runCodexResumeAction requires plan_id.");
  }
  if (!actionType) {
    throw new Error("runCodexResumeAction requires action_type.");
  }
  if (!sessionId) {
    throw new Error("runCodexResumeAction requires session_id.");
  }
  if (!prompt) {
    throw new Error("runCodexResumeAction requires prompt.");
  }

  const timeoutMs = Number.isInteger(input?.timeout_ms) && input.timeout_ms > 0
    ? input.timeout_ms
    : DEFAULT_TIMEOUT_MS;
  const runId = String(input?.run_id || `run_${Date.now()}`);
  const cwd = String(input?.cwd || "").trim() || process.cwd();
  const fullAuto = Boolean(input?.full_auto);
  const args = ["exec", ...(fullAuto ? ["--full-auto"] : []), "resume", sessionId, prompt];
  const executables = codexExecutableCandidates();
  let lastResult = null;

  for (const executable of executables) {
    const result = withFailureMetadata(
      await runWithExecutable(executable, args, "", runId, timeoutMs, cwd, "argv")
    );
    lastResult = result;
    if (result.status === "completed") {
      return result;
    }
    if (shouldTryNextExecutable(result)) {
      continue;
    }
    return result;
  }

  return withFailureMetadata(
    lastResult || {
      status: "failed",
      command: buildResumePromptCommand(sessionId, prompt, fullAuto),
      stdout_tail: "",
      stderr_tail: "No executable candidate available.",
      exit_code: -1,
      run_id: runId,
      error_code: "CODEX_NOT_FOUND"
    }
  );
}
