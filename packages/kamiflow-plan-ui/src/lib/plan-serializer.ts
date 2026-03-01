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

  const sectionOrder = [...REQUIRED_SECTIONS];
  for (const section of Object.keys(parsed.sections)) {
    if (!sectionOrder.includes(section)) {
      sectionOrder.push(section);
    }
  }

  const sectionBlocks = sectionOrder
    .filter((title) => Object.prototype.hasOwnProperty.call(parsed.sections, title))
    .map((title) => `## ${title}\n${parsed.sections[title].trim()}`)
    .join("\n\n");

  return `---\n${frontmatterLines.join("\n")}\n---\n\n${sectionBlocks}\n`;
}
