import path from "node:path";
import {
  resolveDonePlansDir as resolveRuntimeDonePlansDir,
  resolvePlansDir as resolveRuntimePlansDir,
  resolveRunsDir as resolveRuntimeRunsDir
} from "@kamishino/kfc-runtime/plan-workspace";

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
  return resolveRuntimePlansDir(projectDir);
}

export function resolveDonePlansDir(projectDir) {
  return resolveRuntimeDonePlansDir(projectDir);
}

export function resolveRunsDir(projectDir) {
  return resolveRuntimeRunsDir(projectDir);
}
