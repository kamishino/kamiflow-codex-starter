function markdownEscapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractSection(markdown, heading) {
  const escaped = markdownEscapeRegExp(heading);
  const re = new RegExp(`(^|\\r?\\n)##\\s+${escaped}\\s*\\r?\\n([\\s\\S]*?)(?=\\r?\\n##\\s+|$)`, "i");
  const match = String(markdown || "").match(re);
  return match ? match[2].trim() : "";
}

function parseBulletLines(sectionMarkdown) {
  return String(sectionMarkdown || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "))
    .map((line) => line.slice(2).trim())
    .filter(Boolean);
}

function parseChecklistItems(sectionMarkdown) {
  return String(sectionMarkdown || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .map((line) => line.match(/^- \[(?<state>[ xX])\]\s*(?<text>.+)$/))
    .filter(Boolean)
    .map((match) => ({
      checked: String(match.groups?.state || " ").toLowerCase() === "x",
      text: String(match.groups?.text || "").trim()
    }));
}

function parseKeyValueLines(sectionMarkdown) {
  const out = {};
  for (const line of String(sectionMarkdown || "").split(/\r?\n/)) {
    const match = line.trim().match(/^- (?<key>[^:]+):\s*(?<value>.*)$/);
    if (!match) {
      continue;
    }
    out[String(match.groups?.key || "").trim().toLowerCase()] = String(match.groups?.value || "").trim();
  }
  return out;
}

function isPlaceholder(value) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    return true;
  }
  if (/^(tbd|todo|n\/a|na|unknown|none)$/i.test(normalized)) {
    return true;
  }
  if (/^(task|criterion|command)\s+\d+$/i.test(normalized)) {
    return true;
  }
  return false;
}

function hasFileLevelHint(text) {
  const value = String(text || "");
  return (
    /[a-zA-Z]:\\|\/|\\/.test(value) ||
    /\.[a-z0-9]{1,8}\b/i.test(value) ||
    /`[^`]+\.[a-z0-9]{1,8}`/i.test(value)
  );
}

function looksRunnableCommand(text) {
  const value = String(text || "").trim();
  if (!value || isPlaceholder(value)) {
    return false;
  }
  return /^(npm|npx|node|kfc|kf|git|pnpm|yarn|python|pytest|cargo|go)\b/i.test(value);
}

function updateFrontmatterField(markdown, key, value) {
  const text = String(markdown || "");
  if (!text.startsWith("---")) {
    return text;
  }
  const lines = text.split(/\r?\n/);
  let endIdx = -1;
  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i].trim() === "---") {
      endIdx = i;
      break;
    }
  }
  if (endIdx === -1) {
    return text;
  }

  const targetPrefix = `${key}:`;
  let found = false;
  for (let i = 1; i < endIdx; i += 1) {
    if (lines[i].trim().startsWith(targetPrefix)) {
      lines[i] = `${key}: ${value}`;
      found = true;
      break;
    }
  }
  if (!found) {
    lines.splice(endIdx, 0, `${key}: ${value}`);
  }
  return lines.join("\n");
}

function updateWipField(markdown, key, value) {
  const sectionName = "WIP Log";
  const current = extractSection(markdown, sectionName);
  if (!current) {
    return markdown;
  }
  const lines = current.split(/\r?\n/);
  const prefix = `- ${key}:`;
  let found = false;
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i].trim().startsWith(prefix)) {
      lines[i] = `${prefix} ${value}`;
      found = true;
      break;
    }
  }
  if (!found) {
    lines.push(`${prefix} ${value}`);
  }
  const escaped = markdownEscapeRegExp(sectionName);
  const re = new RegExp(`(^|\\r?\\n)##\\s+${escaped}\\s*\\r?\\n([\\s\\S]*?)(?=\\r?\\n##\\s+|$)`, "i");
  return String(markdown).replace(re, (full, lead) => `${lead}## ${sectionName}\n${lines.join("\n").trimEnd()}\n`);
}

export function toIsoTimestamp() {
  return new Date().toISOString();
}

export function toNextAction(summary) {
  const next = summary?.next_command || "plan";
  if (next === "build") {
    return "Implement the next scoped task and record validation outcomes in the plan.";
  }
  if (next === "check") {
    return "Verify acceptance criteria, list findings by severity, and decide PASS or BLOCK.";
  }
  if (next === "fix") {
    return "Address the highest-severity finding, rerun validations, then run check again.";
  }
  if (next === "done") {
    return "Finalize the task handoff and archive the completed plan.";
  }
  if (next === "plan") {
    return "Refine plan scope, tasks, and acceptance criteria until decision is GO.";
  }
  return "Continue the workflow using the plan's next command.";
}

export function normalizeBlockers(reason, findings = []) {
  const parts = [reason, ...(Array.isArray(findings) ? findings : [])]
    .map((item) => String(item || "").trim())
    .filter(Boolean);
  const compact = [];
  for (const part of parts) {
    if (!compact.includes(part)) {
      compact.push(part);
    }
  }
  const joined = compact.join(" | ");
  if (joined.length <= 600) {
    return joined;
  }
  return `${joined.slice(0, 597)}...`;
}

