import { resolveDiagramMode } from "./diagram-mode.js";

export interface DiagramPlanSummaryInput {
  plan_id: string;
  diagram_mode?: string;
}

export interface DiagramPlanInput {
  summary: DiagramPlanSummaryInput;
  sections: Record<string, string>;
}

export type DiagramAvailability = "ready" | "missing" | "invalid";

export interface TechnicalSolutionDiagramModel {
  plan_id: string;
  section_name: string;
  source_type: "section" | "derived";
  content_state: DiagramAvailability;
  state_message: string;
  mermaid_source: string;
  mermaid_render: string;
  warnings: string[];
}

export interface TasksSubtasksDiagramModel {
  plan_id: string;
  section_name: string;
  content_state: DiagramAvailability;
  state_message: string;
  mermaid_source: string;
  mermaid_render: string;
  warnings: string[];
}

export interface FallbackSummaryModel {
  plan_id: string;
  section_name: string;
  content_state: DiagramAvailability;
  state_message: string;
  summary_lines: string[];
  warnings: string[];
}

export interface DiagramMermaidTabModel {
  key: "technical" | "tasks";
  label: string;
  kind: "mermaid";
  status: DiagramAvailability;
  status_message: string;
  source_label: string;
  mermaid_source: string;
  mermaid_render: string;
  warnings: string[];
}

export interface DiagramSummaryTabModel {
  key: "summary";
  label: string;
  kind: "summary";
  status: DiagramAvailability;
  status_message: string;
  source_label: string;
  summary_lines: string[];
  warnings: string[];
}

export type PlanDiagramTabModel = DiagramMermaidTabModel | DiagramSummaryTabModel;

export interface PlanDiagramTabsModel {
  default_tab: "technical" | "tasks" | "summary";
  tabs: PlanDiagramTabModel[];
}

const SECTION_CANDIDATES = [
  "Technical Solution Diagram",
  "Solution Diagram",
  "Technical Solution",
  "Implementation Flow"
] as const;

const TASKS_SECTION_CANDIDATES = ["Implementation Tasks", "Tasks/Subtasks", "Tasks"] as const;

const SUMMARY_SECTION_CANDIDATES = ["Start Summary", "Goal", "Scope (In/Out)"] as const;

function extractMermaidBlock(sectionText: string): { source: string; invalid: boolean } {
  const text = String(sectionText || "");
  const match = text.match(/```mermaid\s*([\s\S]*?)```/i);
  if (match?.[1]?.trim()) {
    return { source: match[1].trim(), invalid: false };
  }
  if (/```mermaid/i.test(text)) {
    return { source: "", invalid: true };
  }
  return { source: "", invalid: false };
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

function cleanLabel(input: string): string {
  return String(input || "")
    .replace(/\r?\n+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/"/g, '\\"');
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
      content_state: "missing",
      state_message: "No section found.",
      mermaid_source: fallback,
      mermaid_render: fallback,
      warnings
    };
  }

  const extracted = extractMermaidBlock(section.text);
  if (extracted.invalid) {
    const fallback = buildFallbackMermaid();
    warnings.push(`Section \`${section.name}\` has an invalid Mermaid block (unclosed code fence).`);
    return {
      plan_id: input.summary.plan_id,
      section_name: section.name,
      source_type: "derived",
      content_state: "invalid",
      state_message: "Invalid Mermaid block.",
      mermaid_source: section.text.trim(),
      mermaid_render: fallback,
      warnings
    };
  }

  const source = extracted.source;
  if (!source) {
    const fallback = buildFallbackMermaid();
    warnings.push(
      `Section \`${section.name}\` has no Mermaid block. Add \`\`\`mermaid ... \`\`\` to store solution logic in plan markdown.`
    );
    return {
      plan_id: input.summary.plan_id,
      section_name: section.name,
      source_type: "derived",
      content_state: "missing",
      state_message: "No Mermaid block found.",
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
    content_state: "ready",
    state_message: "Ready",
    mermaid_source: source,
    mermaid_render: normalized.mermaid || source,
    warnings
  };
}

function findTasksSection(sections: Record<string, string>): { name: string; text: string } | null {
  for (const name of TASKS_SECTION_CANDIDATES) {
    if (sections[name]) {
      return { name, text: sections[name] };
    }
  }
  return null;
}

