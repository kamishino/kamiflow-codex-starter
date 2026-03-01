import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

interface WorkspaceProject {
  project_id: string;
  path: string;
}

interface WorkspaceDoc {
  version: number;
  workspaces: Record<string, { projects: WorkspaceProject[] }>;
}

function getHomeDir(): string {
  if (process.env.KAMIFLOW_HOME && process.env.KAMIFLOW_HOME.trim().length > 0) {
    return path.resolve(process.env.KAMIFLOW_HOME);
  }
  return os.homedir();
}

export function getWorkspaceConfigPath(): string {
  return path.join(getHomeDir(), ".kamiflow", "workspaces.json");
}

async function ensureParentDir(filePath: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

function defaultDoc(): WorkspaceDoc {
  return {
    version: 1,
    workspaces: {}
  };
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

function slugify(input: string): string {
  const out = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return out || "project";
}

async function readDoc(): Promise<WorkspaceDoc> {
  const filePath = getWorkspaceConfigPath();
  if (!(await pathExists(filePath))) {
    return defaultDoc();
  }
  const raw = await fs.readFile(filePath, "utf8");
  const data = JSON.parse(raw) as WorkspaceDoc;
  if (!data || typeof data !== "object" || typeof data.version !== "number") {
    return defaultDoc();
  }
  if (!data.workspaces || typeof data.workspaces !== "object") {
    return defaultDoc();
  }
  return data;
}

async function writeDoc(doc: WorkspaceDoc): Promise<void> {
  const filePath = getWorkspaceConfigPath();
  await ensureParentDir(filePath);
  await fs.writeFile(filePath, JSON.stringify(doc, null, 2) + "\n", "utf8");
}

function ensureWorkspace(doc: WorkspaceDoc, workspace: string) {
  if (!doc.workspaces[workspace]) {
    doc.workspaces[workspace] = { projects: [] };
  }
  return doc.workspaces[workspace];
}

function uniqueProjectId(projectPath: string, existing: WorkspaceProject[]): string {
  const baseName = path.basename(projectPath);
  const baseId = slugify(baseName);
  let attempt = 0;
  while (attempt < 1000) {
    const suffix = attempt === 0 ? "" : `-${attempt}`;
    const candidate = `${baseId}${suffix}`;
    if (!existing.some((item) => item.project_id === candidate)) {
      return candidate;
    }
    attempt += 1;
  }
  throw new Error("Cannot allocate unique project_id.");
}

export async function listWorkspaces(): Promise<{ name: string; count: number }[]> {
  const doc = await readDoc();
  return Object.entries(doc.workspaces)
    .map(([name, ws]) => ({ name, count: ws.projects.length }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function showWorkspace(
  workspace: string
): Promise<{ name: string; projects: WorkspaceProject[] } | null> {
  const doc = await readDoc();
  const ws = doc.workspaces[workspace];
  if (!ws) {
    return null;
  }
  return {
    name: workspace,
    projects: [...ws.projects]
  };
}

export async function addWorkspaceProject(
  workspace: string,
  projectPath: string
): Promise<{ name: string; project: WorkspaceProject }> {
  const resolvedPath = path.resolve(projectPath);
  const doc = await readDoc();
  const ws = ensureWorkspace(doc, workspace);

  if (ws.projects.some((item) => path.resolve(item.path) === resolvedPath)) {
    const existing = ws.projects.find((item) => path.resolve(item.path) === resolvedPath)!;
    return { name: workspace, project: existing };
  }

  const project: WorkspaceProject = {
    project_id: uniqueProjectId(resolvedPath, ws.projects),
    path: resolvedPath
  };
  ws.projects.push(project);
  ws.projects.sort((a, b) => a.project_id.localeCompare(b.project_id));
  await writeDoc(doc);
  return { name: workspace, project };
}

export async function removeWorkspaceProject(
  workspace: string,
  target: string
): Promise<{ name: string; removed: boolean }> {
  const doc = await readDoc();
  const ws = doc.workspaces[workspace];
  if (!ws) {
    return { name: workspace, removed: false };
  }
  const resolvedTarget = path.resolve(target);
  const before = ws.projects.length;
  ws.projects = ws.projects.filter(
    (item) => item.project_id !== target && path.resolve(item.path) !== resolvedTarget
  );
  const removed = ws.projects.length !== before;
  if (removed) {
    await writeDoc(doc);
  }
  return { name: workspace, removed };
}

export async function loadWorkspaceProjects(
  workspace: string
): Promise<Array<{ project_id: string; project_dir: string }>> {
  const info = await showWorkspace(workspace);
  if (!info) {
    throw new Error(`Workspace not found: ${workspace}`);
  }
  if (info.projects.length === 0) {
    throw new Error(`Workspace has no projects: ${workspace}`);
  }
  return info.projects.map((item) => ({
    project_id: item.project_id,
    project_dir: item.path
  }));
}
