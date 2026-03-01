import Fastify from "fastify";
import fs from "node:fs/promises";
import path from "node:path";
import { loadPlanByFilePath, loadPlanById } from "../lib/plan-store.js";
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
import { registerApiRoutes } from "./routes/api-routes.js";
import { registerUiRoutes } from "./routes/ui-routes.js";
import type { ParsedPlan, PlanRecord } from "../types.js";

interface ProjectContext {
  project_id: string;
  project_dir: string;
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

  registerApiRoutes(fastify, {
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
    runCodexAction,
    applyAcceptanceCriteriaMutation,
    applyDecisionMutation,
    applyGateMutation,
    applyHandoffMutation,
    applyStatusMutation,
    applyTaskMutation,
    applyWipMutation
  });

  registerUiRoutes(fastify);

  const watchers: Array<{ close: () => Promise<void> }> = [];
  const pending = new Map<string, { timer: NodeJS.Timeout }>();
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
        pending.set(key, { timer });
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

