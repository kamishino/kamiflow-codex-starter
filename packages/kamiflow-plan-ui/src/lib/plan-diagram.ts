export interface DiagramPlanSummaryInput {
  plan_id: string;
  title?: string;
  status?: string;
  decision?: string;
  selected_mode?: string;
  next_mode?: string;
  next_command?: string;
  is_done?: boolean;
  is_archived?: boolean;
}

export interface DiagramPlanInput {
  summary: DiagramPlanSummaryInput;
  sections: Record<string, string>;
}

export type DiagramPhaseState = "done" | "current" | "upcoming";

export interface DiagramPhaseStep {
  id: string;
  label: string;
  state: DiagramPhaseState;
}

export interface DiagramChecklistProgress {
  done: number;
  total: number;
}

export interface PlanDiagramModel {
  current_phase: string;
  phase_steps: DiagramPhaseStep[];
  tasks: DiagramChecklistProgress;
  acceptance: DiagramChecklistProgress;
  decision: "GO" | "NO_GO";
  next_command: string;
  next_mode: string;
  mermaid: string;
}

const PHASES = ["Brainstorm", "Plan", "Build", "Check", "Done"] as const;

function parseSummarySection(sectionText: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of String(sectionText || "").split(/\r?\n/)) {
    const match = line.match(/^- ([^:]+):\s*(.*)$/);
    if (!match) {
      continue;
    }
    out[match[1].trim().toLowerCase()] = match[2].trim();
  }
  return out;
}

function isPlaceholder(value: string): boolean {
  const normalized = String(value || "").trim().toLowerCase();
  return !normalized || normalized === "tbd" || normalized === "n/a" || normalized === "-";
}

function startGatePasses(input: DiagramPlanInput): boolean {
  const start = parseSummarySection(input.sections["Start Summary"]);
  const required = (start.required || "").toLowerCase();
  if (required !== "yes" && required !== "no") {
    return false;
  }
  if (isPlaceholder(start.reason || "")) {
    return false;
  }
  if (required === "yes" && isPlaceholder(start["selected idea"] || "")) {
    return false;
  }
  if (required === "yes" && isPlaceholder(start["handoff confidence"] || "")) {
    return false;
  }
  return true;
}

function checklistProgress(sectionText: string | undefined): DiagramChecklistProgress {
  const lines = String(sectionText || "").split(/\r?\n/);
  let total = 0;
  let done = 0;
  for (const line of lines) {
    const match = line.match(/^(\s*)[-*+]\s\[( |x|X)\]\s+/);
    if (!match) {
      continue;
    }
    total += 1;
    if (match[2].toLowerCase() === "x") {
      done += 1;
    }
  }
  return { done, total };
}

function deriveCurrentPhase(input: DiagramPlanInput): string {
  const summary = input.summary;
  if (!startGatePasses(input)) {
    return "Brainstorm";
  }
  if (summary.is_archived || summary.is_done || summary.status === "done" || summary.next_command === "done") {
    return "Done";
  }
  if ((summary.next_command || "").toLowerCase() === "check") {
    return "Check";
  }
  if (
    ["build", "fix"].includes((summary.next_command || "").toLowerCase()) ||
    (summary.next_mode || "").toLowerCase() === "build"
  ) {
    return "Build";
  }
  return "Plan";
}

function phaseStepsFor(currentPhase: string): DiagramPhaseStep[] {
  const safePhase = PHASES.includes(currentPhase as (typeof PHASES)[number]) ? currentPhase : "Plan";
  const index = PHASES.findIndex((item) => item === safePhase);
  if (safePhase === "Done") {
    return PHASES.map((label) => ({ id: label.toLowerCase(), label, state: "done" }));
  }
  return PHASES.map((label, i) => ({
    id: label.toLowerCase(),
    label,
    state: i < index ? "done" : i === index ? "current" : "upcoming"
  }));
}

function ratioLabel(progress: DiagramChecklistProgress): string {
  return `${progress.done}/${progress.total || 0}`;
}

function mermaidClass(state: DiagramPhaseState): string {
  if (state === "done") {
    return "done";
  }
  if (state === "current") {
    return "current";
  }
  return "upcoming";
}

function escapeMermaidText(value: string): string {
  return String(value || "").replace(/"/g, '\\"');
}

function toMermaid(model: {
  phase_steps: DiagramPhaseStep[];
  tasks: DiagramChecklistProgress;
  acceptance: DiagramChecklistProgress;
  decision: "GO" | "NO_GO";
  next_command: string;
  next_mode: string;
}): string {
  const lines: string[] = [];
  lines.push("flowchart LR");
  lines.push("  %% derived_from_plan_state=true");
  lines.push("  %% do_not_edit_as_source_of_truth");
  lines.push("  classDef done fill:#ecfdf3,stroke:#16a34a,color:#14532d,stroke-width:1px;");
  lines.push("  classDef current fill:#eff4ff,stroke:#1d4ed8,color:#1e3a8a,stroke-width:2px;");
  lines.push("  classDef upcoming fill:#f8fafc,stroke:#94a3b8,color:#334155,stroke-width:1px;");
  lines.push("  classDef metric fill:#fff7ed,stroke:#f97316,color:#9a3412,stroke-width:1px;");
  lines.push("  classDef decision fill:#fef2f2,stroke:#dc2626,color:#991b1b,stroke-width:1px;");
  lines.push("  classDef handoff fill:#ecfeff,stroke:#0891b2,color:#155e75,stroke-width:1px;");

  for (const step of model.phase_steps) {
    const label = `${step.label}<br/>${step.state.toUpperCase()}`;
    lines.push(`  ${step.id}["${escapeMermaidText(label)}"]:::${mermaidClass(step.state)}`);
  }

  lines.push(`  tasks["Implementation<br/>${ratioLabel(model.tasks)}"]:::metric`);
  lines.push(`  acceptance["Acceptance<br/>${ratioLabel(model.acceptance)}"]:::metric`);
  lines.push(`  decision["Decision<br/>${model.decision}"]:::decision`);
  lines.push(`  handoff["Next<br/>${escapeMermaidText(model.next_command)}/${escapeMermaidText(model.next_mode)}"]:::handoff`);
  lines.push('  fix["Fix Loop"]:::upcoming');

  lines.push("  brainstorm --> plan --> build --> check --> done");
  lines.push("  plan --> tasks --> build");
  lines.push("  build --> acceptance --> check");
  lines.push("  check -- PASS --> done");
  lines.push("  check -- BLOCK --> fix --> check");
  lines.push("  check --> decision --> handoff");

  return lines.join("\n");
}

export function buildPlanDiagramModel(input: DiagramPlanInput): PlanDiagramModel {
  const current_phase = deriveCurrentPhase(input);
  const phase_steps = phaseStepsFor(current_phase);
  const tasks = checklistProgress(input.sections["Implementation Tasks"]);
  const acceptance = checklistProgress(input.sections["Acceptance Criteria"]);
  const decision = input.summary.decision === "NO_GO" ? "NO_GO" : "GO";
  const next_command = String(input.summary.next_command || "stay");
  const next_mode = String(input.summary.next_mode || "Plan");

  const mermaid = toMermaid({
    phase_steps,
    tasks,
    acceptance,
    decision,
    next_command,
    next_mode
  });

  return {
    current_phase,
    phase_steps,
    tasks,
    acceptance,
    decision,
    next_command,
    next_mode,
    mermaid
  };
}
