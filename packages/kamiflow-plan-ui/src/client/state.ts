import { signal } from "@preact/signals";
import type {
  ActivityDensity,
  ActivityFilter,
  ActivityItem,
  PlanDetail,
  PlanSummary,
  ProjectInfo,
  ResolvedTheme,
  RouteInfo,
  ThemePreference
} from "./types";

export const statusMessage = signal("Waiting for updates...");
export const workspaceName = signal("-default-");
export const projects = signal<ProjectInfo[]>([]);
export const selectedProjectId = signal("");
export const planFilter = signal("active");
export const plans = signal<PlanSummary[]>([]);
export const route = signal<RouteInfo | null>(null);
export const detail = signal<PlanDetail | null>(null);
export const emptyPanelState = signal<{ reason: string; nextStep: string } | null>(null);
export const activityItems = signal<ActivityItem[]>([]);
export const activityFilter = signal<ActivityFilter>("all");
export const activityDensity = signal<ActivityDensity>("compact");
export const themePreference = signal<ThemePreference>("system");
export const resolvedTheme = signal<ResolvedTheme>("light");
