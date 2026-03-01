import Fastify from "fastify";
import fs from "node:fs/promises";
import path from "node:path";
import { loadPlanByFilePath, loadPlanById, loadPlans } from "../lib/plan-store.js";
import { watchPlans } from "./watch-plans.js";
import { SSEStream } from "./sse-stream.js";
import { parsePlanFileContent } from "../parser/plan-parser.js";
import { validateParsedPlan } from "../schema/validate-plan.js";
import { serializePlan } from "../lib/plan-serializer.js";
import {
  applyAcceptanceCriteriaMutation,
  applyDecisionMutation,
  applyGateMutation,
  applyHandoffMutation,
  applyStatusMutation,
  applyTaskMutation,
  applyWipMutation
} from "../lib/plan-mutations.js";
import { runCodexAction as runCodexActionDefault } from "../lib/codex-runner.js";
import { archivePlanFile } from "../lib/plan-archive.js";
import type { ParsedPlan, PlanRecord } from "../types.js";

function toDetail(plan: PlanRecord) {
  return {
    summary: plan.summary,
    frontmatter: plan.parsed?.frontmatter ?? {},
    sections: plan.parsed?.sections ?? {},
    errors: plan.errors
  };
}

interface ProjectContext {
  project_id: string;
  project_dir: string;
}

function scopeKey(projectId: string, planId: string) {
  return `${projectId}::${planId}`;
}

function withProjectSummary(projectId: string, plan: PlanRecord): PlanRecord {
  return {
    ...plan,
    summary: {
      ...plan.summary,
      project_id: projectId
    }
  };
}

function normalizeProjects(options): ProjectContext[] {
  if (Array.isArray(options.projects) && options.projects.length > 0) {
    const seen = new Set<string>();
    return options.projects.map((item) => {
      const project_id = String(item.project_id || "").trim();
      const project_dir = path.resolve(item.project_dir);
      if (!project_id) {
        throw new Error("Invalid project_id in projects.");
      }
      if (seen.has(project_id)) {
        throw new Error(`Duplicate project_id: ${project_id}`);
      }
      seen.add(project_id);
      return { project_id, project_dir };
    });
  }
  return [{ project_id: "default", project_dir: path.resolve(options.projectDir ?? process.cwd()) }];
}