export function buildTasksSubtasksDiagramModel(input: DiagramPlanInput): TasksSubtasksDiagramModel {
  const warnings: string[] = [];
  const section = findTasksSection(input.sections);
  if (!section) {
    return {
      plan_id: input.summary.plan_id,
      section_name: "Implementation Tasks",
      content_state: "missing",
      state_message: "No tasks section found.",
      mermaid_source: "",
      mermaid_render: "",
      warnings: ["No task section found to derive Tasks/Subtasks diagram."]
    };
  }

  const lines = String(section.text || "").split(/\r?\n/);
  const items: Array<{ id: string; depth: number; checked: boolean; label: string }> = [];
  for (const line of lines) {
    const match = line.match(/^([ \t]*)- \[( |x|X)\]\s+(.+)$/);
    if (!match) {
      continue;
    }
    const indent = match[1].replace(/\t/g, "  ").length;
    const depth = Math.max(0, Math.floor(indent / 2));
    const checked = match[2].toLowerCase() === "x";
    const label = cleanLabel(match[3] || "");
    if (!label) {
      continue;
    }
    items.push({
      id: `T${items.length + 1}`,
      depth,
      checked,
      label
    });
  }

  if (!items.length) {
    return {
      plan_id: input.summary.plan_id,
      section_name: section.name,
      content_state: "missing",
      state_message: "No checklist tasks found.",
      mermaid_source: "",
      mermaid_render: "",
      warnings: ["Tasks/Subtasks diagram requires checklist items in Implementation Tasks."]
    };
  }

  const mermaidLines: string[] = ["flowchart LR", '  ROOT["Implementation Tasks"]'];
  let previousRootId = "";
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    const prefix = item.checked ? "DONE: " : "TODO: ";
    mermaidLines.push(`  ${item.id}["${cleanLabel(prefix + item.label)}"]`);
    if (item.depth <= 0) {
      if (previousRootId) {
        mermaidLines.push(`  ${previousRootId} --> ${item.id}`);
      } else {
        mermaidLines.push(`  ROOT --> ${item.id}`);
      }
      previousRootId = item.id;
      continue;
    }
    let parentId = "ROOT";
    for (let parent = index - 1; parent >= 0; parent -= 1) {
      if (items[parent].depth === item.depth - 1) {
        parentId = items[parent].id;
        break;
      }
    }
    mermaidLines.push(`  ${parentId} --> ${item.id}`);
  }

  const source = mermaidLines.join("\n");
  const normalized = forceLandscapeOrientation(source);
  if (normalized.changed) {
    warnings.push("Mermaid render normalized to landscape orientation (LR) for 16:9 viewing.");
  }
  return {
    plan_id: input.summary.plan_id,
    section_name: section.name,
    content_state: "ready",
    state_message: "Ready",
    mermaid_source: source,
    mermaid_render: normalized.mermaid || source,
    warnings
  };
}

export function buildFallbackSummaryModel(input: DiagramPlanInput): FallbackSummaryModel {
  const lines: string[] = [];
  for (const name of SUMMARY_SECTION_CANDIDATES) {
    const raw = String(input.sections[name] || "").trim();
    if (!raw) {
      continue;
    }
    const firstMeaningfulLine = raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line.length > 0);
    if (firstMeaningfulLine) {
      lines.push(`${name}: ${firstMeaningfulLine}`);
    }
  }

  if (!lines.length) {
    return {
      plan_id: input.summary.plan_id,
      section_name: "Fallback Summary",
      content_state: "missing",
      state_message: "No summary content found.",
      summary_lines: [],
      warnings: ["Fallback Summary needs Start Summary, Goal, or Scope content."]
    };
  }

  return {
    plan_id: input.summary.plan_id,
    section_name: "Fallback Summary",
    content_state: "ready",
    state_message: "Ready",
    summary_lines: lines,
    warnings: []
  };
}

export function buildPlanDiagramTabsModel(input: DiagramPlanInput): PlanDiagramTabsModel {
  const mode = resolveDiagramMode(input.summary.diagram_mode).mode;
  const technical = buildTechnicalSolutionDiagramModel(input);
  const tasks = buildTasksSubtasksDiagramModel(input);
  const summary = buildFallbackSummaryModel(input);

  const tabs: PlanDiagramTabModel[] = [];
  const canShowTechnical = mode === "required" || (mode === "auto" && technical.content_state === "ready");

  if (canShowTechnical) {
    tabs.push({
      key: "technical",
      label: "Technical",
      kind: "mermaid",
      status: technical.content_state,
      status_message: technical.state_message,
      source_label: technical.source_type === "section" ? `From ${technical.section_name}` : "Derived placeholder",
      mermaid_source: technical.mermaid_source,
      mermaid_render: technical.mermaid_render,
      warnings: technical.warnings
    });
  }

  tabs.push({
    key: "tasks",
    label: "Tasks/Subtasks",
    kind: "mermaid",
    status: tasks.content_state,
    status_message: tasks.state_message,
    source_label: tasks.section_name,
    mermaid_source: tasks.mermaid_source,
    mermaid_render: tasks.mermaid_render,
    warnings: tasks.warnings
  });

  tabs.push({
    key: "summary",
    label: "Fallback Summary",
    kind: "summary",
    status: summary.content_state,
    status_message: summary.state_message,
    source_label: summary.section_name,
    summary_lines: summary.summary_lines,
    warnings: summary.warnings
  });

  const defaultTab =
    mode === "required"
      ? "technical"
      : tasks.content_state === "ready"
        ? "tasks"
        : summary.content_state === "ready"
          ? "summary"
          : (tabs[0]?.key ?? "tasks");

  return {
    default_tab: defaultTab,
    tabs
  };
}

// Backward-compatible aliases for existing imports/tests.
export const buildImplementationFlowModel = buildTechnicalSolutionDiagramModel;
export const buildPlanDiagramModel = buildTechnicalSolutionDiagramModel;
