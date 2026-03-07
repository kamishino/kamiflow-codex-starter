import Fastify from "fastify";
import fs from "node:fs/promises";
import path from "node:path";
import { loadPlanByFilePath, loadPlanById } from "../lib/plan-store.js";
import { watchPlans } from "./watch-plans.js";
import { watchRunlogs } from "./watch-runlogs.js";
import { SSEStream } from "./sse-stream.js";
import { parsePlanFileContent } from "../parser/plan-parser.js";
import { validateParsedPlan } from "../schema/validate-plan.js";
import { serializePlan } from "../lib/plan-serializer.js";
import { derivePlanIdFromRunlogPath, readRunlogSignal } from "../lib/runlog.js";
import {
  applyAcceptanceCriteriaMutation,
  applyDecisionMutation,
  applyGateMutation,
  applyHandoffMutation,
  applyStartSummaryMutation,
  applyStatusMutation,
  applyTaskMutation,
  applyWipMutation
} from "../lib/plan-mutations.js";
import { runCodexAction as runCodexActionDefault } from "../lib/codex-runner.js";
import { registerApiRoutes } from "./routes/api-routes.js";
import { registerUiRoutes } from "./routes/ui-routes.js";
import type { ParsedPlan, PlanRecord } from "../types.js";

interface ProjectContext {
  project_id: string;
  project_dir: string;
  project_plans_dir?: string;
  project_done_plans_dir?: string;
}

function scopeKey(projectId: string, planId: string) {
  return `${projectId}::${planId}`;
}

function toDetail(plan: PlanRecord) {
  return {
    summary: plan.summary,
    frontmatter: plan.parsed?.frontmatter ?? {},
    sections: plan.parsed?.sections ?? {},
    errors: plan.errors
  };
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
      const project_plans_dir = item.project_plans_dir ? path.resolve(item.project_plans_dir) : undefined;
      const project_done_plans_dir = item.project_done_plans_dir ? path.resolve(item.project_done_plans_dir) : undefined;
      if (!project_id) {
        throw new Error("Invalid project_id in projects.");
      }
      if (seen.has(project_id)) {
        throw new Error(`Duplicate project_id: ${project_id}`);
      }
      seen.add(project_id);
      return { project_id, project_dir, project_plans_dir, project_done_plans_dir };
    });
  }
  return [
    {
      project_id: "default",
      project_dir: path.resolve(options.projectDir ?? process.cwd()),
      project_plans_dir: options.plansDir ? path.resolve(options.plansDir) : undefined,
      project_done_plans_dir: options.donePlansDir ? path.resolve(options.donePlansDir) : undefined
    }
  ];
}

function planLoadOptions(project: ProjectContext) {
  return {
    plansDir: project.project_plans_dir,
    donePlansDir: project.project_done_plans_dir
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

export async function createServer(options) {
  const { withWatcher = true, runCodexAction = runCodexActionDefault, workspaceName } = options;
  const uiMode = options.uiMode === "operator" ? "operator" : "observer";
  const writeEnabled = uiMode === "operator";
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
    const plan = await loadPlanById(project.project_dir, planId, {
      includeDone: true,
      ...planLoadOptions(project)
    });
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

    const existing = await loadPlanById(project.project_dir, planId, planLoadOptions(project));
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

    const updated = await loadPlanById(project.project_dir, planId, {
      includeDone: true,
      ...planLoadOptions(project)
    });
    return {
      statusCode: 200,
      payload: {
        summary: updated ? withProjectSummary(projectId, updated).summary : withProjectSummary(projectId, existing).summary,
        write_warning: warning
      }
    };
  }

  registerApiRoutes(fastify, {
    workspaceName,
    uiMode,
    writeEnabled,
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
    runCodexAction,
    applyAcceptanceCriteriaMutation,
    applyDecisionMutation,
    applyGateMutation,
    applyHandoffMutation,
    applyStartSummaryMutation,
    applyStatusMutation,
    applyTaskMutation,
    applyWipMutation
  });

  registerUiRoutes(fastify, { uiMode });

  const watchers: Array<{ close: () => Promise<void> }> = [];
  const pending = new Map<string, { timer: NodeJS.Timeout }>();
  const pendingRunlogs = new Map<string, { timer: NodeJS.Timeout }>();
  if (withWatcher) {
    for (const project of projectContexts) {
      const watcher = watchPlans(
        project.project_dir,
        async ({ type, filePath }) => {
          const existing = await loadPlanByFilePath(project.project_dir, filePath, {
            includeDone: true,
            ...planLoadOptions(project)
          });
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
          pending.set(key, { timer });
        },
        { plansDir: project.project_plans_dir }
      );
      watchers.push(watcher);

      const runlogWatcher = watchRunlogs(project.project_dir, async ({ type, filePath }) => {
        const signal = await readRunlogSignal(filePath);
        const fallbackPlanId = derivePlanIdFromRunlogPath(filePath);
        const planId = signal?.plan_id || fallbackPlanId;
        if (!planId) {
          return;
        }
        const key = scopeKey(project.project_id, planId) + "::runlog";
        const existingPending = pendingRunlogs.get(key);
        if (existingPending) {
          clearTimeout(existingPending.timer);
        }
        const timer = setTimeout(() => {
          pendingRunlogs.delete(key);
          const payload = signal
            ? {
                event_type: signal.event_type,
                project_id: project.project_id,
                plan_id: planId,
                run_id: signal.run_id,
                action_type: signal.action_type,
                status: signal.status,
                run_state: signal.run_state,
                phase: signal.phase,
                source: signal.source,
                message: signal.message,
                detail: signal.detail,
                evidence: signal.evidence,
                guardrail: signal.guardrail,
                route_confidence: signal.route_confidence,
                fallback_route: signal.fallback_route,
                selected_route: signal.selected_route,
                recovery_step: signal.recovery_step,
                onboarding_status: signal.onboarding_status,
                onboarding_stage: signal.onboarding_stage,
                onboarding_error_code: signal.onboarding_error_code,
                onboarding_recovery: signal.onboarding_recovery,
                onboarding_next: signal.onboarding_next,
                updated_at: Date.now()
              }
            : {
                event_type: type === "runlog_deleted" ? "runlog_deleted" : "runlog_updated",
                project_id: project.project_id,
                plan_id: planId,
                run_state: "IDLE",
                source: "runlog",
                message: type === "runlog_deleted" ? "Run log removed" : "Run log updated",
                detail: filePath,
                updated_at: Date.now()
              };
          const eventType = String(payload.event_type || "runlog_updated");
          stream.publish(eventType, payload, scopeKey(project.project_id, planId));
        }, 120);
        pendingRunlogs.set(key, { timer });
      });
      watchers.push(runlogWatcher);
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
    for (const item of pendingRunlogs.values()) {
      clearTimeout(item.timer);
    }
    pendingRunlogs.clear();
    for (const watcher of watchers) {
      await watcher.close();
    }
  });

  return fastify;
}
