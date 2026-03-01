export const DEFAULT_PLAN_DIR = ".local/plans";

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
  "Goal",
  "Scope (In/Out)",
  "Constraints",
  "Assumptions",
  "Open Decisions",
  "Implementation Tasks",
  "Acceptance Criteria",
  "Validation Commands",
  "Risks & Rollback",
  "Go/No-Go Checklist",
  "WIP Log"
];
