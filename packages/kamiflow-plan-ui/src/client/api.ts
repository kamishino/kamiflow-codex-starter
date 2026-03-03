import type { PlanDetail, PlanSummary, ProjectInfo, ProjectsResponse } from "./types";

function projectApiBase(projectId: string): string {
  return "/api/projects/" + encodeURIComponent(projectId);
}

export async function fetchProjects(): Promise<{ workspace: string; projects: ProjectInfo[] }> {
  const res = await fetch("/api/projects");
  if (!res.ok) {
    throw new Error("Failed to load projects.");
  }
  const data = (await res.json()) as ProjectsResponse;
  return {
    workspace: data.workspace || "-default-",
    projects: data.projects ?? []
  };
}

export async function fetchPlans(projectId: string, includeDone: boolean): Promise<PlanSummary[]> {
  const res = await fetch(projectApiBase(projectId) + "/plans?include_done=" + (includeDone ? "true" : "false"));
  if (!res.ok) {
    throw new Error("Failed to load plans.");
  }
  const data = (await res.json()) as { plans?: PlanSummary[] };
  return data.plans ?? [];
}

export async function fetchPlanDetail(projectId: string, planId: string): Promise<PlanDetail | null> {
  const res = await fetch(projectApiBase(projectId) + "/plans/" + encodeURIComponent(planId) + "?include_done=true");
  if (!res.ok) {
    return null;
  }
  return (await res.json()) as PlanDetail;
}
