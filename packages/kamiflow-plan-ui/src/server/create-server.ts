import Fastify from "fastify";
import fs from "node:fs/promises";
import { loadPlanByFilePath, loadPlanById, loadPlans } from "../lib/plan-store.js";
import { watchPlans } from "./watch-plans.js";
import { parsePlanFileContent } from "../parser/plan-parser.js";
import { validateParsedPlan } from "../schema/validate-plan.js";
import { serializePlan } from "../lib/plan-serializer.js";
import {
  applyDecisionMutation,
  applyGateMutation,
  applyStatusMutation,
  applyTaskMutation
} from "../lib/plan-mutations.js";
import { runCodexAction as runCodexActionDefault } from "../lib/codex-runner.js";
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
  const sseClients = new Map<string, Set<any>>();

  function addClient(planId: string, reply: any) {
    const key = planId;
    if (!sseClients.has(key)) {
      sseClients.set(key, new Set());
    }
    sseClients.get(key).add(reply);
  }

  function removeClient(planId: string, reply: any) {
    const set = sseClients.get(planId);
    if (!set) {
      return;
    }
    set.delete(reply);
    if (set.size === 0) {
      sseClients.delete(planId);
    }
  }

  async function broadcastPlanEvent(planId: string, type: string) {
    const plan = await loadPlanById(projectDir, planId);
    const payload = plan
      ? {
          event_type: type,
          plan_id: plan.summary.plan_id,
          summary: plan.summary,
          updated_at: Date.now()
        }
      : { event_type: type, plan_id: planId, summary: null, updated_at: Date.now() };

    const message = `event: ${type}\ndata: ${JSON.stringify(payload)}\n\n`;

    for (const key of [planId, "*"]) {
      const listeners = sseClients.get(key);
      if (!listeners) {
        continue;
      }
      for (const reply of listeners) {
        reply.raw.write(message);
      }
    }
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
    const updated = await loadPlanById(projectDir, planId);
    return {
      statusCode: 200,
      payload: {
        summary: updated?.summary ?? existing.summary,
        write_warning: warning
      }
    };
  }

  fastify.get("/api/health", async () => ({ ok: true }));

  fastify.get("/api/plans", async () => {
    const plans = await loadPlans(projectDir);
    return {
      plans: plans.map((item) => item.summary)
    };
  });

  fastify.get("/api/plans/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const plan = await loadPlanById(projectDir, id);
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
    reply.raw.write("event: connected\ndata: {}\n\n");

    addClient(id, reply);

    request.raw.on("close", () => {
      removeClient(id, reply);
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

async function fetchPlans() {
  const res = await fetch("/api/plans");
  const data = await res.json();
  return data.plans ?? [];
}

function renderList(plans) {
  if (!plans.length) {
    planListEl.innerHTML = "<li>No plans found in .local/plans</li>";
    return;
  }
  planListEl.innerHTML = plans.map((p) => {
    const invalid = p.is_valid ? "" : " (invalid)";
    return '<li><button data-plan-id="' + p.plan_id + '">' + p.plan_id + " - " + p.title + invalid + '</button></li>';
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
  const res = await fetch("/api/plans/" + encodeURIComponent(id));
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
    <div>
      <button id="set-status-active">Set Status Active</button>
      <button id="toggle-decision">Toggle Decision</button>
      <button id="toggle-task-0">Toggle Task 1</button>
      <button id="toggle-gate-0">Toggle Gate 1</button>
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
function attachStream(id) {
  if (currentStream) {
    currentStream.close();
  }
  currentStream = new EventSource("/api/plans/" + encodeURIComponent(id) + "/events");
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
}

async function loadList() {
  const plans = await fetchPlans();
  renderList(plans);
}

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
  if (withWatcher) {
    watcher = watchPlans(projectDir, async ({ type, filePath }) => {
      const existing = await loadPlanByFilePath(projectDir, filePath);
      const fallbackPlanId = filePath.split(/[\\/]/).pop().replace(/\.md$/i, "");
      const planId = existing?.summary.plan_id ?? fallbackPlanId;
      const eventType = existing && existing.errors.length > 0 ? "plan_invalid" : type;
      await broadcastPlanEvent(planId, eventType);
    });
  }

  fastify.addHook("onClose", async () => {
    if (watcher) {
      await watcher.close();
    }
  });

  return fastify;
}
