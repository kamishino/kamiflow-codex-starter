import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "../../..");

type RunEvent = {
  event_type?: string;
  status?: string;
  run_state?: string;
  run_id?: string;
  plan_id?: string;
  action_type?: string;
  source?: string;
  phase?: string;
  guardrail?: string;
  route_confidence?: unknown;
  selected_route?: string;
  recovery_step?: string;
  message?: string;
  detail?: string;
  updated_at?: string;
};

type Counter = Record<string, number>;

type ParseError = string;

const REQUIRED_FIELDS = [
  "event_type",
  "status",
  "run_state",
  "phase",
  "run_id",
  "plan_id",
  "action_type",
  "source",
  "guardrail",
  "route_confidence",
  "selected_route",
  "recovery_step",
  "message",
  "updated_at"
];

function toError(lineNumber: number, error: string, filePath: string) {
  return `[route-health] ${filePath}:${lineNumber}: ${error}`;
}

function increment(counter: Counter, key: string) {
  const normalized = String(key || "unknown");
  counter[normalized] = (counter[normalized] || 0) + 1;
}

function hasRunlogPath() {
  const runs = path.join(ROOT_DIR, ".local", "runs");
  return fs.existsSync(runs) && fs.statSync(runs).isDirectory();
}

function loadRunlogLines(runsPath: string) {
  const entries = fs.readdirSync(runsPath, { withFileTypes: true });
  const files = entries.filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".jsonl"));
  const out = [];
  for (const entry of files) {
    const filePath = path.join(runsPath, entry.name);
    const raw = fs.readFileSync(filePath, "utf8");
    const stat = fs.statSync(filePath);
    out.push({ filePath, raw, updatedAt: stat.mtimeMs });
  }
  return out;
}

function parseEvents(raw: string, filePath: string, errors: ParseError[]) {
  const events: Array<{ event: RunEvent; sourceLine: number; filePath: string }> = [];
  const lines = raw.split(/\r?\n/).filter((line) => String(line || "").trim().length > 0);
  for (let index = 0; index < lines.length; index += 1) {
    const line = index + 1;
    try {
      const parsed = JSON.parse(lines[index]);
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        errors.push(toError(line, "runlog event must be a JSON object.", filePath));
        continue;
      }
      events.push({ event: parsed as RunEvent, sourceLine: line, filePath });
      continue;
    } catch (err) {
      errors.push(toError(line, `invalid JSON: ${err instanceof Error ? err.message : String(err)}`, filePath));
    }
  }
  return events;
}

function isKamiflowRunEvent(event: RunEvent) {
  const source = String(event.source || "").trim().toLowerCase();
  return source === "kfc-run";
}

function validateEvent(
  event: RunEvent,
  filePath: string,
  sourceLine: number,
  errors: ParseError[]
) {
  if (!isKamiflowRunEvent(event)) {
    return;
  }

  for (const field of REQUIRED_FIELDS) {
    if (event[field] === undefined || event[field] === null || String(event[field]).trim().length === 0) {
      errors.push(toError(sourceLine, `missing required field -> ${field}`, filePath));
      return;
    }
  }

  const runState = String(event.run_state || "").toUpperCase();
  if (!["RUNNING", "SUCCESS", "FAIL", "IDLE"].includes(runState)) {
    errors.push(toError(sourceLine, `invalid run_state: ${event.run_state}`, filePath));
  }
  if (String(event.phase || "").trim().length === 0) {
    errors.push(toError(sourceLine, "phase must be a non-empty string", filePath));
  }

  const routeConfidence = Number(event.route_confidence);
  if (!Number.isFinite(routeConfidence) || routeConfidence < 0 || routeConfidence > 5) {
    errors.push(toError(sourceLine, `route_confidence out of range: ${event.route_confidence}`, filePath));
  }
}

function parseArgs() {
  const argv = process.argv.slice(2);
  const allowed = new Set(["--report"]);
  const normalized = argv.map((arg) => String(arg || "").toLowerCase());
  const hasReport = normalized.includes("--report");
  const unknown = normalized.filter((arg) => arg.startsWith("-") && !allowed.has(arg));
  if (normalized.includes("--help") || normalized.includes("-h")) {
    console.log("Usage: npm run verify:route-health [-- --report]");
    console.log("  --report    emit machine-readable latest-run health summary to stdout.");
    process.exit(0);
  }
  if (unknown.length > 0) {
    console.error(`[route-health] unknown option: ${unknown[0]}`);
    process.exit(2);
  }
  return {
    report: hasReport
  };
}

