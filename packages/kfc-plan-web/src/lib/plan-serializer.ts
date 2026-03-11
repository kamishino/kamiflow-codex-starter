import { REQUIRED_SECTIONS } from "../constants.js";
import type { ParsedPlan } from "../types.js";

function escapeFrontmatterValue(value: string): string {
  if (/[:#\n]/.test(value)) {
    return JSON.stringify(value);
  }
  return value;
}

export function serializePlan(parsed: ParsedPlan): string {
  const frontmatterLines = Object.entries(parsed.frontmatter).map(
    ([key, value]) => `${key}: ${escapeFrontmatterValue(String(value))}`
  );

  const rendered = new Set<string>();
  let body = "";
  for (const part of Array.isArray(parsed.bodyParts) ? parsed.bodyParts : []) {
    if (part.type === "raw") {
      body += part.value;
      continue;
    }
    if (!Object.prototype.hasOwnProperty.call(parsed.sections, part.title)) {
      continue;
    }
    body += `## ${part.title}\n${parsed.sections[part.title].trim()}`;
    rendered.add(part.title);
  }

  const sectionOrder = [...REQUIRED_SECTIONS];
  for (const section of Object.keys(parsed.sections)) {
    if (!sectionOrder.includes(section)) {
      sectionOrder.push(section);
    }
  }

  for (const title of sectionOrder) {
    if (rendered.has(title) || !Object.prototype.hasOwnProperty.call(parsed.sections, title)) {
      continue;
    }
    if (body.length > 0 && !body.endsWith("\n")) {
      body += "\n";
    }
    if (body.length > 0 && !body.endsWith("\n\n")) {
      body += "\n";
    }
    body += `## ${title}\n${parsed.sections[title].trim()}`;
    rendered.add(title);
  }

  const sectionBlocks = body.trimStart();

  return `---\n${frontmatterLines.join("\n")}\n---\n\n${sectionBlocks}\n`;
}
