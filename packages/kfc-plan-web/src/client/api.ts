import type { PlanDetail, PlanSummary, ProjectInfo, ProjectsResponse } from "./types";

function apiBase(): string {
  const raw = document.documentElement.dataset.apiBase || "/api";
  return raw.endsWith("/") ? raw.slice(0, -1) : raw;
}

function projectApiBase(projectId: string): string {
  return apiBase() + "/projects/" + encodeURIComponent(projectId);
}

function withNoCache(url: string): string {
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}_ts=${Date.now()}`;
}

async function fetchJson(url: string): Promise<Response> {
  return await fetch(withNoCache(url), {
    cache: "no-store",
    headers: {
      "cache-control": "no-cache",
      pragma: "no-cache"
    }
  });
}

export async function fetchProjects(): Promise<{ workspace: string; projects: ProjectInfo[] }> {
  const res = await fetchJson(apiBase() + "/projects");
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
  const res = await fetchJson(projectApiBase(projectId) + "/plans?include_done=" + (includeDone ? "true" : "false"));
  if (!res.ok) {
    throw new Error("Failed to load plans.");
  }
  const data = (await res.json()) as { plans?: PlanSummary[] };
  return data.plans ?? [];
}

export async function fetchPlanDetail(projectId: string, planId: string): Promise<PlanDetail | null> {
  const res = await fetchJson(projectApiBase(projectId) + "/plans/" + encodeURIComponent(planId) + "?include_done=true");
  if (!res.ok) {
    return null;
  }
  return (await res.json()) as PlanDetail;
}
