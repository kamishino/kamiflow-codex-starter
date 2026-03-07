export const DEFAULT_PLAN_DIR = ".local/plans";
export const DEFAULT_RUN_DIR = ".local/runs";

export const REQUIRED_FRONTMATTER_FIELDS = [
  "plan_id",
  "title",
  "status",
  "decision",
  "selected_mode",
  "next_mode",
  "next_command",
  "updated_at"
];

export const REQUIRED_SECTIONS = [
  "Start Summary",
  "Goal",
  "Scope (In/Out)",
  "Constraints",
  "Assumptions",
  "Open Decisions",
  "Technical Solution Diagram",
  "Implementation Tasks",
  "Acceptance Criteria",
  "Validation Commands",
  "Risks & Rollback",
  "Go/No-Go Checklist",
  "WIP Log"
];
