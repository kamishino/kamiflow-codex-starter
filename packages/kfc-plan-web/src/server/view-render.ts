import { resolveViewsDir } from "./runtime-paths.js";
import { createViewRenderer } from "../../../kfc-web-runtime/dist/view-render.js";

export const renderView: (name: string, data: Record<string, unknown>) => Promise<string> = createViewRenderer({
  viewsDir: resolveViewsDir()
});

