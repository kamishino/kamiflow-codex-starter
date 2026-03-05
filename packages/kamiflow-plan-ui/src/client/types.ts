export interface ProjectInfo {
  project_id: string;
  project_dir: string;
}

export interface ProjectsResponse {
  workspace?: string;
  projects?: ProjectInfo[];
}

export interface PlanSummary {
  plan_id: string;
  title: string;
  status: string;
  decision: string;
  selected_mode: string;
  next_mode: string;
  next_command: string;
  diagram_mode?: string;
  updated_at: string;
  project_id?: string;
  is_valid?: boolean;
  is_archived?: boolean;
  is_done?: boolean;
  error_count?: number;
}

export interface PlanListResponse {
  plans?: PlanSummary[];
}

export interface PlanDetail {
  summary: PlanSummary;
  frontmatter?: Record<string, unknown>;
  sections: Record<string, string>;
  errors?: string[];
}

export interface RouteInfo {
  projectId: string;
  planId: string;
}

export type ActivityTone = "info" | "ok" | "warn" | "error";
export type ActivityFilter = "all" | "plan" | "codex" | "system";
export type ActivityRunState = "RUNNING" | "SUCCESS" | "FAIL" | "IDLE";

export interface ActivityMeta {
  run_state?: ActivityRunState;
  phase?: string;
  blocker?: string;
  evidence?: string;
  source?: string;
}

export interface ActivityItem {
  eventType: string;
  eventLabel: string;
  tone: ActivityTone;
  message: string;
  detail: string;
  ts: string;
  meta?: ActivityMeta;
}

export interface StartGateResult {
  ok: boolean;
  required: string;
  reason: string;
}

export type TimelineStepState = "done" | "current" | "upcoming";
