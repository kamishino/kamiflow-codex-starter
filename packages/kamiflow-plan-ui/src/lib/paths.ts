import path from "node:path";
import { DEFAULT_PLAN_DIR } from "../constants.js";

export function resolveProjectDir(args) {
  const idx = args.indexOf("--project");
  if (idx === -1) {
    return process.cwd();
  }
  const value = args[idx + 1];
  if (!value || String(value).startsWith("--")) {
    throw new Error("Missing value for --project.");
  }
  return path.resolve(value);
}

export function resolvePlansDir(projectDir) {
  return path.join(projectDir, DEFAULT_PLAN_DIR);
}

export function resolveDonePlansDir(projectDir) {
  return path.join(resolvePlansDir(projectDir), "done");
}
