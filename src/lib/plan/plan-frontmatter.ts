export type FrontmatterRecord = Record<string, string>;

type FrontmatterStyle = "fenced" | "legacy" | "none";

const PLAN_FRONTMATTER_KEYS = new Set([
  "plan_id",
  "request_id",
  "parent_plan_id",
  "status",
  "decision",
  "selected_mode",
  "next_mode",
  "next_command",
  "lifecycle_phase",
  "created_at",
  "updated_at",
  "request_source",
  "diagram_mode",
  "title"
]);

export type FrontmatterSplit = {
  frontmatter: FrontmatterRecord;
  body: string;
  style: FrontmatterStyle;
  hasFrontmatter: boolean;
  hasLegacySeparator: boolean;
};

function parseLineValue(rawValue: string) {
  const trimmed = rawValue.trim();
  if (!trimmed) {
    return "";
  }
  return trimmed.replace(/^["']|["']$/g, "");
}

function parseFrontmatterLines(lines: string[]) {
  const out: FrontmatterRecord = {};
  let recognized = false;
  let parsedCount = 0;
  for (let i = 0; i < lines.length; i += 1) {
    const trimmed = lines[i].trim();
    if (!trimmed) {
      if (parsedCount === 0) {
        continue;
      }
      continue;
    }

    const separator = trimmed === "---" || /^##\s+/.test(trimmed);
    if (separator) {
      return {
        frontmatter: out,
        consumed: trimmed === "---" ? i + 1 : i,
        hasSeparator: trimmed === "---",
        recognized
      };
    }

    if (trimmed.startsWith("#")) {
      continue;
    }

    const sep = trimmed.indexOf(":");
    if (sep <= 0) {
      if (parsedCount === 0) {
        return { frontmatter: null, consumed: -1, hasSeparator: false, recognized: false };
      }
      return { frontmatter: out, consumed: i, hasSeparator: false, recognized };
    }

    const key = trimmed.slice(0, sep).trim();
    const rawValue = trimmed.slice(sep + 1);
    if (!key) {
      if (parsedCount === 0) {
        return { frontmatter: null, consumed: -1, hasSeparator: false, recognized: false };
      }
      return { frontmatter: out, consumed: i, hasSeparator: false, recognized };
    }

    const value = parseLineValue(rawValue);
    out[key] = value;
    recognized = recognized || PLAN_FRONTMATTER_KEYS.has(key);
    parsedCount += 1;
  }
  if (parsedCount === 0) {
    return { frontmatter: null, consumed: -1, hasSeparator: false, recognized: false };
  }
  return { frontmatter: out, consumed: lines.length, hasSeparator: false, recognized };
}

function serializeValue(value: unknown) {
  return String(value ?? "").replace(/\r?\n/g, " ");
}

function normalizeFrontmatter(frontmatter: FrontmatterRecord) {
  return frontmatter && typeof frontmatter === "object" && !Array.isArray(frontmatter)
    ? frontmatter
    : {};
}

export function splitPlanFrontmatter(markdown: string): FrontmatterSplit {
  const source = String(markdown || "");
  if (!source) {
    return {
      frontmatter: {},
      body: "",
      style: "none",
      hasFrontmatter: false,
      hasLegacySeparator: false
    };
  }

  const lines = source.split(/\r?\n/);
  if (source.startsWith("---")) {
    let endIdx = -1;
    for (let i = 1; i < lines.length; i += 1) {
      if (lines[i].trim() === "---") {
        endIdx = i;
        break;
      }
    }
    if (endIdx === -1) {
      return {
        frontmatter: {},
        body: source,
        style: "none",
        hasFrontmatter: false,
        hasLegacySeparator: false
      };
    }

    const parsed = parseFrontmatterLines(lines.slice(1, endIdx));
    return {
      frontmatter: (parsed.frontmatter || {}) as FrontmatterRecord,
      body: lines.slice(endIdx + 1).join("\n").replace(/^\s+/, ""),
      style: "fenced",
      hasFrontmatter: true,
      hasLegacySeparator: false
    };
  }

  const parsed = parseFrontmatterLines(lines);
  if (!parsed.frontmatter || !parsed.recognized) {
    return {
      frontmatter: {},
      body: source,
      style: "none",
      hasFrontmatter: false,
      hasLegacySeparator: false
    };
  }

  return {
    frontmatter: parsed.frontmatter,
    body: normalizeLegacyBody(lines.slice(parsed.consumed)).join("\n"),
    style: "legacy",
    hasFrontmatter: true,
    hasLegacySeparator: parsed.hasSeparator
  };
}

function normalizeLegacyBody(lines: string[]) {
  let cursor = 0;
  while (cursor < lines.length && lines[cursor].trim() === "") {
    cursor += 1;
  }
  while (cursor < lines.length && lines[cursor].trim() === "---") {
    cursor += 1;
    while (cursor < lines.length && lines[cursor].trim() === "") {
      cursor += 1;
    }
  }
  return lines.slice(cursor).map((line, index) => (index === 0 ? line.replace(/^\s+/, "") : line));
}

export function parsePlanFrontmatter(markdown: string): FrontmatterRecord {
  const { frontmatter } = splitPlanFrontmatter(markdown);
  return frontmatter;
}

function serializeFrontmatterLines(frontmatter: FrontmatterRecord) {
  const normalized = normalizeFrontmatter(frontmatter);
  const lines = [];
  for (const [key, rawValue] of Object.entries(normalized)) {
    lines.push(`${String(key)}: ${JSON.stringify(serializeValue(rawValue))}`);
  }
  return lines;
}

export function serializePlanFrontmatter(frontmatter: FrontmatterRecord, style: FrontmatterStyle = "fenced", includeMarker = false) {
  const lines = serializeFrontmatterLines(frontmatter);
  if (style === "fenced") {
    return ["---", ...lines, "---"].join("\n");
  }
  if (includeMarker) {
    return `${lines.join("\n")}\n---`;
  }
  return lines.join("\n");
}
