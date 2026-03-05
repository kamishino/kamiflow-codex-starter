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
}

export interface ParsedPlan {
  filePath: string;
  fileName: string;
  frontmatter: Record<string, string>;
  body: string;
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
