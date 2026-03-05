const SECTION_CANDIDATES = [
  "Technical Solution Diagram",
  "Solution Diagram",
  "Technical Solution",
  "Implementation Flow"
];

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractSection(markdown, heading) {
  const escaped = escapeRegExp(heading);
  const re = new RegExp(`(^|\\r?\\n)##\\s+${escaped}\\s*\\r?\\n([\\s\\S]*?)(?=\\r?\\n##\\s+|$)`, "i");
  const match = String(markdown || "").match(re);
  return match ? match[2].trim() : "";
}

function findTechnicalSection(markdown) {
  const text = String(markdown || "");
  for (const heading of SECTION_CANDIDATES) {
    const escaped = escapeRegExp(heading);
    const re = new RegExp(`(^|\\r?\\n)(##\\s+${escaped}\\s*\\r?\\n)([\\s\\S]*?)(?=\\r?\\n##\\s+|$)`, "i");
    const match = re.exec(text);
    if (!match || typeof match.index !== "number") {
      continue;
    }
    const prefixLength = match[1]?.length || 0;
    const headerLength = match[2]?.length || 0;
    const start = match.index + prefixLength;
    const end = start + headerLength + String(match[3] || "").length;
    return {
      heading,
      start,
      end,
      sectionText: String(match[3] || "").trim()
    };
  }
  return null;
}

function hasMermaidBlock(sectionText) {
  return /```mermaid\s*[\s\S]*?```/i.test(String(sectionText || ""));
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

export function ensureTechnicalSolutionDiagramSection(markdown, options = {}) {
  const raw = String(markdown || "");
  if (!raw.trim()) {
    return { markdown: raw, changed: false };
  }
  const section = findTechnicalSection(raw);
  if (!section) {
    return { markdown: raw, changed: false };
  }
  if (hasMermaidBlock(section.sectionText)) {
    return { markdown: raw, changed: false };
  }

  const normalizedSection = buildDiagramSection(options.title || "", raw);
  const next = `${raw.slice(0, section.start)}${normalizedSection}${raw.slice(section.end)}`;
  return { markdown: next, changed: next !== raw };
}
