import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

type ProjectRootOptions = {
  homeDir?: string;
};

const DEFAULT_HOME_DIR = path.resolve(os.homedir());

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function findUp(startDir: string, marker: string, homeDir: string): Promise<string | null> {
  const resolvedStartDir = path.resolve(startDir);
  let current = path.resolve(startDir);
  while (true) {
    const candidate = path.join(current, marker);
    const isHomeDir = path.resolve(current) === homeDir;
    if (await pathExists(candidate) && (!isHomeDir || current === resolvedStartDir)) {
      return current;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}

export async function detectProjectRoot(cwd: string, options: ProjectRootOptions = {}): Promise<string> {
  const homeDir = path.resolve(options.homeDir || DEFAULT_HOME_DIR);

  const fromGit = await findUp(cwd, ".git", homeDir);
  if (fromGit) {
    return fromGit;
  }

  const fromPackage = await findUp(cwd, "package.json", homeDir);
  if (fromPackage) {
    return fromPackage;
  }

  return path.resolve(cwd);
}
