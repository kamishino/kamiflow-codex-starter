import { resolveViewsDir } from "./runtime-paths.js";
import { createViewRenderer } from "../../../kfc-web-runtime/src/view-render.js";

export const renderView = createViewRenderer({
  viewsDir: resolveViewsDir()
});
