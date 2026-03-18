import fs from "node:fs/promises";
import path from "node:path";

export const DEFAULT_PLAN_DIR = ".local/plans";
export const DEFAULT_RUN_DIR = ".local/runs";

export type PlanNamingOptions = {
  route?: string;
  topic?: string;
  slug?: string;
};

export type PlanRecord<TFrontmatter = Record<string, unknown>> = {
  filePath: string;
  fileName: string;
  raw: string;
  frontmatter: TFrontmatter;
  planId: string;
  status: string;
  updatedAt: string;
  updatedAtMs: number;
  mtimeMs: number;
};

type FrontmatterParser<TFrontmatter> = (markdown: string) => TFrontmatter;

function toTimestamp(value: unknown, fallback = 0): number {
  if (!value) {
    return fallback;
  }
  const parsed = Date.parse(String(value));
  return Number.isNaN(parsed) ? fallback : parsed;
}

function escapeRegex(value: string): string {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

function readFrontmatterField(frontmatter: unknown, key: string): string {
  if (!frontmatter || typeof frontmatter !== "object") {
    return "";
  }
  const value = (frontmatter as Record<string, unknown>)[key];
  return value === undefined || value === null ? "" : String(value);
}

function humanizeSlug(slug: string, fallback = "Plan"): string {
  const value = String(slug || "")
    .split("-")
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ")
    .trim();
  return value || fallback;
}

export function resolvePlansDir(projectDir: string): string {
  return path.join(projectDir, DEFAULT_PLAN_DIR);
}

export function resolveDonePlansDir(projectDir: string): string {
  return path.join(resolvePlansDir(projectDir), "done");
}

export function resolveRunsDir(projectDir: string): string {
  return path.join(projectDir, DEFAULT_RUN_DIR);
}

export function slugifyPlanSegment(value: string, fallback = ""): string {
  const slug = String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!slug) {
    return fallback;
  }
  return slug;
}

export function buildPlanSlugBase(options: PlanNamingOptions = {}): string {
  const route = slugifyPlanSegment(options.route || "plan", "plan");
  const topic = slugifyPlanSegment(options.topic || options.slug || "", "");
  const combined = topic ? `${route}-${topic}` : route;
  return combined.slice(0, 64).replace(/-+$/g, "") || "plan";
}

export function toLocalDateStamp(date = new Date()): string {
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function parsePlanFileIdentity(filePath: string, options: PlanNamingOptions = {}) {
  const fallbackDate = toLocalDateStamp();
  const baseName = path.basename(filePath, ".md");
  const match = baseName.match(/^(?<date>\d{4}-\d{2}-\d{2})(?:-(?<seq>\d{3}))?(?:-(?<slug>.+))?$/i);
  const date = match?.groups?.date || fallbackDate;
  const seq = match?.groups?.seq || "001";
  const slug = String(match?.groups?.slug || "").trim();
  const slugParts = slug.split("-").filter(Boolean);
  const route = slugifyPlanSegment(slugParts[0] || options.route || "plan", "plan");
  const topicSlug = slugParts.length > 1
    ? slugifyPlanSegment(slugParts.slice(1).join("-"), "")
    : slugifyPlanSegment(options.topic || options.slug || "", "");
  const rawTopic = String(options.topic || "").trim();
  const title = rawTopic || humanizeSlug(topicSlug, `${humanizeSlug(route)} Plan`);
  return {
    date,
    seq,
    route,
    topicSlug,
    slugBase: topicSlug ? `${route}-${topicSlug}` : route,
    title
  };
}

export function buildPlanFileName(options: PlanNamingOptions & { date?: string; seq: number | string }): string {
  const date = String(options.date || toLocalDateStamp());
  const seq = String(options.seq).padStart(3, "0");
  const slugBase = buildPlanSlugBase(options);
  return `${date}-${seq}-${slugBase}.md`;
}

async function collectUsedSequenceNumbers(plansDir: string, date: string) {
  const pattern = new RegExp(`^${escapeRegex(date)}-(\\d{3})(?:-.+)?\\.md$`, "i");
  const usedSequenceNumbers = new Set<number>();
  let highestSequence = 0;

  async function collectFrom(dirPath: string): Promise<void> {
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isFile()) {
          continue;
        }
        const match = entry.name.match(pattern);
        if (!match) {
          continue;
        }
        const parsed = Number.parseInt(match[1], 10);
        if (!Number.isFinite(parsed) || parsed < 1 || parsed > 999) {
          continue;
        }
        usedSequenceNumbers.add(parsed);
        highestSequence = Math.max(highestSequence, parsed);
      }
    } catch {
      // Ignore missing directories.
    }
  }

  await collectFrom(plansDir);
  await collectFrom(path.join(plansDir, "done"));
  return { usedSequenceNumbers, highestSequence };
}

async function findReusablePlanPath(plansDir: string, options: PlanNamingOptions = {}): Promise<string | null> {
  const date = toLocalDateStamp();
  const slugBase = buildPlanSlugBase(options);
  const pattern = new RegExp(`^${escapeRegex(date)}-(\\d{3})-${escapeRegex(slugBase)}\\.md$`, "i");
  let bestPath = "";
  let bestSequence = 0;

  try {
    const entries = await fs.readdir(plansDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile()) {
        continue;
      }
      const match = entry.name.match(pattern);
      if (!match) {
        continue;
      }
      const sequence = Number.parseInt(match[1], 10);
      if (!Number.isFinite(sequence) || sequence < bestSequence) {
        continue;
      }
      bestSequence = sequence;
      bestPath = path.join(plansDir, entry.name);
    }
  } catch {
    return null;
  }

  return bestPath || null;
}

