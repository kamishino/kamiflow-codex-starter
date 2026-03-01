import { archivePlanFile } from "../../lib/plan-archive.js";
import { loadPlanById, loadPlans } from "../../lib/plan-store.js";

export function registerApiRoutes(fastify: any, deps: any): void {
  const {
    workspaceName,
    projectContexts,
    defaultProjectId,
    getProject,
    stream,
    scopeKey,
    checklistAllChecked,
    withProjectSummary,
    toDetail,
    persistMutation,
    broadcastPlanEvent,
    runCodexAction
  } = deps;

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
      deps.applyStatusMutation(parsed, body.status as string)
    );
    reply.code(result.statusCode);
    return result.payload;
  });

  fastify.patch("/api/plans/:id/decision", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = (request.body ?? {}) as { decision?: "GO" | "NO_GO"; expected_updated_at?: string };
    if (body.decision !== "GO" && body.decision !== "NO_GO") {
      reply.code(400);
      return { error: "Invalid decision", error_code: "BAD_REQUEST" };
    }
    const result = await persistMutation(defaultProjectId, id, body.expected_updated_at, (parsed) =>
      deps.applyDecisionMutation(parsed, body.decision as "GO" | "NO_GO")
    );
    reply.code(result.statusCode);
    return result.payload;
  });

  fastify.patch("/api/plans/:id/task", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = (request.body ?? {}) as { task_index?: number; checked?: boolean; expected_updated_at?: string };
    if (!Number.isInteger(body.task_index) || typeof body.checked !== "boolean") {
      reply.code(400);
      return { error: "Invalid task payload", error_code: "BAD_REQUEST" };
    }
    const result = await persistMutation(defaultProjectId, id, body.expected_updated_at, (parsed) =>
      deps.applyTaskMutation(parsed, body.task_index as number, body.checked as boolean)
    );
    reply.code(result.statusCode);
    return result.payload;
  });

  fastify.patch("/api/plans/:id/gate", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = (request.body ?? {}) as { gate_index?: number; checked?: boolean; expected_updated_at?: string };
    if (!Number.isInteger(body.gate_index) || typeof body.checked !== "boolean") {
      reply.code(400);
      return { error: "Invalid gate payload", error_code: "BAD_REQUEST" };
    }
    const result = await persistMutation(defaultProjectId, id, body.expected_updated_at, (parsed) =>
      deps.applyGateMutation(parsed, body.gate_index as number, body.checked as boolean)
    );
    reply.code(result.statusCode);
    return result.payload;
  });

  fastify.post("/api/plans/:id/progress", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = (request.body ?? {}) as any;
    const result = await persistMutation(defaultProjectId, id, body.expected_updated_at, (parsed) => {
      let next = parsed;
      for (const item of body.task_updates ?? []) {
        if (!Number.isInteger(item.index) || typeof item.checked !== "boolean") {
          throw new Error("Invalid task_updates payload.");
        }
        next = deps.applyTaskMutation(next, item.index, item.checked);
      }
      for (const item of body.ac_updates ?? []) {
        if (!Number.isInteger(item.index) || typeof item.checked !== "boolean") {
          throw new Error("Invalid ac_updates payload.");
        }
        next = deps.applyAcceptanceCriteriaMutation(next, item.index, item.checked);
      }
      if (body.wip) {
        next = deps.applyWipMutation(next, body.wip);
      }
      if (body.handoff) {
        next = deps.applyHandoffMutation(next, body.handoff);
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
      return { error: "Completion requires check_passed=true.", error_code: "CHECK_NOT_PASSED" };
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
    if (existing.parsed.frontmatter.status !== "done") errors.push("status must be done");
    if (existing.parsed.frontmatter.next_command !== "done") errors.push("next_command must be done");
    if (existing.parsed.frontmatter.next_mode !== "done") errors.push("next_mode must be done");
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
    const body = (request.body ?? {}) as any;
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
      deps.applyStatusMutation(parsed, body.status as string)
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
      deps.applyDecisionMutation(parsed, body.decision as "GO" | "NO_GO")
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
      deps.applyTaskMutation(parsed, body.task_index as number, body.checked as boolean)
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
      deps.applyGateMutation(parsed, body.gate_index as number, body.checked as boolean)
    );
    reply.code(result.statusCode);
    return result.payload;
  });

  fastify.post("/api/projects/:project_id/plans/:id/progress", async (request, reply) => {
    const { project_id, id } = request.params as { project_id: string; id: string };
    const body = (request.body ?? {}) as any;
    const result = await persistMutation(project_id, id, body.expected_updated_at, (parsed) => {
      let next = parsed;
      for (const item of body.task_updates ?? []) {
        if (!Number.isInteger(item.index) || typeof item.checked !== "boolean") {
          throw new Error("Invalid task_updates payload.");
        }
        next = deps.applyTaskMutation(next, item.index, item.checked);
      }
      for (const item of body.ac_updates ?? []) {
        if (!Number.isInteger(item.index) || typeof item.checked !== "boolean") {
          throw new Error("Invalid ac_updates payload.");
        }
        next = deps.applyAcceptanceCriteriaMutation(next, item.index, item.checked);
      }
      if (body.wip) {
        next = deps.applyWipMutation(next, body.wip);
      }
      if (body.handoff) {
        next = deps.applyHandoffMutation(next, body.handoff);
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
    if (existing.parsed.frontmatter.status !== "done") errors.push("status must be done");
    if (existing.parsed.frontmatter.next_command !== "done") errors.push("next_command must be done");
    if (existing.parsed.frontmatter.next_mode !== "done") errors.push("next_mode must be done");
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
    const body = (request.body ?? {}) as any;
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
}

