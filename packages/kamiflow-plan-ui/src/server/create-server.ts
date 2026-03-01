import Fastify from "fastify";
import { loadPlanByFilePath, loadPlanById, loadPlans } from "../lib/plan-store.js";
import { watchPlans } from "./watch-plans.js";
import type { PlanRecord } from "../types.js";

function toDetail(plan: PlanRecord) {
  return {
    summary: plan.summary,
    frontmatter: plan.parsed?.frontmatter ?? {},
    sections: plan.parsed?.sections ?? {},
    errors: plan.errors
  };
}

export async function createServer(options) {
  const { projectDir, withWatcher = true } = options;
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
    <h4>Validation</h4>
    <ul>\${errors || "<li>No validation errors</li>"}</ul>
    \${sections}
  \`;
  attachStream(id);
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
