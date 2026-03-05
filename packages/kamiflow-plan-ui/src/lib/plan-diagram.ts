export interface DiagramPlanSummaryInput {
  plan_id: string;
}

export interface DiagramPlanInput {
  summary: DiagramPlanSummaryInput;
  sections: Record<string, string>;
}

export interface ImplementationTaskNode {
  id: string;
  label: string;
  checked: boolean;
}

export interface PlanDiagramModel {
  plan_id: string;
  source_type: "section" | "derived";
  tasks: ImplementationTaskNode[];
  mermaid: string;
  warnings: string[];
}

function escapeMermaidText(value: string): string {
  return String(value || "").replace(/"/g, '\\"').replace(/\r?\n/g, " ");
}

function extractMermaidBlock(sectionText: string): string {
  const text = String(sectionText || "");
  const match = text.match(/```mermaid\s*([\s\S]*?)```/i);
  return match?.[1]?.trim() || "";
}

function parseImplementationTasks(sectionText: string): ImplementationTaskNode[] {
  const lines = String(sectionText || "").split(/\r?\n/);
  const items: ImplementationTaskNode[] = [];
  for (const line of lines) {
    const match = line.match(/^(\s*)[-*+]\s\[( |x|X)\]\s*(.+)$/);
    if (!match) {
      continue;
    }
    const checked = match[2].toLowerCase() === "x";
    const raw = String(match[3] || "").trim();
    const explicitId = raw.match(/\b(T\d+)\b/i)?.[1]?.toUpperCase();
    const id = explicitId || `T${items.length + 1}`;
    const label = raw
      .replace(new RegExp(`\\b${id}\\b`, "ig"), "")
      .replace(/^[\[\]\-:()#\s]+/, "")
      .trim();
    items.push({
      id,
      label: label || `Task ${items.length + 1}`,
      checked
    });
  }
  return items;
}

function extractTaskRefsFromMermaid(source: string): string[] {
  const ids = new Set<string>();
  const matches = String(source || "").match(/\bT\d+\b/gi) || [];
  for (const item of matches) {
    ids.add(item.toUpperCase());
  }
  return [...ids];
}

function buildDerivedMermaid(tasks: ImplementationTaskNode[]): string {
  const lines: string[] = [];
  lines.push("flowchart TD");
  lines.push("  %% derived_from_implementation_tasks=true");
  lines.push("  classDef done fill:#ecfdf3,stroke:#16a34a,color:#14532d,stroke-width:1px;");
  lines.push("  classDef todo fill:#f8fafc,stroke:#94a3b8,color:#334155,stroke-width:1px;");
  lines.push('  START["Start Implementation"]:::done');

  if (tasks.length === 0) {
    lines.push('  EMPTY["No implementation tasks found"]:::todo');
    lines.push("  START --> EMPTY");
    return lines.join("\n");
  }

  for (const task of tasks) {
    const className = task.checked ? "done" : "todo";
    lines.push(`  ${task.id}["${escapeMermaidText(`${task.id}: ${task.label}`)}"]:::${className}`);
  }

  lines.push(`  START --> ${tasks[0].id}`);
  for (let index = 0; index < tasks.length - 1; index += 1) {
    lines.push(`  ${tasks[index].id} --> ${tasks[index + 1].id}`);
  }
  lines.push(`  ${tasks[tasks.length - 1].id} --> DONE["Done"]:::todo`);
  return lines.join("\n");
}

export function buildImplementationFlowModel(input: DiagramPlanInput): PlanDiagramModel {
  const tasks = parseImplementationTasks(input.sections["Implementation Tasks"]);
  const taskIds = tasks.map((item) => item.id);
  const flowSection = input.sections["Implementation Flow"] || "";
  const mermaidFromSection = extractMermaidBlock(flowSection);
  const warnings: string[] = [];

  let mermaid = mermaidFromSection;
  let source_type: "section" | "derived" = "section";

  if (!mermaid) {
    mermaid = buildDerivedMermaid(tasks);
    source_type = "derived";
    warnings.push("No Mermaid code block found in `Implementation Flow`; using derived flow from Implementation Tasks.");
  } else {
    const refs = extractTaskRefsFromMermaid(mermaid);
    if (refs.length === 0) {
      warnings.push("Mermaid flow has no task references (expected IDs like T1, T2...).");
    } else {
      const unknownRefs = refs.filter((ref) => !taskIds.includes(ref));
      if (unknownRefs.length > 0) {
        warnings.push(`Mermaid references unknown task IDs: ${unknownRefs.join(", ")}.`);
      }
      const missingRefs = taskIds.filter((id) => !refs.includes(id));
      if (missingRefs.length > 0) {
        warnings.push(`Implementation Tasks missing in Mermaid flow: ${missingRefs.join(", ")}.`);
      }
    }
  }

  return {
    plan_id: input.summary.plan_id,
    source_type,
    tasks,
    mermaid,
    warnings
  };
}

// Backward compatibility for previous imports/tests.
export const buildPlanDiagramModel = buildImplementationFlowModel;
