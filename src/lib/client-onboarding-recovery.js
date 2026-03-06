export const CLIENT_ONBOARDING_CODES = Object.freeze({
  PREFLIGHT_FAILED: "CLIENT_PREFLIGHT_FAILED",
  CONFIG_INVALID: "CLIENT_CONFIG_INVALID",
  PLAN_UI_MISSING: "CLIENT_PLAN_UI_MISSING",
  RULES_SYNC_FAILED: "CLIENT_RULES_SYNC_FAILED",
  SKILL_SYNC_FAILED: "CLIENT_SKILL_SYNC_FAILED",
  DOCTOR_FAILED: "CLIENT_DOCTOR_FAILED",
  ENSURE_PLAN_FAILED: "CLIENT_ENSURE_PLAN_FAILED",
  PLAN_VALIDATE_FAILED: "CLIENT_PLAN_VALIDATE_FAILED",
  HEALTHCHECK_FAILED: "CLIENT_HEALTHCHECK_FAILED",
  READY_FILE_EXISTS: "CLIENT_READY_FILE_EXISTS",
  READY_ARTIFACT_FAILED: "CLIENT_READY_ARTIFACT_FAILED",
  SMART_RECOVERY_FAILED: "CLIENT_SMART_RECOVERY_FAILED",
  BOOTSTRAP_FAILED: "CLIENT_BOOTSTRAP_FAILED",
  PASS: "CLIENT_ONBOARDING_PASS",
  PASS_RECOVERED: "CLIENT_ONBOARDING_PASS_RECOVERED"
});

export const CLIENT_ONBOARDING_STAGES = Object.freeze({
  INIT: "init",
  BOOTSTRAP: "bootstrap",
  READY_BRIEF: "ready_brief",
  PLAN_READY: "plan_ready",
  EXECUTION_READY: "execution_ready",
  BLOCKED: "blocked",
  DONE: "done"
});

const PASS_NEXT_STEPS = Object.freeze([
  "kfc flow ensure-plan --project .",
  "kfc flow ready --project .",
  "kfc flow next --project . --plan <plan-id> --style narrative"
]);

function normalizeMessage(value) {
  return String(value || "").trim();
}

function normalizeStage(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (Object.values(CLIENT_ONBOARDING_STAGES).includes(normalized)) {
    return normalized;
  }
  return CLIENT_ONBOARDING_STAGES.BOOTSTRAP;
}

export function createClientOnboardingError(code, reason, recovery) {
  const err = new Error(normalizeMessage(reason) || "Client onboarding failed.");
  err.code = code;
  if (recovery) {
    err.recovery = String(recovery);
  }
  return err;
}

