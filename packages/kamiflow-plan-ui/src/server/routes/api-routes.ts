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

  function validateChecklistUpdates(items: any, fieldName: string): void {
    if (!Array.isArray(items)) {
      throw new Error(`Invalid ${fieldName} payload.`);
    }
    for (const item of items) {
      if (!Number.isInteger(item?.index) || typeof item?.checked !== "boolean") {
        throw new Error(`Invalid ${fieldName} payload.`);
      }
    }
  }

  async function completePlan(projectId: string, planId: string) {
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
        payload: { error: "Plan is invalid and cannot be completed", error_code: "PLAN_INVALID" }
      };
    }
    const errors: string[] = [];
    if (existing.parsed.frontmatter.status !== "done") errors.push("status must be done");
    if (existing.parsed.frontmatter.next_command !== "done") errors.push("next_command must be done");
    if (existing.parsed.frontmatter.next_mode !== "done") errors.push("next_mode must be done");
    if (!checklistAllChecked(existing.parsed.sections["Acceptance Criteria"])) {
      errors.push("all Acceptance Criteria checklist items must be checked");
    }
    if (errors.length > 0) {
      return {
        statusCode: 400,
        payload: { error: "Completion gate failed", error_code: "COMPLETION_GATE_FAILED", errors }
      };
    }

    const archivedPath = await archivePlanFile(project.project_dir, existing.summary.file_path);
    const updated = await loadPlanById(project.project_dir, planId, { includeDone: true });
    await broadcastPlanEvent(projectId, planId, "plan_updated");
    stream.publish(
      "plan_archived",
      { event_type: "plan_archived", project_id: projectId, plan_id: planId, archived_path: archivedPath, updated_at: Date.now() },
      scopeKey(projectId, planId)
    );
    return {
      statusCode: 200,
      payload: {
        summary: updated
          ? withProjectSummary(projectId, updated).summary
          : withProjectSummary(projectId, existing).summary,
        archived_path: archivedPath
      }
    };
  }

  async function applyAutomation(projectId: string, planId: string, body: any) {
    if (body.action_type !== "build_result" && body.action_type !== "check_result") {
      return {
        statusCode: 400,
        payload: { error: "Invalid action_type", error_code: "BAD_REQUEST" }
      };
    }
    if (body.task_updates !== undefined) {
      validateChecklistUpdates(body.task_updates, "task_updates");
    }
    if (body.ac_updates !== undefined) {
      validateChecklistUpdates(body.ac_updates, "ac_updates");
    }
    if (body.action_type === "check_result" && body?.check?.result !== "PASS" && body?.check?.result !== "BLOCK") {
      return {
        statusCode: 400,
        payload: { error: "Invalid check result", error_code: "BAD_REQUEST" }
      };
    }

    const applied: string[] = [];
    const result = await persistMutation(projectId, planId, body.expected_updated_at, (parsed) => {
      let next = parsed;
      for (const item of body.task_updates ?? []) {
        next = deps.applyTaskMutation(next, item.index, item.checked);
        applied.push(`task:${item.index}=${item.checked ? "checked" : "unchecked"}`);
      }
      for (const item of body.ac_updates ?? []) {
        next = deps.applyAcceptanceCriteriaMutation(next, item.index, item.checked);
        applied.push(`acceptance_criteria:${item.index}=${item.checked ? "checked" : "unchecked"}`);
      }
      const wipPayload = body.wip && typeof body.wip === "object" ? { ...body.wip } : null;
      if (body.action_type === "check_result" && Array.isArray(body?.check?.findings) && body.check.findings.length > 0) {
        const findings = body.check.findings.map((item: any) => String(item).trim()).filter((item: string) => item.length > 0);
        if (findings.length > 0) {
          const baseEvidence = Array.isArray(wipPayload?.evidence) ? wipPayload.evidence : [];
          const mergedEvidence = [
            ...baseEvidence,
            ...findings.map((item: string) => `finding:${item}`)
          ];
          if (wipPayload) {
            wipPayload.evidence = mergedEvidence;
          } else {
            body.wip = { evidence: mergedEvidence };
          }
        }
      }
      if (wipPayload || body.wip) {
        next = deps.applyWipMutation(next, wipPayload ?? body.wip);
        applied.push("wip_log_updated");
      }
      if (body.mode_hint === "Plan" || body.mode_hint === "Build") {
        next = deps.applyHandoffMutation(next, { selected_mode: body.mode_hint });
        applied.push(`selected_mode:${body.mode_hint}`);
      }

      if (body.action_type === "build_result") {
        next = deps.applyHandoffMutation(next, {
          status: "in_progress",
          next_command: "check",
          next_mode: "Plan"
        });
        applied.push("handoff:check");
      } else {
        if (body.check.result === "PASS") {
          next = deps.applyDecisionMutation(next, "GO");
          next = deps.applyHandoffMutation(next, {
            status: "done",
            next_command: "done",
            next_mode: "done"
          });
          applied.push("decision:GO");
          applied.push("handoff:done");
        } else {
          next = deps.applyDecisionMutation(next, "NO_GO");
          next = deps.applyHandoffMutation(next, {
            status: "in_progress",
            next_command: "fix",
            next_mode: "Build"
          });
          applied.push("decision:NO_GO");
          applied.push("handoff:fix");
        }
      }
      return next;
    });

    if (result.statusCode !== 200) {
      return result;
    }

    const payload = result.payload as any;
    if (body.action_type === "check_result" && body.check.result === "PASS" && body.auto_archive_on_pass !== false) {
      const completion = await completePlan(projectId, planId);
      if (completion.statusCode !== 200) {
        return {
          statusCode: completion.statusCode,
          payload: {
            ...completion.payload,
            error_code: "AUTO_ARCHIVE_FAILED",
            applied,
            summary: payload.summary
          }
        };
      }
      return {
        statusCode: 200,
        payload: {
          summary: completion.payload.summary,
          applied,
          write_warning: payload.write_warning,
          archive: {
            archived: true,
            archived_path: completion.payload.archived_path
          }
        }
      };
    }

    return {
      statusCode: 200,
      payload: {
        summary: payload.summary,
        applied,
        write_warning: payload.write_warning,
        archive: { archived: false }
      }
    };
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
    const result = await completePlan(defaultProjectId, id);
    reply.code(result.statusCode);
    return result.payload;
  });

  fastify.post("/api/plans/:id/automation/apply", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = (request.body ?? {}) as any;
    const result = await applyAutomation(defaultProjectId, id, body);
    reply.code(result.statusCode);
    return result.payload;
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
    const result = await completePlan(project_id, id);
    reply.code(result.statusCode);
    return result.payload;
  });

  fastify.post("/api/projects/:project_id/plans/:id/automation/apply", async (request, reply) => {
    const { project_id, id } = request.params as { project_id: string; id: string };
    const body = (request.body ?? {}) as any;
    const result = await applyAutomation(project_id, id, body);
    reply.code(result.statusCode);
    return result.payload;
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