function buildLatestSummary(
  latestFile: string | undefined,
  latestRouteCounter: Counter,
  latestGuardrailCounter: Counter,
  latestRunEvents: Array<{ event: RunEvent; sourceLine: number; filePath: string }>
) {
  let latestSummaryEvent: RunEvent | undefined;
  for (let index = latestRunEvents.length - 1; index >= 0; index -= 1) {
    const candidate = latestRunEvents[index];
    if (candidate?.event?.event_type === "route_health_summary") {
      latestSummaryEvent = candidate.event;
      break;
    }
  }
  if (!latestSummaryEvent) {
    return {
      has_summary: false,
      file: latestFile ? path.basename(latestFile) : "",
      run_id: "",
      status: "",
      plan_id: "",
      selected_route: "",
      event_count: latestRunEvents.length,
      event_type_counts: latestRouteCounter,
      guardrail_counts: latestGuardrailCounter,
      message: "",
      detail: ""
    };
  }

  return {
    has_summary: true,
    file: latestFile ? path.basename(latestFile) : "",
    run_id: String(latestSummaryEvent.run_id || ""),
    status: String(latestSummaryEvent.status || ""),
    plan_id: String(latestSummaryEvent.plan_id || ""),
    selected_route: String(latestSummaryEvent.selected_route || ""),
    event_count: latestRunEvents.length,
    event_type_counts: latestRouteCounter,
    guardrail_counts: latestGuardrailCounter,
    message: String(latestSummaryEvent.message || ""),
    detail: String(latestSummaryEvent.detail || "")
  };
}

function main() {
  const args = parseArgs();
  const runsDir = path.join(ROOT_DIR, ".local", "runs");
  const routeCounter: Counter = {};
  const guardrailCounter: Counter = {};
  let hasLatestRunEvents = false;
  const errors: ParseError[] = [];
  const latestRouteCounter: Counter = {};
  const latestGuardrailCounter: Counter = {};

  if (!hasRunlogPath()) {
    console.log("[route-health] OK (no .local/runs found; nothing to validate)");
    return;
  }

  const files = loadRunlogLines(runsDir);
  if (files.length === 0) {
    console.log("[route-health] OK (runlog directory exists but no .jsonl files found)");
    return;
  }

  const ordered = files.sort((left, right) => right.updatedAt - left.updatedAt);
  const latestFile = ordered[0]?.filePath;
  let hasLatestSummary = false;
  const latestRunEvents: Array<{ event: RunEvent; sourceLine: number; filePath: string }> = [];

  const managedEvents: Array<{ event: RunEvent; filePath: string }> = [];
  for (const item of ordered) {
    const events = parseEvents(item.raw, item.filePath, errors);
    for (const { event, sourceLine, filePath } of events) {
      validateEvent(event, filePath, sourceLine, errors);
      if (!isKamiflowRunEvent(event)) {
        continue;
      }
      increment(routeCounter, event.event_type || "unknown");
      increment(guardrailCounter, event.guardrail || "unknown");
      managedEvents.push({ event, filePath });
      if (filePath === latestFile && event.event_type === "route_health_summary") {
        hasLatestSummary = true;
      }
      if (filePath === latestFile && isKamiflowRunEvent(event)) {
        latestRunEvents.push({ event, filePath, sourceLine });
        increment(latestRouteCounter, event.event_type || "unknown");
        increment(latestGuardrailCounter, event.guardrail || "unknown");
      }
      if (filePath === latestFile) {
        hasLatestRunEvents = true;
      }
    }
  }

  if (errors.length > 0) {
    for (const error of errors) {
      console.error(error);
    }
    process.exit(1);
  }

  if (managedEvents.length === 0) {
    if (args.report) {
      const summary = buildLatestSummary(latestFile, latestRouteCounter, latestGuardrailCounter, latestRunEvents);
      console.log(`[route-health] report`);
      console.log(JSON.stringify({
        ok: true,
        has_kfc_run_events: 0,
        latest: summary
      }, null, 2));
    } else {
      console.log("[route-health] OK (no kfc-run events found after scan).");
    }
    return;
  }

  if (args.report) {
    console.log(`[route-health] report`);
    console.log(JSON.stringify({
      ok: true,
      has_kfc_run_events: managedEvents.length,
      all: {
        event_types: routeCounter,
        guardrails: guardrailCounter
      },
      latest: buildLatestSummary(latestFile, latestRouteCounter, latestGuardrailCounter, latestRunEvents)
    }, null, 2));
    return;
  }

  console.log(`[route-health] events=${managedEvents.length}`);
  console.log(`[route-health] event types: ${Object.entries(routeCounter)
    .sort(([left], [right]) => String(left).localeCompare(String(right)))
    .map(([name, count]) => `${name}:${count}`)
    .join(", ")}`);
  console.log(`[route-health] guardrails: ${Object.entries(guardrailCounter)
    .sort(([left], [right]) => String(left).localeCompare(String(right)))
    .map(([name, count]) => `${name}:${count}`)
    .join(", ")}`);

  if (latestFile && hasLatestRunEvents && !hasLatestSummary) {
    console.error("[route-health] missing route_health_summary event in the latest runlog file.");
    process.exit(1);
  }

  const highGuardrailEvents = Object.entries(guardrailCounter).filter(([, count]) => count >= 3);
  if (highGuardrailEvents.length > 0) {
    const repeats = highGuardrailEvents.map(([key, count]) => `${key}:${count}`).join(", ");
    console.log(`[route-health] guardrail repetition signal: ${repeats}`);
  }
  console.log("[route-health] OK");
}

main();
