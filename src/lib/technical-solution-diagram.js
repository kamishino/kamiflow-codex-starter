const SECTION_CANDIDATES = [
  "Technical Solution Diagram",
  "Solution Diagram",
  "Technical Solution",
  "Implementation Flow"
];

function resolveDiagramMode(markdown) {
  const text = String(markdown || "");
  if (!text.startsWith("---")) {
    return "required";
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
    return "required";
  }
  for (let i = 1; i < endIdx; i += 1) {
    const trimmed = lines[i].trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const sep = trimmed.indexOf(":");
    if (sep <= 0) {
      continue;
    }
    const key = trimmed.slice(0, sep).trim().toLowerCase();
    if (key !== "diagram_mode") {
      continue;
    }
    const value = trimmed.slice(sep + 1).trim().replace(/^['"]|['"]$/g, "").toLowerCase();
    if (value === "auto" || value === "hidden" || value === "required") {
      return value;
    }
    return "required";
  }
  return "required";
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractSection(markdown, heading) {
  const escaped = escapeRegExp(heading);
  const re = new RegExp(`(^|\\r?\\n)##\\s+${escaped}\\s*\\r?\\n([\\s\\S]*?)(?=\\r?\\n##\\s+|$)`, "i");
  const match = String(markdown || "").match(re);
  return match ? match[2].trim() : "";
}

function hasExistingTechnicalSection(markdown) {
  const text = String(markdown || "");
  return SECTION_CANDIDATES.some((heading) => {
    const escaped = escapeRegExp(heading);
    return new RegExp(`(^|\\r?\\n)##\\s+${escaped}\\s*(\\r?\\n|$)`, "i").test(text);
  });
}

function sanitizeLabel(value) {
  return String(value || "")
    .replace(/\r?\n+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/"/g, '\\"')
    .slice(0, 80);
}

function parseChecklistLines(sectionText) {
  const out = [];
  for (const line of String(sectionText || "").split(/\r?\n/)) {
    const match = line.match(/^\s*- \[(?<state>[ xX])\]\s*(?<text>.+)$/);
    if (!match?.groups?.text) {
      continue;
    }
    const label = sanitizeLabel(match.groups.text);
    if (!label) {
      continue;
    }
    out.push({
      checked: String(match.groups.state || " ").toLowerCase() === "x",
      label
    });
  }
  return out;
}

function buildMermaid(title, markdown) {
  const safeTitle = sanitizeLabel(title) || "Selected Solution";
  const tasks = parseChecklistLines(extractSection(markdown, "Implementation Tasks")).slice(0, 4);
  const lines = ["flowchart LR", `  IDEA["${safeTitle}"] --> PLAN["Implementation Plan"]`];
  if (!tasks.length) {
    lines.push('  PLAN --> BUILD["Build Slice"] --> CHECK["Check Acceptance"]');
    return lines.join("\n");
  }
  let previous = "PLAN";
  for (let i = 0; i < tasks.length; i += 1) {
    const task = tasks[i];
    const nodeId = `T${i + 1}`;
    const prefix = task.checked ? "DONE: " : "TODO: ";
    lines.push(`  ${nodeId}["${sanitizeLabel(prefix + task.label)}"]`);
    lines.push(`  ${previous} --> ${nodeId}`);
    previous = nodeId;
  }
  lines.push(`  ${previous} --> CHECK["Check Acceptance"]`);
  return lines.join("\n");
}

function buildDiagramSection(title, markdown) {
  const mermaid = buildMermaid(title, markdown);
  return [
    "## Technical Solution Diagram",
    "```mermaid",
    mermaid,
    "```",
    "- Notes: Keep this diagram updated as implementation decisions evolve."
  ].join("\n");
}

function resolveInsertPoint(markdown) {
  const text = String(markdown || "");
  const candidates = ["Implementation Tasks", "Acceptance Criteria", "Validation Commands", "WIP Log"];
  for (const heading of candidates) {
    const escaped = escapeRegExp(heading);
    const re = new RegExp(`\\r?\\n##\\s+${escaped}\\s*\\r?\\n`, "i");
    const match = re.exec(text);
    if (match && typeof match.index === "number") {
      return match.index;
    }
  }
  return -1;
}

export function ensureTechnicalSolutionDiagramSection(markdown, options = {}) {
  const raw = String(markdown || "");
  if (!raw.trim()) {
    return { markdown: raw, changed: false };
  }
  const diagramMode = resolveDiagramMode(raw);
  if (diagramMode !== "required") {
    return { markdown: raw, changed: false };
  }
  if (hasExistingTechnicalSection(raw)) {
    return { markdown: raw, changed: false };
  }

  const section = buildDiagramSection(options.title || "", raw);
  const insertAt = resolveInsertPoint(raw);
  if (insertAt >= 0) {
    const next = `${raw.slice(0, insertAt).trimEnd()}\n\n${section}\n\n${raw.slice(insertAt).trimStart()}`;
    return { markdown: next, changed: true };
  }
  return { markdown: `${raw.trimEnd()}\n\n${section}\n`, changed: true };
}
