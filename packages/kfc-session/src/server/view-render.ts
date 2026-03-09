import { resolveViewsDir } from "./runtime-paths.js";
import { createViewRenderer } from "../../../kfc-web-runtime/dist/view-render.js";

export const renderView = createViewRenderer({
  viewsDir: resolveViewsDir()
});

