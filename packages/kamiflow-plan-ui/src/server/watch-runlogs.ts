import chokidar from "chokidar";
import path from "node:path";
import { resolveRunsDir } from "../lib/paths.js";

export function watchRunlogs(projectDir, onEvent) {
  const runDir = resolveRunsDir(projectDir);
  const glob = path.join(runDir, "**/*.jsonl").replace(/\\/g, "/");

  const watcher = chokidar.watch(glob, {
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: 150,
      pollInterval: 100
    }
  });

  watcher.on("add", (filePath) => onEvent({ type: "runlog_updated", filePath }));
  watcher.on("change", (filePath) => onEvent({ type: "runlog_updated", filePath }));
  watcher.on("unlink", (filePath) => onEvent({ type: "runlog_deleted", filePath }));

  return watcher;
}
