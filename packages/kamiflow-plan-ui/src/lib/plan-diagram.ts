export interface DiagramPlanSummaryInput {
  plan_id: string;
}

export interface DiagramPlanInput {
  summary: DiagramPlanSummaryInput;
  sections: Record<string, string>;
}

export interface TechnicalSolutionDiagramModel {
  plan_id: string;
  section_name: string;
  source_type: "section" | "derived";
  mermaid_source: string;
  mermaid_render: string;
  warnings: string[];
}

const SECTION_CANDIDATES = [
  "Technical Solution Diagram",
  "Solution Diagram",
  "Technical Solution",
  "Implementation Flow"
] as const;

function extractMermaidBlock(sectionText: string): string {
  const text = String(sectionText || "");
  const match = text.match(/```mermaid\s*([\s\S]*?)```/i);
  return match?.[1]?.trim() || "";
}

function findSection(sections: Record<string, string>): { name: string; text: string } | null {
  for (const name of SECTION_CANDIDATES) {
    if (sections[name]) {
      return { name, text: sections[name] };
    }
  }
  return null;
}

function buildFallbackMermaid(): string {
  return [
    "flowchart LR",
    "  %% derived_solution_placeholder=true",
    '  IDEA["Selected Solution"] --> DESIGN["Technical Design"] --> BUILD["Implementation"] --> CHECK["Validation"]'
  ].join("\n");
}

function forceLandscapeOrientation(source: string): { mermaid: string; changed: boolean } {
  const text = String(source || "").trim();
  if (!text) {
    return { mermaid: "", changed: false };
  }

  const lines = text.split(/\r?\n/);
  let changed = false;
  const next = [...lines];

  const flowIndex = lines.findIndex((line) => /^\s*(flowchart|graph)\b/i.test(line));
  if (flowIndex >= 0) {
    const original = lines[flowIndex];
    const normalized = original.replace(/\s+/g, " ").trim();
    if (/(flowchart|graph)\s+(TD|TB|BT)\b/i.test(normalized)) {
      next[flowIndex] = normalized.replace(/\b(TD|TB|BT)\b/i, "LR");
      changed = true;
    } else if (/^(flowchart|graph)\s*$/i.test(normalized)) {
      next[flowIndex] = `${normalized} LR`;
      changed = true;
    }
  } else {
    next.unshift("flowchart LR");
    changed = true;
  }

  return { mermaid: next.join("\n"), changed };
}

export function buildTechnicalSolutionDiagramModel(input: DiagramPlanInput): TechnicalSolutionDiagramModel {
  const warnings: string[] = [];
  const section = findSection(input.sections);

  if (!section) {
    const fallback = buildFallbackMermaid();
    warnings.push(
      "No `Technical Solution Diagram` section found. Add a ```mermaid block under that section to persist solution logic."
    );
    return {
      plan_id: input.summary.plan_id,
      section_name: "Technical Solution Diagram",
      source_type: "derived",
      mermaid_source: fallback,
      mermaid_render: fallback,
      warnings
    };
  }

  const source = extractMermaidBlock(section.text);
  if (!source) {
    const fallback = buildFallbackMermaid();
    warnings.push(
      `Section \`${section.name}\` has no Mermaid block. Add \`\`\`mermaid ... \`\`\` to store solution logic in plan markdown.`
    );
    return {
      plan_id: input.summary.plan_id,
      section_name: section.name,
      source_type: "derived",
      mermaid_source: fallback,
      mermaid_render: fallback,
      warnings
    };
  }

  const normalized = forceLandscapeOrientation(source);
  if (normalized.changed) {
    warnings.push("Mermaid render normalized to landscape orientation (LR) for 16:9 viewing.");
  }

  return {
    plan_id: input.summary.plan_id,
    section_name: section.name,
    source_type: "section",
    mermaid_source: source,
    mermaid_render: normalized.mermaid || source,
    warnings
  };
}

// Backward-compatible aliases for existing imports/tests.
export const buildImplementationFlowModel = buildTechnicalSolutionDiagramModel;
export const buildPlanDiagramModel = buildTechnicalSolutionDiagramModel;
