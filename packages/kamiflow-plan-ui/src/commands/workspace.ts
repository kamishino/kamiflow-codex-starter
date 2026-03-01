import { resolveProjectDir } from "../lib/paths.js";
import {
  addWorkspaceProject,
  getWorkspaceConfigPath,
  listWorkspaces,
  loadWorkspaceProjects,
  removeWorkspaceProject,
  showWorkspace
} from "../lib/workspace-registry.js";

function parseName(args: string[]): string {
  const name = args[0];
  if (!name) {
    throw new Error("Missing workspace name.");
  }
  return name;
}

function parseProject(args: string[]): string {
  const idx = args.indexOf("--project");
  if (idx !== -1) {
    const value = args[idx + 1];
    if (!value) {
      throw new Error("Missing value for --project.");
    }
    return value;
  }
  return resolveProjectDir([]);
}

export async function runWorkspace(args: string[]): Promise<number> {
  const [subcommand, ...rest] = args;
  if (!subcommand || subcommand === "help" || subcommand === "--help" || subcommand === "-h") {
    console.log(`Workspace commands:
  kfp workspace list
  kfp workspace show <name>
  kfp workspace add <name> [--project <path>]
  kfp workspace remove <name> --project <path|project_id>
`);
    return 0;
  }

  if (subcommand === "list") {
    const items = await listWorkspaces();
    if (items.length === 0) {
      console.log(`[kfp] No workspaces found (${getWorkspaceConfigPath()}).`);
      return 0;
    }
    for (const item of items) {
      console.log(`[kfp] ${item.name} (${item.count} projects)`);
    }
    return 0;
  }

  if (subcommand === "show") {
    const name = parseName(rest);
    const ws = await showWorkspace(name);
    if (!ws) {
      console.log(`[kfp] Workspace not found: ${name}`);
      return 1;
    }
    console.log(`[kfp] Workspace: ${ws.name}`);
    if (ws.projects.length === 0) {
      console.log("[kfp] No projects.");
      return 0;
    }
    for (const project of ws.projects) {
      console.log(`[kfp] - ${project.project_id}: ${project.path}`);
    }
    return 0;
  }

  if (subcommand === "add") {
    const name = parseName(rest);
    const projectArg = parseProject(rest.slice(1));
    const result = await addWorkspaceProject(name, projectArg);
    console.log(`[kfp] Added: ${result.project.project_id} -> ${result.project.path}`);
    return 0;
  }

  if (subcommand === "remove") {
    const name = parseName(rest);
    const projectArg = parseProject(rest.slice(1));
    const result = await removeWorkspaceProject(name, projectArg);
    if (!result.removed) {
      console.log(`[kfp] No matching project found in workspace: ${name}`);
      return 1;
    }
    console.log(`[kfp] Removed project from workspace: ${name}`);
    return 0;
  }

  if (subcommand === "paths") {
    // debug helper used by serve/diagnostics
    const name = parseName(rest);
    const projects = await loadWorkspaceProjects(name);
    for (const p of projects) {
      console.log(`[kfp] ${p.project_id} -> ${p.project_dir}`);
    }
    return 0;
  }

  throw new Error(`Unknown workspace subcommand: ${subcommand}`);
}

