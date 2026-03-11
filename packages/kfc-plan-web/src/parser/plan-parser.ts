import path from "node:path";
import type { ParsedPlan } from "../types.js";

function parseSimpleFrontmatter(yamlBlock: string) {
  const data = {};
  const lines = yamlBlock.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const sep = trimmed.indexOf(":");
    if (sep <= 0) {
      throw new Error(`Invalid frontmatter line: "${line}"`);
    }
    const key = trimmed.slice(0, sep).trim();
    const rawValue = trimmed.slice(sep + 1).trim();
    const value = rawValue.replace(/^['"]|['"]$/g, "");
    data[key] = value;
  }
  return data;
}

type LegacyParseResult = {
  frontmatter: Record<string, string>;
  bodyStartLine: number;
};

function parseLegacyLeadingFrontmatter(markdown: string): LegacyParseResult | null {
  const lines = markdown.split(/\r?\n/);
  if (lines.length === 0) {
    return null;
  }

  let endIndex = -1;
  for (let i = 0; i < lines.length; i += 1) {
    const trimmed = lines[i].trim();
    if (trimmed === "---" || /^##\s+/.test(trimmed)) {
      endIndex = i;
      break;
    }
  }

  const scanLimit = endIndex === -1 ? lines.length : endIndex;
  const frontmatter: Record<string, string> = {};
  let parsedAny = false;

  for (let i = 0; i < scanLimit; i += 1) {
    const trimmed = lines[i].trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const sep = trimmed.indexOf(":");
    if (sep <= 0) {
      continue;
    }
    const key = trimmed.slice(0, sep).trim();
    const rawValue = trimmed.slice(sep + 1).trim();
    frontmatter[key] = rawValue.replace(/^["']|["']$/g, "");
    parsedAny = true;
  }

  if (!parsedAny) {
    return null;
  }

  if (!frontmatter.plan_id && !frontmatter.title && !frontmatter.status && !frontmatter.next_command) {
    return null;
  }

  const bodyStartLine = endIndex === -1 ? lines.length : endIndex;
  return { frontmatter, bodyStartLine };
}

function extractFrontmatter(markdown) {
  if (!markdown.startsWith("---")) {
    const legacy = parseLegacyLeadingFrontmatter(markdown);
    if (!legacy) {
      throw new Error("Plan file must start with YAML frontmatter block.");
    }

    const body = markdown
      .split(/\r?\n/)
      .slice(legacy.bodyStartLine)
      .join("\n")
      .trimStart();
    return {
      frontmatter: legacy.frontmatter,
      body
    };
  }

  const lines = markdown.split(/\r?\n/);
  let endIndex = -1;
  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i].trim() === "---") {
      endIndex = i;
      break;
    }
  }

  if (endIndex === -1) {
    throw new Error("Missing closing frontmatter delimiter (---).");
  }

  const frontmatterBlock = lines.slice(1, endIndex).join("\n");
  const body = lines.slice(endIndex + 1).join("\n").trimStart();
  return {
    frontmatter: parseSimpleFrontmatter(frontmatterBlock),
    body
  };
}

export function parseSections(body) {
  const headings = [...body.matchAll(/^##\s+(.+)$/gm)];
  const sections = {};
  const bodyParts: ParsedPlan["bodyParts"] = [];
  let cursor = 0;

  for (let i = 0; i < headings.length; i += 1) {
    const heading = headings[i];
    const title = heading[1].trim();
    const headingStart = heading.index;
    const start = headingStart + heading[0].length;
    const end = i + 1 < headings.length ? headings[i + 1].index : body.length;
    if (headingStart > cursor) {
      bodyParts.push({ type: "raw", value: body.slice(cursor, headingStart) });
    }
    const content = body.slice(start, end).trim();
    sections[title] = content;
    bodyParts.push({ type: "section", title });
    cursor = end;
  }
  if (cursor < body.length || bodyParts.length === 0) {
    bodyParts.push({ type: "raw", value: body.slice(cursor) });
  }
  return { sections, bodyParts };
}

export function parsePlanFileContent(markdown, filePath = "<memory>") {
  const { frontmatter, body } = extractFrontmatter(markdown);
  const { sections, bodyParts } = parseSections(body);
  const parsed: ParsedPlan = {
    filePath,
    fileName: path.basename(filePath),
    frontmatter,
    body,
    bodyParts,
    sections
  };
  return parsed;
}
