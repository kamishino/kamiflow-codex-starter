import {
  addWorkspaceProject,
  getWorkspaceConfigPath,
  listWorkspaces,
  loadWorkspaceProjects,
  removeWorkspaceProject,
  showWorkspace
} from "../lib/workspace-registry.js";
import { detectProjectRoot } from "../lib/project-detect.js";

function parseName(args: string[]): string {
  const name = args[0];
  if (!name) {
    throw new Error("Missing workspace name.");
  }
  return name;
}

async function parseProject(args: string[]): Promise<string> {
  const idx = args.indexOf("--project");
  if (idx !== -1) {
    const value = args[idx + 1];
    if (!value) {
      throw new Error("Missing value for --project.");
    }
    return value;
  }
  return await detectProjectRoot(process.cwd());
}

export async function runWorkspace(args: string[]): Promise<number> {
  const [subcommand, ...rest] = args;
  if (!subcommand || subcommand === "help" || subcommand === "--help" || subcommand === "-h") {
    console.log(`Workspace commands:
  kfc-plan workspace list
  kfc-plan workspace show <name>
  kfc-plan workspace add <name> [--project <path>] (auto-detects project root if omitted)
  kfc-plan workspace remove <name> --project <path|project_id>
`);
    return 0;
  }

  if (subcommand === "list") {
    const items = await listWorkspaces();
    if (items.length === 0) {
      console.log(`[kfc-plan] No workspaces found (${getWorkspaceConfigPath()}).`);
      return 0;
    }
    for (const item of items) {
      console.log(`[kfc-plan] ${item.name} (${item.count} projects)`);
    }
    return 0;
  }

  if (subcommand === "show") {
    const name = parseName(rest);
    const ws = await showWorkspace(name);
    if (!ws) {
      console.log(`[kfc-plan] Workspace not found: ${name}`);
      return 1;
    }
    console.log(`[kfc-plan] Workspace: ${ws.name}`);
    if (ws.projects.length === 0) {
      console.log("[kfc-plan] No projects.");
      return 0;
    }
    for (const project of ws.projects) {
      console.log(`[kfc-plan] - ${project.project_id}: ${project.path}`);
    }
    return 0;
  }

  if (subcommand === "add") {
    const name = parseName(rest);
    const projectArg = await parseProject(rest.slice(1));
    const result = await addWorkspaceProject(name, projectArg);
    console.log(`[kfc-plan] Added: ${result.project.project_id} -> ${result.project.path}`);
    return 0;
  }

  if (subcommand === "remove") {
    const name = parseName(rest);
    const projectArg = await parseProject(rest.slice(1));
    const result = await removeWorkspaceProject(name, projectArg);
    if (!result.removed) {
      console.log(`[kfc-plan] No matching project found in workspace: ${name}`);
      return 1;
    }
    console.log(`[kfc-plan] Removed project from workspace: ${name}`);
    return 0;
  }

  if (subcommand === "paths") {
    // debug helper used by serve/diagnostics
    const name = parseName(rest);
    const projects = await loadWorkspaceProjects(name);
    for (const p of projects) {
      console.log(`[kfc-plan] ${p.project_id} -> ${p.project_dir}`);
    }
    return 0;
  }

  throw new Error(`Unknown workspace subcommand: ${subcommand}`);
}
