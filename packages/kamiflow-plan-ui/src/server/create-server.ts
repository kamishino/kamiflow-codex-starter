import Fastify from "fastify";
import fs from "node:fs/promises";
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

export async function createServer(options) {
  const { projectDir, withWatcher = true, runCodexAction = runCodexActionDefault } = options;
  const fastify = Fastify({ logger: false });
  const stream = new SSEStream(500);

  async function broadcastPlanEvent(planId: string, type: string) {
    const plan = await loadPlanById(projectDir, planId, { includeDone: true });
    const payload = plan
      ? {
          event_type: type,
          plan_id: plan.summary.plan_id,
          summary: plan.summary,
          updated_at: Date.now()
        }
      : { event_type: type, plan_id: planId, summary: null, updated_at: Date.now() };
    stream.publish(type, payload, planId);
  }

  async function persistMutation(
    planId: string,
    expectedUpdatedAt: string | undefined,
    mutator: (parsed: ParsedPlan) => ParsedPlan
  ) {
    const existing = await loadPlanById(projectDir, planId);
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

    await broadcastPlanEvent(planId, "plan_updated");
    const updated = await loadPlanById(projectDir, planId, { includeDone: true });
    return {
      statusCode: 200,
      payload: {
        summary: updated?.summary ?? existing.summary,
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

  fastify.get("/api/plans", async (request) => {
    const query = request.query as { include_done?: string };
    const includeDone = query?.include_done === "true";
    const plans = await loadPlans(projectDir, { includeDone });
    return {
      plans: plans.map((item) => item.summary)
    };
  });

  fastify.get("/api/plans/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const query = request.query as { include_done?: string };
    const includeDone = query?.include_done === "true";
    const plan = await loadPlanById(projectDir, id, { includeDone });
    if (!plan) {
      reply.code(404);
      return { error: "Plan not found", error_code: "PLAN_NOT_FOUND", plan_id: id };
    }
    return toDetail(plan);
  });

  fastify.get("/api/plans/:id/events", async (request, reply) => {
    const { id } = request.params as { id: string };
    reply.raw.setHeader("Content-Type", "text/event-stream");
    reply.raw.setHeader("Cache-Control", "no-cache");
    reply.raw.setHeader("Connection", "keep-alive");
    reply.raw.setHeader("X-Accel-Buffering", "no");
    const header = request.headers["last-event-id"];
    const lastEventId = Array.isArray(header) ? header[0] : header;
    stream.subscribe(id, reply, lastEventId);

    request.raw.on("close", () => {
      stream.unsubscribe(id, reply);
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
    const result = await persistMutation(id, body.expected_updated_at, (parsed) =>
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
    const result = await persistMutation(id, body.expected_updated_at, (parsed) =>
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
    const result = await persistMutation(id, body.expected_updated_at, (parsed) =>
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
    const result = await persistMutation(id, body.expected_updated_at, (parsed) =>
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

    const result = await persistMutation(id, body.expected_updated_at, (parsed) => {
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

    const existing = await loadPlanById(projectDir, id);
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

    const archivedPath = await archivePlanFile(projectDir, existing.summary.file_path);
    const updated = await loadPlanById(projectDir, id, { includeDone: true });

    await broadcastPlanEvent(id, "plan_updated");
    stream.publish(
      "plan_archived",
      { event_type: "plan_archived", plan_id: id, archived_path: archivedPath, updated_at: Date.now() },
      id
    );

    return {
      summary: updated?.summary ?? existing.summary,
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

  fastify.get("/assets/app.js", async (_request, reply) => {
    reply.type("application/javascript");
    return `
const planListEl = document.querySelector("#plan-list");
const detailEl = document.querySelector("#plan-detail");
const statusEl = document.querySelector("#status");
const filterEl = document.querySelector("#plan-filter");
let allPlansCache = [];

function currentFilter() {
  return filterEl?.value || "active";
}

async function fetchPlans(includeDone) {
  const res = await fetch("/api/plans?include_done=" + (includeDone ? "true" : "false"));
  const data = await res.json();
  return data.plans ?? [];
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
    planListEl.innerHTML = "<li>No plans found in .local/plans</li>";
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
      location.hash = "#/plans/" + encodeURIComponent(id);
      loadDetail();
    });
  }
}

async function loadDetail() {
  const hash = location.hash || "";
  const m = hash.match(/^#\\/plans\\/(.+)$/);
  if (!m) {
    detailEl.innerHTML = "<p>Select a plan.</p>";
    return;
  }
  const id = decodeURIComponent(m[1]);
  const res = await fetch("/api/plans/" + encodeURIComponent(id) + "?include_done=true");
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
  bindActions(id, data);
  attachStream(id);
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

function bindActions(id, data) {
  const updatedAt = data.summary.updated_at || "";
  const statusBtn = document.querySelector("#set-status-active");
  const decisionBtn = document.querySelector("#toggle-decision");
  const taskBtn = document.querySelector("#toggle-task-0");
  const gateBtn = document.querySelector("#toggle-gate-0");
  const completeBtn = document.querySelector("#complete-archive");
  const codexBtn = document.querySelector("#run-codex-plan");

  statusBtn?.addEventListener("click", async () => {
    const out = await patch("/api/plans/" + encodeURIComponent(id) + "/status", {
      status: "active",
      expected_updated_at: updatedAt
    });
    statusEl.textContent = out.write_warning || "Status updated.";
    loadDetail();
    loadList();
  });

  decisionBtn?.addEventListener("click", async () => {
    const nextDecision = data.summary.decision === "GO" ? "NO_GO" : "GO";
    const out = await patch("/api/plans/" + encodeURIComponent(id) + "/decision", {
      decision: nextDecision,
      expected_updated_at: updatedAt
    });
    statusEl.textContent = out.write_warning || "Decision updated.";
    loadDetail();
    loadList();
  });

  taskBtn?.addEventListener("click", async () => {
    const current = parseFirstChecklistState(data.sections["Implementation Tasks"]);
    const out = await patch("/api/plans/" + encodeURIComponent(id) + "/task", {
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
    const out = await patch("/api/plans/" + encodeURIComponent(id) + "/gate", {
      gate_index: 0,
      checked: !current,
      expected_updated_at: updatedAt
    });
    statusEl.textContent = out.write_warning || "Gate updated.";
    loadDetail();
    loadList();
  });

  completeBtn?.addEventListener("click", async () => {
    const res = await fetch("/api/plans/" + encodeURIComponent(id) + "/complete", {
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
    const res = await fetch("/api/codex/action", {
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

function attachStream(id) {
  if (currentStream) {
    currentStream.close();
  }
  currentStream = new EventSource("/api/plans/" + encodeURIComponent(id) + "/events");
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
  const includeDone = currentFilter() !== "active";
  const plans = await fetchPlans(includeDone);
  allPlansCache = plans;
  renderList(allPlansCache);
}

filterEl?.addEventListener("change", () => {
  loadList();
});

window.addEventListener("hashchange", () => loadDetail());
loadList().then(() => loadDetail());
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

  let watcher = null;
  const pending = new Map<string, { type: string; timer: NodeJS.Timeout }>();
  if (withWatcher) {
    watcher = watchPlans(projectDir, async ({ type, filePath }) => {
      const existing = await loadPlanByFilePath(projectDir, filePath, { includeDone: true });
      const fallbackPlanId = filePath.split(/[\\/]/).pop().replace(/\.md$/i, "");
      const planId = existing?.summary.plan_id ?? fallbackPlanId;
      const eventType = existing && existing.errors.length > 0 ? "plan_invalid" : type;
      const existingPending = pending.get(planId);
      if (existingPending) {
        clearTimeout(existingPending.timer);
      }
      const timer = setTimeout(async () => {
        pending.delete(planId);
        await broadcastPlanEvent(planId, eventType);
      }, 150);
      pending.set(planId, { type: eventType, timer });
    });
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
    if (watcher) {
      await watcher.close();
    }
  });

  return fastify;
}