export async function resolveUniqueNewPlanPath(plansDir: string, options: PlanNamingOptions = {}): Promise<string> {
  const date = toLocalDateStamp();
  const { usedSequenceNumbers, highestSequence } = await collectUsedSequenceNumbers(plansDir, date);

  if (highestSequence >= 999) {
    throw new Error("Unable to allocate new plan filename in .local/plans.");
  }

  for (let candidateSequence = highestSequence + 1; candidateSequence <= 999; candidateSequence += 1) {
    if (usedSequenceNumbers.has(candidateSequence)) {
      continue;
    }
    const candidate = path.join(
      plansDir,
      buildPlanFileName({
        ...options,
        date,
        seq: candidateSequence
      })
    );
    if (await pathExists(candidate)) {
      continue;
    }
    return candidate;
  }

  throw new Error("Unable to allocate new plan filename in .local/plans.");
}

export async function resolvePlanFilePath(
  plansDir: string,
  options: PlanNamingOptions = {},
  settings: { forceNew?: boolean } = {}
): Promise<string> {
  if (!settings.forceNew) {
    const reusablePath = await findReusablePlanPath(plansDir, options);
    if (reusablePath) {
      return reusablePath;
    }
  }
  return await resolveUniqueNewPlanPath(plansDir, options);
}

export async function readPlanRecord<TFrontmatter = Record<string, unknown>>(
  filePath: string,
  parseFrontmatter?: FrontmatterParser<TFrontmatter>
): Promise<PlanRecord<TFrontmatter>> {
  const raw = await fs.readFile(filePath, "utf8");
  const stat = await fs.stat(filePath);
  const frontmatter = parseFrontmatter ? parseFrontmatter(raw) : ({} as TFrontmatter);
  const planId = readFrontmatterField(frontmatter, "plan_id") || path.basename(filePath, path.extname(filePath));
  const status = readFrontmatterField(frontmatter, "status") || "unknown";
  const updatedAt = readFrontmatterField(frontmatter, "updated_at");

  return {
    filePath,
    fileName: path.basename(filePath),
    raw,
    frontmatter,
    planId,
    status,
    updatedAt,
    updatedAtMs: toTimestamp(updatedAt, stat.mtimeMs),
    mtimeMs: stat.mtimeMs
  };
}

export async function listPlanFiles(projectDir: string, includeDone = false): Promise<string[]> {
  const plansDir = resolvePlansDir(projectDir);
  const files: string[] = [];

  async function collectFrom(dirPath: string): Promise<void> {
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".md")) {
          continue;
        }
        files.push(path.join(dirPath, entry.name));
      }
    } catch (err) {
      if (err && typeof err === "object" && "code" in err && err.code === "ENOENT") {
        return;
      }
      throw err;
    }
  }

  await collectFrom(plansDir);
  if (includeDone) {
    await collectFrom(resolveDonePlansDir(projectDir));
  }
  return files;
}

export async function loadPlanRecords<TFrontmatter = Record<string, unknown>>(
  projectDir: string,
  parseFrontmatter?: FrontmatterParser<TFrontmatter>,
  includeDone = false
): Promise<Array<PlanRecord<TFrontmatter>>> {
  const files = await listPlanFiles(projectDir, includeDone);
  const records: Array<PlanRecord<TFrontmatter>> = [];
  for (const filePath of files) {
    try {
      records.push(await readPlanRecord(filePath, parseFrontmatter));
    } catch {
      // Ignore unreadable plan files.
    }
  }
  return records;
}

export async function resolvePlanByRef<TFrontmatter = Record<string, unknown>>(
  projectDir: string,
  planRef: string,
  parseFrontmatter?: FrontmatterParser<TFrontmatter>,
  includeDone = true
): Promise<PlanRecord<TFrontmatter> | null> {
  const refPath = path.resolve(projectDir, planRef);
  try {
    const stat = await fs.stat(refPath);
    if (stat.isFile()) {
      return await readPlanRecord(refPath, parseFrontmatter);
    }
  } catch {
    // Continue with plan-id/file-name lookup.
  }

  const plans = await loadPlanRecords(projectDir, parseFrontmatter, includeDone);
  return plans.find((item) => item.planId === planRef || item.fileName === planRef) || null;
}

export function isDonePlan(planLike: { frontmatter?: unknown } | Record<string, unknown>): boolean {
  const frontmatter =
    planLike && typeof planLike === "object" && "frontmatter" in planLike
      ? (planLike as { frontmatter?: unknown }).frontmatter
      : planLike;

  return (
    readFrontmatterField(frontmatter, "status").toLowerCase() === "done" ||
    readFrontmatterField(frontmatter, "next_command").toLowerCase() === "done" ||
    readFrontmatterField(frontmatter, "next_mode").toLowerCase() === "done" ||
    readFrontmatterField(frontmatter, "lifecycle_phase").toLowerCase() === "done"
  );
}

export function selectActivePlan<TFrontmatter = Record<string, unknown>>(
  plans: Array<PlanRecord<TFrontmatter>>
): PlanRecord<TFrontmatter> | null {
  const active = plans.filter((item) => !isDonePlan(item));
  active.sort((left, right) => right.updatedAtMs - left.updatedAtMs);
  return active[0] || null;
}
