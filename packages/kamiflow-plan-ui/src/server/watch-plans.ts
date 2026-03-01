import chokidar from "chokidar";
import path from "node:path";
import { resolvePlansDir } from "../lib/paths.js";

export function watchPlans(projectDir, onEvent) {
  const plansDir = resolvePlansDir(projectDir);
  const glob = path.join(plansDir, "*.md").replace(/\\/g, "/");

  const watcher = chokidar.watch(glob, {
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: 200,
      pollInterval: 100
    }
  });

  watcher.on("add", (filePath) => onEvent({ type: "plan_updated", filePath }));
  watcher.on("change", (filePath) => onEvent({ type: "plan_updated", filePath }));
  watcher.on("unlink", (filePath) => onEvent({ type: "plan_deleted", filePath }));

  return watcher;
}
