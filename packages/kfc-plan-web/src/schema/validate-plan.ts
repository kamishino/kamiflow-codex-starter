import { REQUIRED_FRONTMATTER_FIELDS, REQUIRED_SECTIONS } from "../constants.js";
import { evaluateStartSummaryGate } from "../lib/start-gate.js";
import type { ParsedPlan } from "../types.js";
import { resolveDiagramMode } from "../lib/diagram-mode.js";
import { lintAndRepairMermaid } from "../lib/mermaid-safety.js";

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
    const startGate = evaluateStartSummaryGate(startSummary);
    if (!startGate.ok) {
      errors.push(startGate.reason);
    }
  }

  return errors;
}