export function evaluateArchiveGate(markdown) {
  const acceptance = parseChecklistItems(extractSection(markdown, "Acceptance Criteria"));
  const goNoGo = parseChecklistItems(extractSection(markdown, "Go/No-Go Checklist"));
  const acceptanceReady = acceptance.length > 0 && acceptance.every((item) => item.checked);
  const goNoGoReady = goNoGo.length > 0 && goNoGo.every((item) => item.checked);
  const ready = acceptanceReady && goNoGoReady;
  return {
    ready,
    acceptance_ready: acceptanceReady,
    go_no_go_ready: goNoGoReady
  };
}

export function buildPhaseDigest(planRecord) {
  const fm = planRecord?.frontmatter || {};
  const wip = parseKeyValueLines(extractSection(planRecord?.raw || "", "WIP Log"));
  return {
    lifecycle_phase: fm.lifecycle_phase || "unknown",
    status: fm.status || "unknown",
    decision: fm.decision || "unknown",
    selected_mode: fm.selected_mode || "unknown",
    next_command: fm.next_command || "unknown",
    next_mode: fm.next_mode || "unknown",
    updated_at: fm.updated_at || "",
    wip_status: wip.status || "",
    blockers: wip.blockers || "",
    next_step: wip["next step"] || "",
    next_action_human: toNextAction({ next_command: fm.next_command || "plan" })
  };
}

export function applyLifecycleMutation(markdown, mutation) {
  let next = String(markdown || "");
  const frontmatter = mutation?.frontmatter && typeof mutation.frontmatter === "object" ? mutation.frontmatter : {};
  for (const [key, value] of Object.entries(frontmatter)) {
    if (value === undefined || value === null) {
      continue;
    }
    next = updateFrontmatterField(next, key, String(value));
  }

  const wip = mutation?.wip && typeof mutation.wip === "object" ? mutation.wip : {};
  if (Object.prototype.hasOwnProperty.call(wip, "status")) {
    next = updateWipField(next, "Status", String(wip.status ?? ""));
  }
  if (Object.prototype.hasOwnProperty.call(wip, "blockers")) {
    next = updateWipField(next, "Blockers", String(wip.blockers ?? ""));
  }
  if (Object.prototype.hasOwnProperty.call(wip, "next_step")) {
    next = updateWipField(next, "Next step", String(wip.next_step ?? ""));
  }

  return next;
}

export function evaluateBuildReadiness(planRecord) {
  const findings = [];
  const fm = planRecord.frontmatter || {};
  const markdown = planRecord.raw || "";

  if (String(fm.decision || "").toUpperCase() !== "GO") {
    findings.push("decision must be GO.");
  }
  if (String(fm.next_command || "").toLowerCase() !== "build") {
    findings.push("next_command must be build.");
  }
  if (String(fm.next_mode || "") !== "Build") {
    findings.push("next_mode must be Build.");
  }

  const startSummary = parseKeyValueLines(extractSection(markdown, "Start Summary"));
  if (Object.keys(startSummary).length === 0) {
    findings.push("Start Summary section is missing.");
  } else {
    const required = String(startSummary.required || "").toLowerCase();
    const reason = startSummary.reason || "";
    if (required !== "yes" && required !== "no") {
      findings.push("Start Summary Required must be yes|no.");
    }
    if (isPlaceholder(reason)) {
      findings.push("Start Summary Reason is placeholder.");
    }
    if (required === "yes") {
      if (isPlaceholder(startSummary["selected idea"] || "")) {
        findings.push("Start Summary Selected Idea is placeholder.");
      }
      if (isPlaceholder(startSummary["handoff confidence"] || "")) {
        findings.push("Start Summary Handoff Confidence is placeholder.");
      }
    }
  }

  const openDecisionsSection = extractSection(markdown, "Open Decisions");
  if (!openDecisionsSection) {
    findings.push("Open Decisions section is missing.");
  } else {
    const unresolvedItems = parseChecklistItems(openDecisionsSection).filter((item) => !item.checked);
    const remainingCountMatch = openDecisionsSection.match(/Remaining Count:\s*(\d+)/i);
    const remainingCount = remainingCountMatch ? Number(remainingCountMatch[1]) : unresolvedItems.length;
    if (remainingCount > 0 || unresolvedItems.length > 0) {
      findings.push("Open Decisions has unresolved items.");
    }
  }

  const taskItems = parseChecklistItems(extractSection(markdown, "Implementation Tasks"));
  if (taskItems.length === 0) {
    findings.push("Implementation Tasks must contain checklist items.");
  } else {
    const invalidTasks = taskItems.filter((item) => isPlaceholder(item.text) || !hasFileLevelHint(item.text));
    if (invalidTasks.length > 0) {
      findings.push("Implementation Tasks must be concrete and file-level.");
    }
  }

  const acItems = parseChecklistItems(extractSection(markdown, "Acceptance Criteria"));
  if (acItems.length === 0) {
    findings.push("Acceptance Criteria must contain checklist items.");
  } else if (acItems.some((item) => isPlaceholder(item.text))) {
    findings.push("Acceptance Criteria includes placeholder entries.");
  }

  const validationCommands = parseBulletLines(extractSection(markdown, "Validation Commands"));
  if (validationCommands.length === 0) {
    findings.push("Validation Commands section is empty.");
  } else if (validationCommands.some((command) => !looksRunnableCommand(command))) {
    findings.push("Validation Commands must be runnable commands in this repo.");
  }

  return {
    ready: findings.length === 0,
    findings
  };
}
