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
  const sectionName = "Implementation Tasks";
  const current = parsed.sections[sectionName];
  if (typeof current !== "string") {
    throw new Error(`Missing section: ${sectionName}`);
  }
  return {
    ...parsed,
    sections: {
      ...parsed.sections,
      [sectionName]: mutateChecklistSection(current, taskIndex, checked)
    }
  };
}

export function applyGateMutation(parsed: ParsedPlan, gateIndex: number, checked: boolean): ParsedPlan {
  const sectionName = "Go/No-Go Checklist";
  const current = parsed.sections[sectionName];
  if (typeof current !== "string") {
    throw new Error(`Missing section: ${sectionName}`);
  }
  return {
    ...parsed,
    sections: {
      ...parsed.sections,
      [sectionName]: mutateChecklistSection(current, gateIndex, checked)
    }
  };
}
