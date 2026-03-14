export const CLIENT_ONBOARDING_CODES = Object.freeze({
  PREFLIGHT_FAILED: "CLIENT_PREFLIGHT_FAILED",
  PACKAGE_JSON_MISSING: "CLIENT_PACKAGE_JSON_MISSING",
  CONFIG_INVALID: "CLIENT_CONFIG_INVALID",
  PLAN_UI_MISSING: "CLIENT_PLAN_UI_MISSING",
  RULES_SYNC_FAILED: "CLIENT_RULES_SYNC_FAILED",
  SKILL_SYNC_FAILED: "CLIENT_SKILL_SYNC_FAILED",
  PRIVATE_STATE_FAILED: "CLIENT_PRIVATE_STATE_FAILED",
  DOCTOR_FAILED: "CLIENT_DOCTOR_FAILED",
  ENSURE_PLAN_FAILED: "CLIENT_ENSURE_PLAN_FAILED",
  PLAN_VALIDATE_FAILED: "CLIENT_PLAN_VALIDATE_FAILED",
  HEALTHCHECK_FAILED: "CLIENT_HEALTHCHECK_FAILED",
  READY_FILE_EXISTS: "CLIENT_READY_FILE_EXISTS",
  READY_ARTIFACT_FAILED: "CLIENT_READY_ARTIFACT_FAILED",
  CODEX_LAUNCH_FAILED: "CLIENT_CODEX_LAUNCH_FAILED",
  SETUP_INCOMPLETE: "CLIENT_SETUP_INCOMPLETE",
  AUTO_CLEANUP_FAILED: "CLIENT_AUTO_CLEANUP_FAILED",
  SMART_RECOVERY_FAILED: "CLIENT_SMART_RECOVERY_FAILED",
  BOOTSTRAP_FAILED: "CLIENT_BOOTSTRAP_FAILED",
  PASS: "CLIENT_ONBOARDING_PASS",
  PASS_RECOVERED: "CLIENT_ONBOARDING_PASS_RECOVERED"
});

export const CLIENT_ONBOARDING_STAGES = Object.freeze({
  INIT: "init",
  INSPECT: "inspect",
  BOOTSTRAP: "bootstrap",
  READY_BRIEF: "ready_brief",
  PLAN_READY: "plan_ready",
  EXECUTION_READY: "execution_ready",
  BLOCKED: "blocked",
  DONE: "done"
});

type ClientOnboardingCode = (typeof CLIENT_ONBOARDING_CODES)[keyof typeof CLIENT_ONBOARDING_CODES];
type ClientOnboardingStage = (typeof CLIENT_ONBOARDING_STAGES)[keyof typeof CLIENT_ONBOARDING_STAGES];

type ClientOnboardingError = Error & {
  code?: string;
  recovery?: string;
  next?: string;
  stage?: string;
};

type ClientOnboardingFailureInput = {
  message?: unknown;
  code?: unknown;
  recovery?: unknown;
  stage?: unknown;
  next?: unknown;
};

type ClientOnboardingPassOptions = {
  recoveryUsed?: boolean;
  stage?: ClientOnboardingStage;
  reason?: string;
  recovery?: string;
  next?: string;
  next_steps?: string[];
};

type ClientCommandContext = {
  projectDir?: string;
};

function normalizeMessage(value) {
  return String(value || "").trim();
}