export async function createServer(options) {
  const { withWatcher = true, runCodexAction = runCodexActionDefault, workspaceName } = options;
  const projectContexts = normalizeProjects(options);
  const defaultProjectId = projectContexts[0].project_id;
  const projectMap = new Map(projectContexts.map((item) => [item.project_id, item]));
  const fastify = Fastify({ logger: false });
  const stream = new SSEStream(500);

  function getProject(projectId: string): ProjectContext | null {
    return projectMap.get(projectId) ?? null;
  }

  async function broadcastPlanEvent(projectId: string, planId: string, type: string) {
    const project = getProject(projectId);
    if (!project) {
      return;
    }
    const plan = await loadPlanById(project.project_dir, planId, { includeDone: true });
    const payload = plan
      ? {
          event_type: type,
          project_id: projectId,
          plan_id: plan.summary.plan_id,
          summary: withProjectSummary(projectId, plan).summary,
          updated_at: Date.now()
        }
      : { event_type: type, project_id: projectId, plan_id: planId, summary: null, updated_at: Date.now() };
    stream.publish(type, payload, scopeKey(projectId, planId));
  }

  async function persistMutation(
    projectId: string,
    planId: string,
    expectedUpdatedAt: string | undefined,
    mutator: (parsed: ParsedPlan) => ParsedPlan
  ) {
    const project = getProject(projectId);
    if (!project) {
      return {
        statusCode: 404,
        payload: { error: "Project not found", error_code: "PROJECT_NOT_FOUND", project_id: projectId }
      };
    }
    const existing = await loadPlanById(project.project_dir, planId);
    if (!existing) {
      return {
        statusCode: 404,
        payload: { error: "Plan not found", error_code: "PLAN_NOT_FOUND", plan_id: planId }
      };
    }
    if (!existing.parsed) {
      return {
        statusCode: 409,
        payload: { error: "Plan is invalid and cannot be mutated", error_code: "PLAN_INVALID" }
      };
    }

    const previousUpdatedAt = existing.summary.updated_at || "";
    const warning =
      expectedUpdatedAt && expectedUpdatedAt !== previousUpdatedAt
        ? "Plan changed since last read. Last-write-wins applied."
        : undefined;

    let nextParsed: ParsedPlan;
    try {
      nextParsed = mutator(existing.parsed);
    } catch (err) {
      return {
        statusCode: 400,
        payload: { error: err instanceof Error ? err.message : String(err), error_code: "BAD_REQUEST" }
      };
    }
    nextParsed = {
      ...nextParsed,
      frontmatter: {
        ...nextParsed.frontmatter,
        updated_at: new Date().toISOString()
      }
    };

    const markdown = serializePlan(nextParsed);
    const reparsed = parsePlanFileContent(markdown, existing.summary.file_path);
    const errors = validateParsedPlan(reparsed);
    if (errors.length > 0) {
      return {
        statusCode: 400,
        payload: { error: "Mutation produced invalid plan", error_code: "PLAN_INVALID", errors }
      };
    }

    await fs.writeFile(existing.summary.file_path, markdown, "utf8");

    await broadcastPlanEvent(projectId, planId, "plan_updated");
    const updated = await loadPlanById(project.project_dir, planId, { includeDone: true });
    return {
      statusCode: 200,
      payload: {
        summary: updated ? withProjectSummary(projectId, updated).summary : withProjectSummary(projectId, existing).summary,
        write_warning: warning
      }
    };
  }

  function checklistAllChecked(section: string | undefined): boolean {
    if (!section) {
      return false;
    }
    const lines = section.split(/\r?\n/);
    let found = false;
    for (const line of lines) {
      const m = line.match(/^- \[( |x|X)\]/);
      if (!m) {
        continue;
      }
      found = true;
      if (m[1].toLowerCase() !== "x") {
        return false;
      }
    }
    return found;
  }

  fastify.get("/api/health", async () => ({ ok: true }));

  fastify.get("/api/projects", async () => ({
    workspace: workspaceName ?? null,
    projects: projectContexts
  }));

  fastify.get("/api/plans", async (request) => {
    const query = request.query as { include_done?: string };
    const includeDone = query?.include_done === "true";
    const project = getProject(defaultProjectId)!;
    const plans = await loadPlans(project.project_dir, { includeDone });
    return {
      plans: plans.map((item) => withProjectSummary(defaultProjectId, item).summary)
    };
  });

  fastify.get("/api/plans/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const query = request.query as { include_done?: string };
    const includeDone = query?.include_done === "true";
    const project = getProject(defaultProjectId)!;
    const plan = await loadPlanById(project.project_dir, id, { includeDone });
    if (!plan) {
      reply.code(404);
      return { error: "Plan not found", error_code: "PLAN_NOT_FOUND", plan_id: id };
    }
    return toDetail(withProjectSummary(defaultProjectId, plan));
  });

  fastify.get("/api/plans/:id/events", async (request, reply) => {
    const { id } = request.params as { id: string };
    reply.raw.setHeader("Content-Type", "text/event-stream");
    reply.raw.setHeader("Cache-Control", "no-cache");
    reply.raw.setHeader("Connection", "keep-alive");
    reply.raw.setHeader("X-Accel-Buffering", "no");
    const header = request.headers["last-event-id"];
    const lastEventId = Array.isArray(header) ? header[0] : header;
    stream.subscribe(scopeKey(defaultProjectId, id), reply, lastEventId);

    request.raw.on("close", () => {
      stream.unsubscribe(scopeKey(defaultProjectId, id), reply);
    });

    return reply;
  });

  fastify.patch("/api/plans/:id/status", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = (request.body ?? {}) as { status?: string; expected_updated_at?: string };
    if (!body.status || typeof body.status !== "string") {
      reply.code(400);
      return { error: "Missing status", error_code: "BAD_REQUEST" };
    }
    const result = await persistMutation(defaultProjectId, id, body.expected_updated_at, (parsed) =>
      applyStatusMutation(parsed, body.status as string)
    );
    reply.code(result.statusCode);
    return result.payload;
  });

  fastify.patch("/api/plans/:id/decision", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = (request.body ?? {}) as {
      decision?: "GO" | "NO_GO";
      expected_updated_at?: string;
    };
    if (body.decision !== "GO" && body.decision !== "NO_GO") {
      reply.code(400);
      return { error: "Invalid decision", error_code: "BAD_REQUEST" };
    }
    const result = await persistMutation(defaultProjectId, id, body.expected_updated_at, (parsed) =>
      applyDecisionMutation(parsed, body.decision as "GO" | "NO_GO")
    );
    reply.code(result.statusCode);
    return result.payload;
  });

  fastify.patch("/api/plans/:id/task", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = (request.body ?? {}) as {
      task_index?: number;
      checked?: boolean;
      expected_updated_at?: string;
    };
    if (!Number.isInteger(body.task_index) || typeof body.checked !== "boolean") {
      reply.code(400);
      return { error: "Invalid task payload", error_code: "BAD_REQUEST" };
    }
    const result = await persistMutation(defaultProjectId, id, body.expected_updated_at, (parsed) =>
      applyTaskMutation(parsed, body.task_index as number, body.checked as boolean)
    );
    reply.code(result.statusCode);
    return result.payload;
  });

  fastify.patch("/api/plans/:id/gate", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = (request.body ?? {}) as {
      gate_index?: number;
      checked?: boolean;
      expected_updated_at?: string;
    };
    if (!Number.isInteger(body.gate_index) || typeof body.checked !== "boolean") {
      reply.code(400);
      return { error: "Invalid gate payload", error_code: "BAD_REQUEST" };
    }
    const result = await persistMutation(defaultProjectId, id, body.expected_updated_at, (parsed) =>
      applyGateMutation(parsed, body.gate_index as number, body.checked as boolean)
    );
    reply.code(result.statusCode);
    return result.payload;
  });

  fastify.post("/api/plans/:id/progress", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = (request.body ?? {}) as {
      task_updates?: Array<{ index: number; checked: boolean }>;
      ac_updates?: Array<{ index: number; checked: boolean }>;
      wip?: { status?: string; blockers?: string; next_step?: string };
      handoff?: { selected_mode?: string; next_command?: string; next_mode?: string; status?: string };
      expected_updated_at?: string;
    };

    const result = await persistMutation(defaultProjectId, id, body.expected_updated_at, (parsed) => {
      let next = parsed;
      for (const item of body.task_updates ?? []) {
        if (!Number.isInteger(item.index) || typeof item.checked !== "boolean") {
          throw new Error("Invalid task_updates payload.");
        }
        next = applyTaskMutation(next, item.index, item.checked);
      }
      for (const item of body.ac_updates ?? []) {
        if (!Number.isInteger(item.index) || typeof item.checked !== "boolean") {
          throw new Error("Invalid ac_updates payload.");
        }
        next = applyAcceptanceCriteriaMutation(next, item.index, item.checked);
      }
      if (body.wip) {
        next = applyWipMutation(next, body.wip);
      }
      if (body.handoff) {
        next = applyHandoffMutation(next, body.handoff);
      }
      return next;
    });
    reply.code(result.statusCode);
    return result.payload;
  });

  fastify.post("/api/plans/:id/complete", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = (request.body ?? {}) as { check_passed?: boolean };
    if (body.check_passed !== true) {
      reply.code(400);
      return {
        error: "Completion requires check_passed=true.",
        error_code: "CHECK_NOT_PASSED"
      };
    }

    const project = getProject(defaultProjectId)!;
    const existing = await loadPlanById(project.project_dir, id);
    if (!existing) {
      reply.code(404);
      return { error: "Plan not found", error_code: "PLAN_NOT_FOUND", plan_id: id };
    }
    if (!existing.parsed) {
      reply.code(409);
      return { error: "Plan is invalid and cannot be completed", error_code: "PLAN_INVALID" };
    }

    const errors: string[] = [];
    if (existing.parsed.frontmatter.status !== "done") {
      errors.push("status must be done");
    }
    if (existing.parsed.frontmatter.next_command !== "done") {
      errors.push("next_command must be done");
    }
    if (existing.parsed.frontmatter.next_mode !== "done") {
      errors.push("next_mode must be done");
    }
    if (!checklistAllChecked(existing.parsed.sections["Acceptance Criteria"])) {
      errors.push("all Acceptance Criteria checklist items must be checked");
    }

    if (errors.length > 0) {
      reply.code(400);
      return { error: "Completion gate failed", error_code: "COMPLETION_GATE_FAILED", errors };
    }

    const archivedPath = await archivePlanFile(project.project_dir, existing.summary.file_path);
    const updated = await loadPlanById(project.project_dir, id, { includeDone: true });

    await broadcastPlanEvent(defaultProjectId, id, "plan_updated");
    stream.publish(
      "plan_archived",
      {
        event_type: "plan_archived",
        project_id: defaultProjectId,
        plan_id: id,
        archived_path: archivedPath,
        updated_at: Date.now()
      },
      scopeKey(defaultProjectId, id)
    );

    return {
      summary: updated ? withProjectSummary(defaultProjectId, updated).summary : withProjectSummary(defaultProjectId, existing).summary,
      archived_path: archivedPath
    };
  });

  fastify.post("/api/codex/action", async (request, reply) => {
    const body = (request.body ?? {}) as {
      plan_id?: string;
      action_type?: "start" | "plan" | "build" | "check" | "research" | "fix";
      mode_hint?: "Plan" | "Build";
      prompt?: string;
    };
    if (!body.plan_id || !body.action_type) {
      reply.code(400);
      return { error: "Missing plan_id or action_type", error_code: "BAD_REQUEST" };
    }
    const result = await runCodexAction({
      plan_id: body.plan_id,
      action_type: body.action_type,
      mode_hint: body.mode_hint,
      prompt: body.prompt
    });
    reply.code(result.status === "completed" ? 200 : 500);
    return result;
  });

  fastify.get("/api/projects/:project_id/plans", async (request, reply) => {
    const { project_id } = request.params as { project_id: string };
    const project = getProject(project_id);
    if (!project) {
      reply.code(404);
      return { error: "Project not found", error_code: "PROJECT_NOT_FOUND", project_id };
    }
    const query = request.query as { include_done?: string };
    const includeDone = query?.include_done === "true";
    const plans = await loadPlans(project.project_dir, { includeDone });
    return {
      plans: plans.map((item) => withProjectSummary(project_id, item).summary)
    };
  });

  fastify.get("/api/projects/:project_id/plans/:id", async (request, reply) => {
    const { project_id, id } = request.params as { project_id: string; id: string };
    const project = getProject(project_id);
    if (!project) {
      reply.code(404);
      return { error: "Project not found", error_code: "PROJECT_NOT_FOUND", project_id };
    }
    const query = request.query as { include_done?: string };
    const includeDone = query?.include_done === "true";
    const plan = await loadPlanById(project.project_dir, id, { includeDone });
    if (!plan) {
      reply.code(404);
      return { error: "Plan not found", error_code: "PLAN_NOT_FOUND", plan_id: id };
    }
    return toDetail(withProjectSummary(project_id, plan));
  });

  fastify.get("/api/projects/:project_id/plans/:id/events", async (request, reply) => {
    const { project_id, id } = request.params as { project_id: string; id: string };
    if (!getProject(project_id)) {
      reply.code(404);
      return { error: "Project not found", error_code: "PROJECT_NOT_FOUND", project_id };
    }
    reply.raw.setHeader("Content-Type", "text/event-stream");
    reply.raw.setHeader("Cache-Control", "no-cache");
    reply.raw.setHeader("Connection", "keep-alive");
    reply.raw.setHeader("X-Accel-Buffering", "no");
    const header = request.headers["last-event-id"];
    const lastEventId = Array.isArray(header) ? header[0] : header;
    const key = scopeKey(project_id, id);
    stream.subscribe(key, reply, lastEventId);
    request.raw.on("close", () => {
      stream.unsubscribe(key, reply);
    });
    return reply;
  });

  fastify.patch("/api/projects/:project_id/plans/:id/status", async (request, reply) => {
    const { project_id, id } = request.params as { project_id: string; id: string };
    const body = (request.body ?? {}) as { status?: string; expected_updated_at?: string };
    if (!body.status || typeof body.status !== "string") {
      reply.code(400);
      return { error: "Missing status", error_code: "BAD_REQUEST" };
    }
    const result = await persistMutation(project_id, id, body.expected_updated_at, (parsed) =>
      applyStatusMutation(parsed, body.status as string)
    );
    reply.code(result.statusCode);
    return result.payload;
  });

  fastify.patch("/api/projects/:project_id/plans/:id/decision", async (request, reply) => {
    const { project_id, id } = request.params as { project_id: string; id: string };
    const body = (request.body ?? {}) as { decision?: "GO" | "NO_GO"; expected_updated_at?: string };
    if (body.decision !== "GO" && body.decision !== "NO_GO") {
      reply.code(400);
      return { error: "Invalid decision", error_code: "BAD_REQUEST" };
    }
    const result = await persistMutation(project_id, id, body.expected_updated_at, (parsed) =>
      applyDecisionMutation(parsed, body.decision as "GO" | "NO_GO")
    );
    reply.code(result.statusCode);
    return result.payload;
  });

  fastify.patch("/api/projects/:project_id/plans/:id/task", async (request, reply) => {
    const { project_id, id } = request.params as { project_id: string; id: string };
    const body = (request.body ?? {}) as { task_index?: number; checked?: boolean; expected_updated_at?: string };
    if (!Number.isInteger(body.task_index) || typeof body.checked !== "boolean") {
      reply.code(400);
      return { error: "Invalid task payload", error_code: "BAD_REQUEST" };
    }
    const result = await persistMutation(project_id, id, body.expected_updated_at, (parsed) =>
      applyTaskMutation(parsed, body.task_index as number, body.checked as boolean)
    );
    reply.code(result.statusCode);
    return result.payload;
  });

  fastify.patch("/api/projects/:project_id/plans/:id/gate", async (request, reply) => {
    const { project_id, id } = request.params as { project_id: string; id: string };
    const body = (request.body ?? {}) as { gate_index?: number; checked?: boolean; expected_updated_at?: string };
    if (!Number.isInteger(body.gate_index) || typeof body.checked !== "boolean") {
      reply.code(400);
      return { error: "Invalid gate payload", error_code: "BAD_REQUEST" };
    }
    const result = await persistMutation(project_id, id, body.expected_updated_at, (parsed) =>
      applyGateMutation(parsed, body.gate_index as number, body.checked as boolean)
    );
    reply.code(result.statusCode);
    return result.payload;
  });

  fastify.post("/api/projects/:project_id/plans/:id/progress", async (request, reply) => {
    const { project_id, id } = request.params as { project_id: string; id: string };
    const body = (request.body ?? {}) as {
      task_updates?: Array<{ index: number; checked: boolean }>;
      ac_updates?: Array<{ index: number; checked: boolean }>;
      wip?: { status?: string; blockers?: string; next_step?: string };
      handoff?: { selected_mode?: string; next_command?: string; next_mode?: string; status?: string };
      expected_updated_at?: string;
    };
    const result = await persistMutation(project_id, id, body.expected_updated_at, (parsed) => {
      let next = parsed;
      for (const item of body.task_updates ?? []) {
        if (!Number.isInteger(item.index) || typeof item.checked !== "boolean") {
          throw new Error("Invalid task_updates payload.");
        }
        next = applyTaskMutation(next, item.index, item.checked);
      }
      for (const item of body.ac_updates ?? []) {
        if (!Number.isInteger(item.index) || typeof item.checked !== "boolean") {
          throw new Error("Invalid ac_updates payload.");
        }
        next = applyAcceptanceCriteriaMutation(next, item.index, item.checked);
      }
      if (body.wip) {
        next = applyWipMutation(next, body.wip);
      }
      if (body.handoff) {
        next = applyHandoffMutation(next, body.handoff);
      }
      return next;
    });
    reply.code(result.statusCode);
    return result.payload;
  });

  fastify.post("/api/projects/:project_id/plans/:id/complete", async (request, reply) => {
    const { project_id, id } = request.params as { project_id: string; id: string };
    const body = (request.body ?? {}) as { check_passed?: boolean };
    if (body.check_passed !== true) {
      reply.code(400);
      return { error: "Completion requires check_passed=true.", error_code: "CHECK_NOT_PASSED" };
    }
    const project = getProject(project_id);
    if (!project) {
      reply.code(404);
      return { error: "Project not found", error_code: "PROJECT_NOT_FOUND", project_id };
    }
    const existing = await loadPlanById(project.project_dir, id);
    if (!existing) {
      reply.code(404);
      return { error: "Plan not found", error_code: "PLAN_NOT_FOUND", plan_id: id };
    }
    if (!existing.parsed) {
      reply.code(409);
      return { error: "Plan is invalid and cannot be completed", error_code: "PLAN_INVALID" };
    }
    const errors: string[] = [];
    if (existing.parsed.frontmatter.status !== "done") {
      errors.push("status must be done");
    }
    if (existing.parsed.frontmatter.next_command !== "done") {
      errors.push("next_command must be done");
    }
    if (existing.parsed.frontmatter.next_mode !== "done") {
      errors.push("next_mode must be done");
    }
    if (!checklistAllChecked(existing.parsed.sections["Acceptance Criteria"])) {
      errors.push("all Acceptance Criteria checklist items must be checked");
    }
    if (errors.length > 0) {
      reply.code(400);
      return { error: "Completion gate failed", error_code: "COMPLETION_GATE_FAILED", errors };
    }
    const archivedPath = await archivePlanFile(project.project_dir, existing.summary.file_path);
    const updated = await loadPlanById(project.project_dir, id, { includeDone: true });
    await broadcastPlanEvent(project_id, id, "plan_updated");
    stream.publish(
      "plan_archived",
      { event_type: "plan_archived", project_id, plan_id: id, archived_path: archivedPath, updated_at: Date.now() },
      scopeKey(project_id, id)
    );
    return {
      summary: updated ? withProjectSummary(project_id, updated).summary : withProjectSummary(project_id, existing).summary,
      archived_path: archivedPath
    };
  });

  fastify.post("/api/projects/:project_id/codex/action", async (request, reply) => {
    const { project_id } = request.params as { project_id: string };
    if (!getProject(project_id)) {
      reply.code(404);
      return { error: "Project not found", error_code: "PROJECT_NOT_FOUND", project_id };
    }
    const body = (request.body ?? {}) as {
      plan_id?: string;
      action_type?: "start" | "plan" | "build" | "check" | "research" | "fix";
      mode_hint?: "Plan" | "Build";
      prompt?: string;
    };
    if (!body.plan_id || !body.action_type) {
      reply.code(400);
      return { error: "Missing plan_id or action_type", error_code: "BAD_REQUEST" };
    }
    const result = await runCodexAction({
      plan_id: body.plan_id,
      action_type: body.action_type,
      mode_hint: body.mode_hint,
      prompt: body.prompt
    });
    reply.code(result.status === "completed" ? 200 : 500);
    return result;
  });

  fastify.get("/assets/app.js", async (_request, reply) => {
    reply.type("application/javascript");
    return `
const projectEl = document.querySelector("#project-filter");
const planListEl = document.querySelector("#plan-list");
const detailEl = document.querySelector("#plan-detail");
const statusEl = document.querySelector("#status");
const filterEl = document.querySelector("#plan-filter");
let allPlansCache = [];

function currentFilter() {
  return filterEl?.value || "active";
}

function currentProjectId() {
  return projectEl?.value || "";
}

function projectApiBase(projectId) {
  return "/api/projects/" + encodeURIComponent(projectId);
}

async function fetchProjects() {
  const res = await fetch("/api/projects");
  const data = await res.json();
  return data.projects ?? [];
}

async function fetchPlans(projectId, includeDone) {
  const res = await fetch(projectApiBase(projectId) + "/plans?include_done=" + (includeDone ? "true" : "false"));
  const data = await res.json();
  return data.plans ?? [];
}

function renderProjects(projects) {
  projectEl.innerHTML = projects.map((p) =>
    '<option value="' + p.project_id + '">' + p.project_id + " - " + p.project_dir + "</option>"
  ).join("");
}

function renderList(plans) {
  const mode = currentFilter();
  const filtered = plans.filter((p) => {
    if (mode === "done") {
      return !!p.is_done || !!p.is_archived;
    }
    if (mode === "active") {
      return !p.is_done && !p.is_archived;
    }
    return true;
  });

  if (!filtered.length) {
    planListEl.innerHTML = "<li>No plans found in selected project</li>";
    return;
  }
  planListEl.innerHTML = filtered.map((p) => {
    const invalid = p.is_valid ? "" : " (invalid)";
    const archived = p.is_archived ? " [archived]" : "";
    return '<li><button data-plan-id="' + p.plan_id + '">' + p.plan_id + " - " + p.title + archived + invalid + '</button></li>';
  }).join("");
  for (const button of planListEl.querySelectorAll("button[data-plan-id]")) {
    button.addEventListener("click", () => {
      const id = button.getAttribute("data-plan-id");
      const projectId = currentProjectId();
      location.hash = "#/projects/" + encodeURIComponent(projectId) + "/plans/" + encodeURIComponent(id);
      loadDetail();
    });
  }
}

async function loadDetail() {
  const hash = location.hash || "";
  const m = hash.match(/^#\\/projects\\/([^/]+)\\/plans\\/(.+)$/);
  if (!m) {
    detailEl.innerHTML = "<p>Select a plan.</p>";
    return;
  }
  const projectId = decodeURIComponent(m[1]);
  const id = decodeURIComponent(m[2]);
  const res = await fetch(projectApiBase(projectId) + "/plans/" + encodeURIComponent(id) + "?include_done=true");
  if (!res.ok) {
    detailEl.innerHTML = "<p>Plan not found.</p>";
    return;
  }
  const data = await res.json();
  const errors = (data.errors || []).map((e) => "<li>" + e + "</li>").join("");
  const sections = Object.entries(data.sections || {}).map(([name, content]) =>
    "<section><h4>" + name + "</h4><pre>" + content + "</pre></section>"
  ).join("");

  detailEl.innerHTML = \`
    <h3>\${data.summary.plan_id} - \${data.summary.title}</h3>
    <p>Status: \${data.summary.status} | Decision: \${data.summary.decision}</p>
    <p>Mode: \${data.summary.selected_mode} -> \${data.summary.next_mode}</p>
    <p>Next: \${data.summary.next_command}</p>
    <p>Archived: \${data.summary.is_archived ? "yes" : "no"}</p>
    <div>
      <button id="set-status-active">Set Status Active</button>
      <button id="toggle-decision">Toggle Decision</button>
      <button id="toggle-task-0">Toggle Task 1</button>
      <button id="toggle-gate-0">Toggle Gate 1</button>
      <button id="complete-archive">Complete & Archive</button>
      <button id="run-codex-plan">Send Plan Action to Codex</button>
    </div>
    <h4>Validation</h4>
    <ul>\${errors || "<li>No validation errors</li>"}</ul>
    \${sections}
  \`;
  bindActions(projectId, id, data);
  attachStream(projectId, id);
}

async function patch(url, payload) {
  const res = await fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  return await res.json();
}

function parseFirstChecklistState(sectionText) {
  const m = (sectionText || "").match(/^- \\[( |x|X)\\]/m);
  return m ? (m[1].toLowerCase() === "x") : false;
}

function bindActions(projectId, id, data) {
  const updatedAt = data.summary.updated_at || "";
  const base = projectApiBase(projectId) + "/plans/" + encodeURIComponent(id);
  const statusBtn = document.querySelector("#set-status-active");
  const decisionBtn = document.querySelector("#toggle-decision");
  const taskBtn = document.querySelector("#toggle-task-0");
  const gateBtn = document.querySelector("#toggle-gate-0");
  const completeBtn = document.querySelector("#complete-archive");
  const codexBtn = document.querySelector("#run-codex-plan");

  statusBtn?.addEventListener("click", async () => {
    const out = await patch(base + "/status", {
      status: "active",
      expected_updated_at: updatedAt
    });
    statusEl.textContent = out.write_warning || "Status updated.";
    loadDetail();
    loadList();
  });

  decisionBtn?.addEventListener("click", async () => {
    const nextDecision = data.summary.decision === "GO" ? "NO_GO" : "GO";
    const out = await patch(base + "/decision", {
      decision: nextDecision,
      expected_updated_at: updatedAt
    });
    statusEl.textContent = out.write_warning || "Decision updated.";
    loadDetail();
    loadList();
  });

  taskBtn?.addEventListener("click", async () => {
    const current = parseFirstChecklistState(data.sections["Implementation Tasks"]);
    const out = await patch(base + "/task", {
      task_index: 0,
      checked: !current,
      expected_updated_at: updatedAt
    });
    statusEl.textContent = out.write_warning || "Task updated.";
    loadDetail();
    loadList();
  });

  gateBtn?.addEventListener("click", async () => {
    const current = parseFirstChecklistState(data.sections["Go/No-Go Checklist"]);
    const out = await patch(base + "/gate", {
      gate_index: 0,
      checked: !current,
      expected_updated_at: updatedAt
    });
    statusEl.textContent = out.write_warning || "Gate updated.";
    loadDetail();
    loadList();
  });

  completeBtn?.addEventListener("click", async () => {
    const res = await fetch(base + "/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ check_passed: true })
    });
    const out = await res.json();
    if (!res.ok) {
      statusEl.textContent = out.error || out.error_code || "Complete failed.";
      return;
    }
    statusEl.textContent = "Plan archived: " + (out.archived_path || "done");
    loadDetail();
    loadList();
  });

  codexBtn?.addEventListener("click", async () => {
    const res = await fetch(projectApiBase(projectId) + "/codex/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        plan_id: id,
        action_type: "plan",
        mode_hint: "Plan"
      })
    });
    const out = await res.json();
    statusEl.textContent = "Codex action: " + (out.status || out.error_code || "unknown");
  });
}

let currentStream;
let lastHeartbeatTs = 0;
let staleTimer = null;
let pollTimer = null;

function startPollingFallback() {
  if (pollTimer) {
    return;
  }
  pollTimer = setInterval(() => {
    loadDetail();
    loadList();
  }, 15000);
}

function stopPollingFallback() {
  if (!pollTimer) {
    return;
  }
  clearInterval(pollTimer);
  pollTimer = null;
}

function attachStream(projectId, id) {
  if (currentStream) {
    currentStream.close();
  }
  currentStream = new EventSource(projectApiBase(projectId) + "/plans/" + encodeURIComponent(id) + "/events");
  if (staleTimer) {
    clearInterval(staleTimer);
  }
  staleTimer = setInterval(() => {
    if (!lastHeartbeatTs) {
      return;
    }
    if (Date.now() - lastHeartbeatTs > 60000) {
      statusEl.textContent = "Connection stale. Resyncing...";
      startPollingFallback();
      loadDetail();
      loadList();
    }
  }, 5000);
  currentStream.addEventListener("connected", () => {
    statusEl.textContent = "Connected.";
    lastHeartbeatTs = Date.now();
    stopPollingFallback();
  });
  currentStream.addEventListener("heartbeat", () => {
    lastHeartbeatTs = Date.now();
  });
  currentStream.addEventListener("resync_required", () => {
    statusEl.textContent = "Stream replay unavailable. Full resync.";
    loadDetail();
    loadList();
  });
  currentStream.addEventListener("plan_updated", () => {
    statusEl.textContent = "Live update received: plan_updated";
    loadDetail();
    loadList();
  });
  currentStream.addEventListener("plan_deleted", () => {
    statusEl.textContent = "Live update received: plan_deleted";
    loadDetail();
    loadList();
  });
  currentStream.addEventListener("plan_invalid", () => {
    statusEl.textContent = "Live update received: plan_invalid";
    loadDetail();
    loadList();
  });
  currentStream.addEventListener("plan_archived", () => {
    statusEl.textContent = "Live update received: plan_archived";
    loadDetail();
    loadList();
  });
  currentStream.onerror = () => {
    statusEl.textContent = "Disconnected. Reconnecting...";
    startPollingFallback();
  };
}

async function loadList() {
  const projectId = currentProjectId();
  if (!projectId) {
    planListEl.innerHTML = "<li>No projects configured</li>";
    return;
  }
  const includeDone = currentFilter() !== "active";
  const plans = await fetchPlans(projectId, includeDone);
  allPlansCache = plans;
  renderList(allPlansCache);
}

projectEl?.addEventListener("change", () => {
  loadList();
  loadDetail();
});

filterEl?.addEventListener("change", () => {
  loadList();
});

window.addEventListener("hashchange", () => loadDetail());
fetchProjects()
  .then((projects) => {
    renderProjects(projects);
    return loadList();
  })
  .then(() => loadDetail());
`;
  });

  fastify.get("/", async (_request, reply) => {
    reply.type("text/html");
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>KamiFlow Plan UI</title>
  <style>
    body { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial; margin: 0; background: #f4f6f8; color: #111; }
    .wrap { display: grid; grid-template-columns: 320px 1fr; min-height: 100vh; }
    aside { border-right: 1px solid #d4d8dd; background: #fff; padding: 16px; overflow: auto; }
    main { padding: 16px 24px; overflow: auto; }
    h1 { margin: 0 0 16px 0; font-size: 20px; }
    h2 { margin: 0 0 12px 0; font-size: 16px; }
    #status { color: #555; margin: 10px 0 18px; font-size: 13px; }
    ul { padding-left: 18px; }
    button { width: 100%; text-align: left; border: 1px solid #ddd; background: #fafafa; padding: 8px 10px; margin: 0 0 8px; border-radius: 8px; cursor: pointer; }
    button:hover { background: #f0f0f0; }
    pre { white-space: pre-wrap; background: #fff; border: 1px solid #ddd; border-radius: 8px; padding: 10px; }
    section { margin: 12px 0; }
  </style>
</head>
<body>
  <div class="wrap">
    <aside>
      <h1>Plans</h1>
      <label for="project-filter">Project</label>
      <select id="project-filter" style="width:100%; margin: 6px 0 12px; padding: 6px;"></select>
      <label for="plan-filter">View</label>
      <select id="plan-filter" style="width:100%; margin: 6px 0 12px; padding: 6px;">
        <option value="active">Active</option>
        <option value="done">Done</option>
        <option value="all">All</option>
      </select>
      <ul id="plan-list"></ul>
    </aside>
    <main>
      <h2>Plan Detail</h2>
      <div id="status">Waiting for updates...</div>
      <div id="plan-detail"><p>Select a plan.</p></div>
    </main>
  </div>
  <script src="/assets/app.js" type="module"></script>
</body>
</html>`;
  });

  const watchers: Array<{ close: () => Promise<void> }> = [];
  const pending = new Map<string, { type: string; timer: NodeJS.Timeout }>();
  if (withWatcher) {
    for (const project of projectContexts) {
      const watcher = watchPlans(project.project_dir, async ({ type, filePath }) => {
        const existing = await loadPlanByFilePath(project.project_dir, filePath, { includeDone: true });
        const fallbackPlanId = (filePath.split(/[\\/]/).pop() || "unknown").replace(/\.md$/i, "");
        const planId = existing?.summary.plan_id ?? fallbackPlanId;
        const eventType = existing && existing.errors.length > 0 ? "plan_invalid" : type;
        const key = scopeKey(project.project_id, planId);
        const existingPending = pending.get(key);
        if (existingPending) {
          clearTimeout(existingPending.timer);
        }
        const timer = setTimeout(async () => {
          pending.delete(key);
          await broadcastPlanEvent(project.project_id, planId, eventType);
        }, 150);
        pending.set(key, { type: eventType, timer });
      });
      watchers.push(watcher);
    }
  }

  const heartbeat = setInterval(() => {
    if (stream.getSubscriberCount() > 0) {
      stream.sendHeartbeat();
    }
  }, 20_000);

  fastify.addHook("onClose", async () => {
    clearInterval(heartbeat);
    for (const item of pending.values()) {
      clearTimeout(item.timer);
    }
    pending.clear();
    for (const watcher of watchers) {
      await watcher.close();
    }
  });

  return fastify;
}
