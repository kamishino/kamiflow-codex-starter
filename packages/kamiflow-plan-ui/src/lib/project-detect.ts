import fs from "node:fs/promises";
import path from "node:path";

async function exists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function findUp(startDir: string, marker: string): Promise<string | null> {
  let current = path.resolve(startDir);
  while (true) {
    const candidate = path.join(current, marker);
    if (await exists(candidate)) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}

export async function detectProjectRoot(cwd: string): Promise<string> {
  const fromGit = await findUp(cwd, ".git");
  if (fromGit) {
    return fromGit;
  }

  const fromPackage = await findUp(cwd, "package.json");
  if (fromPackage) {
    return fromPackage;
  }

  return path.resolve(cwd);
}

