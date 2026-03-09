import path from "node:path";
import { Eta } from "eta";

export function createTemplateRenderer(templatePath) {
  const eta = new Eta({ views: path.dirname(templatePath), cache: false });
  return async (data) => {
    const out = await eta.renderAsync(path.basename(templatePath), data);
    if (!out) {
      throw new Error(`Failed to render template: ${templatePath}`);
    }
    return out;
  };
}
