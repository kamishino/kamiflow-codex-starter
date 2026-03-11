export type StartGateResultLike = {
  ok: boolean;
  required: string;
  reason: string;
};

export function parseSummarySection(sectionText: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of String(sectionText || "").split(/\r?\n/)) {
    const match = line.match(/^- ([^:]+):\s*(.*)$/);
    if (!match) {
      continue;
    }
    out[match[1].trim().toLowerCase()] = match[2].trim();
  }
  return out;
}

export function isPlaceholder(value: string | undefined): boolean {
  const normalized = String(value || "").trim().toLowerCase();
  return !normalized || normalized === "tbd" || normalized === "n/a" || normalized === "-";
}

export function evaluateStartSummaryGate(sectionText: string | undefined): StartGateResultLike {
  const start = parseSummarySection(sectionText);
  const required = (start.required || "").toLowerCase();
  if (required !== "yes" && required !== "no") {
    return { ok: false, required: "yes", reason: "Start Summary.Required must be yes or no." };
  }
  if (isPlaceholder(start.reason || "")) {
    return { ok: false, required, reason: "Start Summary.Reason must be non-placeholder." };
  }
  if (required === "yes" && isPlaceholder(start["selected idea"] || "")) {
    return { ok: false, required, reason: "Start required: Selected Idea must be set." };
  }
  if (required === "yes" && isPlaceholder(start["handoff confidence"] || "")) {
    return { ok: false, required, reason: "Start required: Handoff Confidence must be set." };
  }
  return { ok: true, required, reason: "ok" };
}
