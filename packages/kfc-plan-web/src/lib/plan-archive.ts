import fs from "node:fs/promises";
import path from "node:path";
import { resolveDonePlansDir } from "./paths.js";

export async function archivePlanFile(
  projectDir: string,
  sourceFilePath: string,
  options?: { doneDir?: string }
): Promise<string> {
  const doneDir = options?.doneDir ? path.resolve(options.doneDir) : resolveDonePlansDir(projectDir);
  await fs.mkdir(doneDir, { recursive: true });

  const parsed = path.parse(sourceFilePath);
  let attempt = 0;
  while (attempt < 1000) {
    const suffix = attempt === 0 ? "" : `-${attempt}`;
    const candidate = path.join(doneDir, `${parsed.name}${suffix}${parsed.ext}`);
    try {
      await fs.access(candidate);
      attempt += 1;
      continue;
    } catch {
      await fs.rename(sourceFilePath, candidate);
      return candidate;
    }
  }

  throw new Error("Unable to archive plan due to repeated filename collisions.");
}
