import { Eta } from "eta";
import { resolveViewsDir } from "./runtime-paths.js";

const eta = new Eta({
  views: resolveViewsDir(),
  cache: false
});

export async function renderView(name: string, data: Record<string, unknown>): Promise<string> {
  const output = await eta.renderAsync(`${name}.eta`, data);
  if (!output) {
    throw new Error(`Failed to render view: ${name}`);
  }
  return output;
}