function stageForCode(code) {
  if (
    code === CLIENT_ONBOARDING_CODES.PREFLIGHT_FAILED ||
    code === CLIENT_ONBOARDING_CODES.CONFIG_INVALID ||
    code === CLIENT_ONBOARDING_CODES.PLAN_UI_MISSING ||
    code === CLIENT_ONBOARDING_CODES.RULES_SYNC_FAILED ||
    code === CLIENT_ONBOARDING_CODES.SKILL_SYNC_FAILED ||
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
  return CLIENT_ONBOARDING_STAGES.BLOCKED;
}

function nextForStage(stage) {
  if (stage === CLIENT_ONBOARDING_STAGES.PLAN_READY) {
    return "kfc flow ensure-plan --project .";
  }
  if (stage === CLIENT_ONBOARDING_STAGES.READY_BRIEF) {
    return "Read .kfc/CODEX_READY.md and execute the mission.";
  }
  if (stage === CLIENT_ONBOARDING_STAGES.EXECUTION_READY) {
    return PASS_NEXT_STEPS[0];
  }
  if (stage === CLIENT_ONBOARDING_STAGES.DONE) {
    return "kfc client done";
  }
  return "kfc client doctor --project . --fix";
}

function recoveryForCode(code) {
  if (code === CLIENT_ONBOARDING_CODES.READY_FILE_EXISTS) {
    return "kfc client done --project .";
  }
  if (code === CLIENT_ONBOARDING_CODES.ENSURE_PLAN_FAILED) {
    return "kfc flow ensure-plan --project .";
  }
  if (code === CLIENT_ONBOARDING_CODES.PLAN_VALIDATE_FAILED) {
    return "kfc plan validate --project .";
  }
  if (code === CLIENT_ONBOARDING_CODES.SKILL_SYNC_FAILED) {
    return "kfc client bootstrap --project . --force";
  }
  if (code === CLIENT_ONBOARDING_CODES.HEALTHCHECK_FAILED) {
    return "kfc client bootstrap --project . --force --skip-serve-check";
  }
  return "kfc client doctor --project . --fix";
}

function codeFromMessage(message) {
  const text = normalizeMessage(message).toLowerCase();
  if (!text) {
    return CLIENT_ONBOARDING_CODES.BOOTSTRAP_FAILED;
  }
  if (text.includes("preflight")) return CLIENT_ONBOARDING_CODES.PREFLIGHT_FAILED;
  if (text.includes("config validation failed") || text.includes("config check failed")) {
    return CLIENT_ONBOARDING_CODES.CONFIG_INVALID;
  }
  if (text.includes("plan ui")) return CLIENT_ONBOARDING_CODES.PLAN_UI_MISSING;
  if (text.includes("rules")) return CLIENT_ONBOARDING_CODES.RULES_SYNC_FAILED;
  if (text.includes("skill")) return CLIENT_ONBOARDING_CODES.SKILL_SYNC_FAILED;
  if (text.includes("`kfc doctor` failed")) return CLIENT_ONBOARDING_CODES.DOCTOR_FAILED;
  if (text.includes("`kfc flow ensure-plan` failed")) return CLIENT_ONBOARDING_CODES.ENSURE_PLAN_FAILED;
  if (text.includes("`kfc plan validate` failed")) return CLIENT_ONBOARDING_CODES.PLAN_VALIDATE_FAILED;
  if (text.includes("health check failed")) return CLIENT_ONBOARDING_CODES.HEALTHCHECK_FAILED;
  if (text.includes("ready file already exists")) return CLIENT_ONBOARDING_CODES.READY_FILE_EXISTS;
  return CLIENT_ONBOARDING_CODES.BOOTSTRAP_FAILED;
}

export function classifyClientOnboardingFailure(input) {
  const reason = normalizeMessage(input?.message || String(input || "Client onboarding failed."));
  const explicitCode = normalizeMessage(input?.code || "");
  const code = explicitCode && explicitCode.startsWith("CLIENT_") ? explicitCode : codeFromMessage(reason);
  const recovery = normalizeMessage(input?.recovery || "") || recoveryForCode(code);
  const stage = normalizeStage(input?.stage || stageForCode(code));
  const next = normalizeMessage(input?.next || "") || recovery;
  return {
    status: "BLOCK",
    stage,
    error_code: code,
    reason,
    recovery,
    next
  };
}

export function buildClientOnboardingPassPayload(recoveryUsed = false) {
  return {
    status: "PASS",
    stage: CLIENT_ONBOARDING_STAGES.EXECUTION_READY,
    error_code: recoveryUsed ? CLIENT_ONBOARDING_CODES.PASS_RECOVERED : CLIENT_ONBOARDING_CODES.PASS,
    reason: recoveryUsed
      ? "Client onboarding completed after one smart-recovery cycle."
      : "Client onboarding completed without remediation.",
    recovery: "None",
    next: nextForStage(CLIENT_ONBOARDING_STAGES.EXECUTION_READY),
    next_steps: [...PASS_NEXT_STEPS]
  };
}

export function buildClientOnboardingProgressPayload(stage, reason, next = "") {
  const normalizedStage = normalizeStage(stage);
  return {
    status: "RUNNING",
    stage: normalizedStage,
    error_code: "CLIENT_ONBOARDING_PROGRESS",
    reason: normalizeMessage(reason) || "Client onboarding in progress.",
    recovery: "None",
    next: normalizeMessage(next) || nextForStage(normalizedStage)
  };
}
