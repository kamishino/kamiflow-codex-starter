import path from "node:path";
import type { ParsedPlan } from "../types.js";
import { resolveDiagramMode } from "../lib/diagram-mode.js";

function parseSimpleFrontmatter(yamlBlock) {
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

function extractFrontmatter(markdown) {
  if (!markdown.startsWith("---")) {
    throw new Error("Plan file must start with YAML frontmatter block.");
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

  for (let i = 0; i < headings.length; i += 1) {
    const heading = headings[i];
    const title = heading[1].trim();
    const start = heading.index + heading[0].length;
    const end = i + 1 < headings.length ? headings[i + 1].index : body.length;
    const content = body.slice(start, end).trim();
    sections[title] = content;
  }
  return sections;
}

function sanitizeDiagramLabel(value) {
  return String(value || "")
    .replace(/\r?\n+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/"/g, '\\"')
    .slice(0, 80);
}

function extractChecklistItems(sectionText) {
  const lines = String(sectionText || "").split(/\r?\n/);
  const out = [];
  for (const line of lines) {
    const match = line.match(/^\s*- \[(?<state>[ xX])\]\s*(?<text>.+)$/);
    if (!match?.groups?.text) {
      continue;
    }
    const label = sanitizeDiagramLabel(match.groups.text);
    if (!label) {
      continue;
    }
    out.push({
      checked: String(match.groups.state || " ").toLowerCase() === "x",
      text: label
    });
  }
  return out;
}

function hasTechnicalSolutionDiagramSection(sections) {
  const candidates = ["Technical Solution Diagram", "Solution Diagram", "Technical Solution", "Implementation Flow"];
  return candidates.some((name) => typeof sections[name] === "string" && sections[name].trim().length > 0);
}

function buildDefaultTechnicalSolutionSection(frontmatter, sections) {
  const title = sanitizeDiagramLabel(frontmatter?.title || "") || "Selected Solution";
  const tasks = extractChecklistItems(sections["Implementation Tasks"] || "").slice(0, 4);
  const lines = ["flowchart LR", `  IDEA["${title}"] --> PLAN["Implementation Plan"]`];
  if (!tasks.length) {
    lines.push('  PLAN --> BUILD["Build Slice"] --> CHECK["Check Acceptance"]');
  } else {
    let previous = "PLAN";
    for (let i = 0; i < tasks.length; i += 1) {
      const nodeId = `T${i + 1}`;
      const prefix = tasks[i].checked ? "DONE: " : "TODO: ";
      lines.push(`  ${nodeId}["${sanitizeDiagramLabel(prefix + tasks[i].text)}"]`);
      lines.push(`  ${previous} --> ${nodeId}`);
      previous = nodeId;
    }
    lines.push(`  ${previous} --> CHECK["Check Acceptance"]`);
  }

  return ["```mermaid", lines.join("\n"), "```", "- Notes: Keep this diagram updated as implementation decisions evolve."].join("\n");
}

export function parsePlanFileContent(markdown, filePath = "<memory>") {
  const { frontmatter, body } = extractFrontmatter(markdown);
  const sections = parseSections(body);
  const diagramMode = resolveDiagramMode(frontmatter["diagram_mode"]).mode;
  if (diagramMode === "required" && !hasTechnicalSolutionDiagramSection(sections)) {
    sections["Technical Solution Diagram"] = buildDefaultTechnicalSolutionSection(frontmatter, sections);
  }
  const parsed: ParsedPlan = {
    filePath,
    fileName: path.basename(filePath),
    frontmatter,
    body,
    sections
  };
  return parsed;
}
