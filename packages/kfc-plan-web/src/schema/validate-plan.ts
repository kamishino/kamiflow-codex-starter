import { REQUIRED_FRONTMATTER_FIELDS, REQUIRED_SECTIONS } from "../constants.js";
import type { ParsedPlan } from "../types.js";
import { resolveDiagramMode } from "../lib/diagram-mode.js";
import { lintAndRepairMermaid } from "../lib/mermaid-safety.js";

function parseStartSummary(sectionText: string): Record<string, string> {
  const lines = sectionText.split(/\r?\n/);
  const data: Record<string, string> = {};
  for (const line of lines) {
    const match = line.match(/^- ([^:]+):\s*(.*)$/);
    if (!match) {
      continue;
    }
    data[match[1].trim().toLowerCase()] = match[2].trim();
  }
  return data;
}

export function validateParsedPlan(plan: ParsedPlan) {
  const errors = [];
  const diagramMode = resolveDiagramMode(plan.frontmatter.diagram_mode);

  for (const key of REQUIRED_FRONTMATTER_FIELDS) {
    const value = plan.frontmatter[key];
    if (typeof value !== "string" || value.trim().length === 0) {
      errors.push(`Missing frontmatter field: ${key}`);
    }
  }

  for (const section of REQUIRED_SECTIONS) {
    if (section === "Technical Solution Diagram" && diagramMode.mode !== "required") {
      continue;
    }
    if (!Object.prototype.hasOwnProperty.call(plan.sections, section)) {
      errors.push(`Missing section: ${section}`);
      continue;
    }
    if (plan.sections[section].trim().length === 0) {
      errors.push(`Empty section: ${section}`);
    }
  }

  if (!diagramMode.valid) {
    errors.push("`diagram_mode` must be required, auto, or hidden.");
  }

  if (diagramMode.mode === "required") {
    const technical = String(plan.sections["Technical Solution Diagram"] || "").trim();
    const mermaidMatch = technical.match(/```mermaid\s*([\s\S]*?)```/i);
    if (!mermaidMatch?.[1]?.trim()) {
      errors.push("`Technical Solution Diagram` must include a Mermaid block when `diagram_mode` is required.");
    } else {
      const safety = lintAndRepairMermaid(mermaidMatch[1].trim());
      for (const issue of safety.issues) {
        errors.push(
          `Mermaid safety violation (${issue.code}) in Technical Solution Diagram at line ${issue.line}: ${issue.message}`
        );
      }
    }
  }

  const decision = plan.frontmatter.decision;
  if (decision && decision !== "GO" && decision !== "NO_GO") {
    errors.push("`decision` must be GO or NO_GO.");
  }

  const selectedMode = plan.frontmatter.selected_mode;
  if (selectedMode && selectedMode !== "Plan" && selectedMode !== "Build") {
    errors.push("`selected_mode` must be Plan or Build.");
  }

  const startSummary = plan.sections["Start Summary"];
  if (typeof startSummary === "string") {
    const parsedStart = parseStartSummary(startSummary);
    const required = parsedStart.required?.toLowerCase();
    if (required !== "yes" && required !== "no") {
      errors.push("`Start Summary` must include `- Required: yes|no`.");
    }
    const reason = parsedStart.reason ?? "";
    if (!reason || reason.toLowerCase() === "tbd") {
      errors.push("`Start Summary` must include a non-placeholder `Reason`.");
    }
  }

  return errors;
}
