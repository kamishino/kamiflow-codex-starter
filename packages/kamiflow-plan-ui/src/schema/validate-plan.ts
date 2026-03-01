import { REQUIRED_FRONTMATTER_FIELDS, REQUIRED_SECTIONS } from "../constants.js";
import type { ParsedPlan } from "../types.js";

export function validateParsedPlan(plan: ParsedPlan) {
  const errors = [];

  for (const key of REQUIRED_FRONTMATTER_FIELDS) {
    const value = plan.frontmatter[key];
    if (typeof value !== "string" || value.trim().length === 0) {
      errors.push(`Missing frontmatter field: ${key}`);
    }
  }

  for (const section of REQUIRED_SECTIONS) {
    if (!Object.prototype.hasOwnProperty.call(plan.sections, section)) {
      errors.push(`Missing section: ${section}`);
      continue;
    }
    if (plan.sections[section].trim().length === 0) {
      errors.push(`Empty section: ${section}`);
    }
  }

  const decision = plan.frontmatter.decision;
  if (decision && decision !== "GO" && decision !== "NO_GO") {
    errors.push("`decision` must be GO or NO_GO.");
  }

  const selectedMode = plan.frontmatter.selected_mode;
  if (selectedMode && selectedMode !== "Plan" && selectedMode !== "Build") {
    errors.push("`selected_mode` must be Plan or Build.");
  }

  return errors;
}
