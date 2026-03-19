export interface PlanSummary {
  project_id?: string;
  plan_id: string;
  title: string;
  status: string;
  decision: string;
  selected_mode: string;
  next_mode: string;
  next_command: string;
  diagram_mode?: string;
  updated_at: string;
  file_path: string;
  is_valid: boolean;
  error_count: number;
  duplicate_plan_id: boolean;
  is_done: boolean;
  is_archived: boolean;
  archived_at?: string;
  archived_path?: string;
  latest_runlog?: {
    event_type?: string;
    run_state?: "RUNNING" | "SUCCESS" | "FAIL" | "IDLE";
    action_type?: string;
    action_hint?: string;
    suggested_command?: string;
    status?: string;
    phase?: string;
    message?: string;
    detail?: string;
    evidence?: string;
    guardrail?: string;
    route_confidence?: number;
    fallback_route?: string;
    selected_route?: string;
    recovery_step?: string;
    onboarding_status?: string;
    onboarding_stage?: string;
    onboarding_error_code?: string;
    onboarding_recovery?: string;
    onboarding_next?: string;
    updated_at?: string;
    source?: string;
  };
}

export type ParsedPlanBodyPart =
  | { type: "raw"; value: string }
  | { type: "section"; title: string };

export interface ParsedPlan {
  filePath: string;
  fileName: string;
  frontmatter: Record<string, string>;
  body: string;
  bodyParts: ParsedPlanBodyPart[];
  sections: Record<string, string>;
}

export interface PlanRecord {
  summary: PlanSummary;
  parsed: ParsedPlan | null;
  errors: string[];
}

export interface WriteResponse {
  summary: PlanSummary;
  write_warning?: string;
}
