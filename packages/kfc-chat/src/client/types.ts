export interface TranscriptMessageItem {
  id: string;
  text: string;
  created_at: string;
  status: string;
}

export interface TranscriptBlock {
  type: "message_group" | "event_row";
  id: string;
  role: string;
  label: string;
  created_at: string;
  status: string;
  align?: "left" | "right";
  text?: string;
  items?: TranscriptMessageItem[];
}

export interface BoundSessionState {
  bound: boolean;
  state: string;
  can_bind?: boolean;
  can_prompt?: boolean;
  reason?: string;
  onboarding_command?: string;
  onboarding_title?: string;
  plan_id?: string;
  plan_path?: string;
  profile?: string;
  generated_at?: string;
  session_id?: string;
  session_path?: string;
  bound_at?: string;
  manual_resume_command?: string;
}

export interface ChatSessionPayload {
  generated_at?: string;
  updated_at?: string;
  project_dir?: string;
  host?: string;
  port?: number;
  token?: string;
  status?: string;
  busy?: boolean;
  queue_depth?: number;
  current_prompt_id?: string | null;
  last_prompt_at?: string;
  last_result?: { state?: string; text?: string } | null;
  connection_count?: number;
  transcript_path?: string;
  manual_resume_command?: string;
  bound_session: BoundSessionState;
}

export interface SessionResponse extends ChatSessionPayload {}
export interface SessionDiscoveryPreview {
  role: string;
  text: string;
  timestamp: string;
}

export interface SessionDiscoveryItem {
  session_id: string;
  file_name: string;
  file_path: string;
  relative_path: string;
  date_path: string;
  bytes: number;
  modified_at: string;
  preview_text: string;
  preview: SessionDiscoveryPreview[];
}

export interface SessionDiscoveryResponse {
  sessions_root: string;
  query: string;
  date: string;
  limit: number;
  total_matches: number;
  sessions: SessionDiscoveryItem[];
}

export interface TranscriptResponse { items: TranscriptBlock[] }
