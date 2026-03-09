import { Eta } from "eta";

export function createViewRenderer(options) {
  const eta = new Eta({
    views: options.viewsDir,
    cache: options.cache ?? false
  });

  return async function renderView(name, data) {
    const output = await eta.renderAsync(`${name}.eta`, data);
    if (!output) {
      throw new Error(`Failed to render view: ${name}`);
    }
    return output;
  };
}
