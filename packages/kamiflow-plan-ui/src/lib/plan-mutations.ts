import type { ParsedPlan } from "../types.js";

function toggleChecklistLine(line: string, checked: boolean): string {
  return line.replace(/^- \[( |x|X)\]/, checked ? "- [x]" : "- [ ]");
}

function mutateChecklistSection(section: string, itemIndex: number, checked: boolean): string {
  const lines = section.split(/\r?\n/);
  const indices: number[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (/^- \[( |x|X)\]/.test(lines[i].trim())) {
      indices.push(i);
    }
  }

  if (itemIndex < 0 || itemIndex >= indices.length) {
    throw new Error("Checklist index out of range.");
  }

  const lineIndex = indices[itemIndex];
  lines[lineIndex] = toggleChecklistLine(lines[lineIndex], checked);
  return lines.join("\n");
}

function replaceWipLine(section: string, key: string, value: string): string {
  const lines = section.split(/\r?\n/);
  const prefix = `- ${key}:`;
  let found = false;
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i].startsWith(prefix)) {
      lines[i] = `${prefix} ${value}`;
      found = true;
      break;
    }
  }
  if (!found) {
    lines.push(`${prefix} ${value}`);
  }
  return lines.join("\n");
}

function mutateChecklistBySectionName(
  parsed: ParsedPlan,
  sectionName: string,
  itemIndex: number,
  checked: boolean
): ParsedPlan {
  const current = parsed.sections[sectionName];
  if (typeof current !== "string") {
    throw new Error(`Missing section: ${sectionName}`);
  }
  return {
    ...parsed,
    sections: {
      ...parsed.sections,
      [sectionName]: mutateChecklistSection(current, itemIndex, checked)
    }
  };
}

export function applyStatusMutation(parsed: ParsedPlan, status: string): ParsedPlan {
  return {
    ...parsed,
    frontmatter: {
      ...parsed.frontmatter,
      status
    }
  };
}

export function applyDecisionMutation(parsed: ParsedPlan, decision: "GO" | "NO_GO"): ParsedPlan {
  return {
    ...parsed,
    frontmatter: {
      ...parsed.frontmatter,
      decision
    }
  };
}

export function applyTaskMutation(parsed: ParsedPlan, taskIndex: number, checked: boolean): ParsedPlan {
  return mutateChecklistBySectionName(parsed, "Implementation Tasks", taskIndex, checked);
}

export function applyAcceptanceCriteriaMutation(
  parsed: ParsedPlan,
  criterionIndex: number,
  checked: boolean
): ParsedPlan {
  return mutateChecklistBySectionName(parsed, "Acceptance Criteria", criterionIndex, checked);
}

export function applyGateMutation(parsed: ParsedPlan, gateIndex: number, checked: boolean): ParsedPlan {
  return mutateChecklistBySectionName(parsed, "Go/No-Go Checklist", gateIndex, checked);
}

export function applyWipMutation(
  parsed: ParsedPlan,
  wip: { status?: string; blockers?: string; next_step?: string }
): ParsedPlan {
  const sectionName = "WIP Log";
  const current = parsed.sections[sectionName];
  if (typeof current !== "string") {
    throw new Error(`Missing section: ${sectionName}`);
  }
  let next = current;
  if (typeof wip.status === "string") {
    next = replaceWipLine(next, "Status", wip.status);
  }
  if (typeof wip.blockers === "string") {
    next = replaceWipLine(next, "Blockers", wip.blockers);
  }
  if (typeof wip.next_step === "string") {
    next = replaceWipLine(next, "Next step", wip.next_step);
  }
  return {
    ...parsed,
    sections: {
      ...parsed.sections,
      [sectionName]: next
    }
  };
}

export function applyHandoffMutation(
  parsed: ParsedPlan,
  handoff: { selected_mode?: string; next_command?: string; next_mode?: string; status?: string }
): ParsedPlan {
  return {
    ...parsed,
    frontmatter: {
      ...parsed.frontmatter,
      ...(handoff.selected_mode ? { selected_mode: handoff.selected_mode } : {}),
      ...(handoff.next_command ? { next_command: handoff.next_command } : {}),
      ...(handoff.next_mode ? { next_mode: handoff.next_mode } : {}),
      ...(handoff.status ? { status: handoff.status } : {})
    }
  };
}