function shellEscape(value: string): string {
  const text = String(value || "");
  return /\s|["']/.test(text) ? JSON.stringify(text) : text;
}

function normalizeProjectDir(value: unknown): string {
  return String(value || "").trim();
}

function buildCommand(command: string, context: ClientCommandContext = {}, args: string[] = []) {
  const projectDir = normalizeProjectDir(context.projectDir);
  const parts = [command];
  if (projectDir) {
    parts.push("--project", shellEscape(projectDir));
  }
  return [...parts, ...args].map((item) => String(item)).join(" ");
}

function injectProjectTarget(commandText: string, context: ClientCommandContext = {}) {
  const normalized = normalizeMessage(commandText);
  const projectDir = normalizeProjectDir(context.projectDir);
  if (!normalized || !projectDir || normalized.includes("--project")) {
    return normalized;
  }
  const prefixes = [
    "kfc client bootstrap",
    "kfc client doctor",
    "kfc client done",
    "kfc client update",
    "kfc client",
    "kfc flow ensure-plan",
    "kfc flow ready",
    "kfc flow next",
    "kfc plan validate"
  ];
  for (const prefix of prefixes) {
    if (normalized === prefix) {
      return `${prefix} --project ${shellEscape(projectDir)}`;
    }
    if (normalized.startsWith(`${prefix} `)) {
      return `${prefix} --project ${shellEscape(projectDir)} ${normalized.slice(prefix.length + 1)}`.trim();
    }
  }
  return normalized;
}

function defaultPassNextSteps(context: ClientCommandContext = {}) {
  return [
    buildCommand("kfc flow ensure-plan", context),
    buildCommand("kfc flow ready", context),
    buildCommand("kfc flow next", context, ["--plan", "<plan-id>", "--style", "narrative"])
  ];
}

function normalizeStage(value: unknown): ClientOnboardingStage {
  const normalized = String(value || "").trim().toLowerCase();
  if ((Object.values(CLIENT_ONBOARDING_STAGES) as string[]).includes(normalized)) {
    return normalized as ClientOnboardingStage;
  }
  return CLIENT_ONBOARDING_STAGES.BOOTSTRAP;
}

export function createClientOnboardingError(
  code: ClientOnboardingCode,
  reason: unknown,
  recovery?: string,
  options: { next?: string; stage?: ClientOnboardingStage } = {}
): ClientOnboardingError {
  const err = new Error(normalizeMessage(reason) || "Client onboarding failed.") as ClientOnboardingError;
  err.code = code;
  if (recovery) {
    err.recovery = String(recovery);
  }
  if (options.next) {
    err.next = String(options.next);
  }
  if (options.stage) {
    err.stage = String(options.stage);
  }
  return err;
}

function stageForCode(code: string): ClientOnboardingStage {
  if (
    code === CLIENT_ONBOARDING_CODES.PREFLIGHT_FAILED ||
    code === CLIENT_ONBOARDING_CODES.PACKAGE_JSON_MISSING ||
    code === CLIENT_ONBOARDING_CODES.CONFIG_INVALID ||
    code === CLIENT_ONBOARDING_CODES.PLAN_UI_MISSING ||
    code === CLIENT_ONBOARDING_CODES.RULES_SYNC_FAILED ||
    code === CLIENT_ONBOARDING_CODES.SKILL_SYNC_FAILED ||
    code === CLIENT_ONBOARDING_CODES.PRIVATE_STATE_FAILED ||
    code === CLIENT_ONBOARDING_CODES.DOCTOR_FAILED ||
    code === CLIENT_ONBOARDING_CODES.HEALTHCHECK_FAILED
  ) {
    return CLIENT_ONBOARDING_STAGES.BOOTSTRAP;
  }
  if (code === CLIENT_ONBOARDING_CODES.ENSURE_PLAN_FAILED || code === CLIENT_ONBOARDING_CODES.PLAN_VALIDATE_FAILED) {
    return CLIENT_ONBOARDING_STAGES.PLAN_READY;
  }
  if (code === CLIENT_ONBOARDING_CODES.READY_FILE_EXISTS || code === CLIENT_ONBOARDING_CODES.READY_ARTIFACT_FAILED) {
    return CLIENT_ONBOARDING_STAGES.READY_BRIEF;
  }
  if (
    code === CLIENT_ONBOARDING_CODES.CODEX_LAUNCH_FAILED ||
    code === CLIENT_ONBOARDING_CODES.SETUP_INCOMPLETE ||
    code === CLIENT_ONBOARDING_CODES.AUTO_CLEANUP_FAILED
  ) {
    return CLIENT_ONBOARDING_STAGES.EXECUTION_READY;
  }
  return CLIENT_ONBOARDING_STAGES.BLOCKED;
}

function nextForStage(stage, context: ClientCommandContext = {}) {
  if (stage === CLIENT_ONBOARDING_STAGES.PLAN_READY) {
    return buildCommand("kfc flow ensure-plan", context);
  }
  if (stage === CLIENT_ONBOARDING_STAGES.READY_BRIEF) {
    return "Read AGENTS.md first, then read .kfc/CODEX_READY.md and execute the mission.";
  }
  if (stage === CLIENT_ONBOARDING_STAGES.EXECUTION_READY) {
    return defaultPassNextSteps(context)[0];
  }
  if (stage === CLIENT_ONBOARDING_STAGES.DONE) {
    return buildCommand("kfc client done", context);
  }
  return buildCommand("kfc client doctor", context, ["--fix"]);
}

function recoveryForCode(code: string, context: ClientCommandContext = {}): string {
  if (code === CLIENT_ONBOARDING_CODES.PACKAGE_JSON_MISSING) {
    return "npm init -y";
  }
  if (code === CLIENT_ONBOARDING_CODES.READY_FILE_EXISTS) {
    return buildCommand("kfc client done", context);
  }
  if (code === CLIENT_ONBOARDING_CODES.CODEX_LAUNCH_FAILED) {
    return buildCommand("kfc client", context);
  }
  if (code === CLIENT_ONBOARDING_CODES.SETUP_INCOMPLETE) {
    return buildCommand("kfc client", context);
  }
  if (code === CLIENT_ONBOARDING_CODES.AUTO_CLEANUP_FAILED) {
    return buildCommand("kfc client done", context);
  }
  if (code === CLIENT_ONBOARDING_CODES.ENSURE_PLAN_FAILED) {
    return buildCommand("kfc flow ensure-plan", context);
  }
  if (code === CLIENT_ONBOARDING_CODES.PLAN_VALIDATE_FAILED) {
    return buildCommand("kfc plan validate", context);
  }
  if (code === CLIENT_ONBOARDING_CODES.SKILL_SYNC_FAILED) {
    return buildCommand("kfc client bootstrap", context, ["--force"]);
  }
  if (code === CLIENT_ONBOARDING_CODES.PRIVATE_STATE_FAILED) {
    return buildCommand("kfc client bootstrap", context, ["--force"]);
  }
  if (code === CLIENT_ONBOARDING_CODES.HEALTHCHECK_FAILED) {
    return buildCommand("kfc client bootstrap", context, ["--force", "--skip-serve-check"]);
  }
  return buildCommand("kfc client doctor", context, ["--fix"]);
}

function codeFromMessage(message) {
  const text = normalizeMessage(message).toLowerCase();
  if (!text) {
    return CLIENT_ONBOARDING_CODES.BOOTSTRAP_FAILED;
  }
  if (text.includes("missing package.json")) return CLIENT_ONBOARDING_CODES.PACKAGE_JSON_MISSING;
  if (text.includes("preflight")) return CLIENT_ONBOARDING_CODES.PREFLIGHT_FAILED;
  if (text.includes("config validation failed") || text.includes("config check failed")) {
    return CLIENT_ONBOARDING_CODES.CONFIG_INVALID;
  }
  if (text.includes("plan ui")) return CLIENT_ONBOARDING_CODES.PLAN_UI_MISSING;
  if (text.includes("rules")) return CLIENT_ONBOARDING_CODES.RULES_SYNC_FAILED;
  if (text.includes("skill")) return CLIENT_ONBOARDING_CODES.SKILL_SYNC_FAILED;
  if (text.includes("gitignore") || text.includes("lesson")) return CLIENT_ONBOARDING_CODES.PRIVATE_STATE_FAILED;
  if (text.includes("`kfc doctor` failed")) return CLIENT_ONBOARDING_CODES.DOCTOR_FAILED;
  if (text.includes("`kfc flow ensure-plan` failed")) return CLIENT_ONBOARDING_CODES.ENSURE_PLAN_FAILED;
  if (text.includes("`kfc plan validate` failed")) return CLIENT_ONBOARDING_CODES.PLAN_VALIDATE_FAILED;
  if (text.includes("health check failed")) return CLIENT_ONBOARDING_CODES.HEALTHCHECK_FAILED;
  if (text.includes("ready file already exists")) return CLIENT_ONBOARDING_CODES.READY_FILE_EXISTS;
  if (text.includes("codex auto-run failed")) return CLIENT_ONBOARDING_CODES.CODEX_LAUNCH_FAILED;
  if (text.includes("setup completion is still incomplete")) return CLIENT_ONBOARDING_CODES.SETUP_INCOMPLETE;
  if (text.includes("automatic cleanup failed")) return CLIENT_ONBOARDING_CODES.AUTO_CLEANUP_FAILED;
  return CLIENT_ONBOARDING_CODES.BOOTSTRAP_FAILED;
}

export function classifyClientOnboardingFailure(
  input: ClientOnboardingFailureInput | ClientOnboardingError | unknown,
  context: ClientCommandContext = {}
) {
  const candidate = (input && typeof input === "object" ? input : {}) as ClientOnboardingFailureInput;
  const reason = normalizeMessage(candidate.message || String(input || "Client onboarding failed."));
  const explicitCode = normalizeMessage(candidate.code || "");
  const code = (explicitCode && explicitCode.startsWith("CLIENT_") ? explicitCode : codeFromMessage(reason)) as ClientOnboardingCode;
  const recovery = injectProjectTarget(normalizeMessage(candidate.recovery || ""), context) || recoveryForCode(code, context);
  const stage = normalizeStage(candidate.stage || stageForCode(code));
  const next = injectProjectTarget(normalizeMessage(candidate.next || ""), context) || recovery;
  return {
    status: "BLOCK",
    stage,
    error_code: code,
    reason,
    recovery,
    next
  };
}

export function buildClientOnboardingPassPayload(
  options: boolean | ClientOnboardingPassOptions = false,
  context: ClientCommandContext = {}
) {
  const normalized = typeof options === "boolean" ? { recoveryUsed: options } : options;
  const recoveryUsed = normalized.recoveryUsed === true;
  const stage = normalizeStage(normalized.stage || CLIENT_ONBOARDING_STAGES.EXECUTION_READY);
  const nextSteps = Array.isArray(normalized.next_steps) && normalized.next_steps.length > 0
    ? normalized.next_steps.map((step) => injectProjectTarget(normalizeMessage(step), context)).filter(Boolean)
    : defaultPassNextSteps(context);
  const next = injectProjectTarget(normalizeMessage(normalized.next || nextSteps[0]), context) || nextForStage(stage, context);
  return {
    status: "PASS",
    stage,
    error_code: recoveryUsed ? CLIENT_ONBOARDING_CODES.PASS_RECOVERED : CLIENT_ONBOARDING_CODES.PASS,
    reason: normalizeMessage(normalized.reason) || (
      recoveryUsed
        ? "Client onboarding completed after one smart-recovery cycle."
        : "Client onboarding completed without remediation."
    ),
    recovery: normalizeMessage(normalized.recovery || "None") || "None",
    next,
    next_steps: nextSteps
  };
}

export function buildClientOnboardingProgressPayload(stage, reason, next = "", context: ClientCommandContext = {}) {
  const normalizedStage = normalizeStage(stage);
  return {
    status: "RUNNING",
    stage: normalizedStage,
    error_code: "CLIENT_ONBOARDING_PROGRESS",
    reason: normalizeMessage(reason) || "Client onboarding in progress.",
    recovery: "None",
    next: injectProjectTarget(normalizeMessage(next), context) || nextForStage(normalizedStage, context)
  };
}
