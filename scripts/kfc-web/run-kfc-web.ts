import { spawn } from "node:child_process";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { detectProjectRoot } from "../lib/project-root.js";

type BuildTarget = {
  name: string;
  command: string[];
  outputs: string[];
  inputs: string[];
};

type ParsedArgs = {
  command: string;
  nextArgs: string[];
  forceRebuild: boolean;
  skipBuild: boolean;
};

async function resolveRepoRoot() {
  const initCwd = String(process.env.INIT_CWD || "").trim();
  const baseCwd = path.resolve(initCwd || process.cwd());
  return await detectProjectRoot(baseCwd);
}

function isHelpToken(value: unknown): boolean {
  return value === "--help" || value === "-h";
}

function isServeLike(value: unknown): value is "serve" | "dev" {
  return value === "serve" || value === "dev";
}

function parseArgs(args: string[]): ParsedArgs {
  const command = isServeLike(args[0]) ? args[0] : "";
  const sourceArgs = command ? args.slice(1) : args;
  const nextArgs: string[] = [];
  let forceRebuild = false;
  let skipBuild = false;

  for (const arg of sourceArgs) {
    if (arg === "--rebuild") {
      forceRebuild = true;
      continue;
    }
    if (arg === "--skip-build" || arg === "--fast-start") {
      skipBuild = true;
      continue;
    }
    nextArgs.push(arg);
  }

  return { command, nextArgs, forceRebuild, skipBuild };
}

function hasProjectArg(args: string[]) {
  return args.some((arg) => String(arg || "").trim() === "--project");
}

function joinProjectArg(args: string[], repoRoot: string) {
  return hasProjectArg(args) ? args : [...args, "--project", repoRoot];
}

function runCommand(cwd: string, args: string[]): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const npmExe = process.platform === "win32" ? "npm.cmd" : "npm";
    const child = spawn(npmExe, args, {
      cwd,
      stdio: "inherit",
      windowsHide: true,
      shell: process.platform === "win32"
    });
    child.on("exit", (code, signal) => {
      if (signal) {
        process.kill(process.pid, signal);
        return;
      }
      resolve(code ?? 1);
    });
    child.on("error", reject);
  });
}

function runNode(cwd: string, args: string[]): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd,
      stdio: "inherit",
      windowsHide: true
    });
    child.on("exit", (code, signal) => {
      if (signal) {
        process.kill(process.pid, signal);
        return;
      }
      resolve(code ?? 1);
    });
    child.on("error", reject);
  });
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await stat(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function collectLatestMtime(target: string): Promise<number> {
  const entry = await stat(target);
  if (!entry.isDirectory()) {
    return entry.mtimeMs;
  }

  let latest = entry.mtimeMs;
  const children = await readdir(target, { withFileTypes: true });
  for (const child of children) {
    if (child.isSymbolicLink()) {
      continue;
    }
    if (child.isDirectory() && (child.name === "node_modules" || child.name === "dist" || child.name === ".git")) {
      continue;
    }
    const childPath = path.join(target, child.name);
    const childMtime = await collectLatestMtime(childPath);
    if (childMtime > latest) {
      latest = childMtime;
    }
  }
  return latest;
}

async function maxMtime(targets: string[]): Promise<number> {
  let latest = 0;
  for (const target of targets) {
    try {
      const next = await collectLatestMtime(target);
      if (next > latest) {
        latest = next;
      }
    } catch {
      continue;
    }
  }
  return latest;
}

async function needsRebuild(target: BuildTarget): Promise<boolean> {
  for (const output of target.outputs) {
    if (!(await pathExists(output))) {
      return true;
    }
  }

  const outputMtime = await maxMtime(target.outputs);
  const inputMtime = await maxMtime(target.inputs);
  if (outputMtime === 0) {
    return true;
  }
  return inputMtime > outputMtime;
}

function buildTargetsForRepo(base: string): BuildTarget[] {
  return [
    {
      name: "@kamishino/kfc-plan-web",
      command: ["run", "-w", "@kamishino/kfc-plan-web", "build:server"],
      outputs: [
        path.join(base, "packages", "kfc-plan-web", "dist", "cli.js"),
        path.join(base, "packages", "kfc-plan-web", "dist", "server", "create-server.js")
      ],
      inputs: [
        path.join(base, "packages", "kfc-plan-web", "src"),
        path.join(base, "packages", "kfc-plan-web", "tsconfig.json"),
        path.join(base, "packages", "kfc-plan-web", "tsconfig.tools.json"),
        path.join(base, "packages", "kfc-web-runtime", "src"),
        path.join(base, "packages", "kfc-web-runtime", "tsconfig.json")
      ]
    },
    {
      name: "@kamishino/kfc-chat",
      command: ["run", "-w", "@kamishino/kfc-chat", "build:server"],
      outputs: [
        path.join(base, "packages", "kfc-chat", "dist", "cli.js"),
        path.join(base, "packages", "kfc-chat", "dist", "server", "create-server.js")
      ],
      inputs: [
        path.join(base, "packages", "kfc-chat", "src"),
        path.join(base, "packages", "kfc-chat", "tsconfig.json"),
        path.join(base, "packages", "kfc-runtime", "src"),
        path.join(base, "packages", "kfc-web-runtime", "src"),
        path.join(base, "packages", "kfc-runtime", "tsconfig.json"),
        path.join(base, "packages", "kfc-web-runtime", "tsconfig.json")
      ]
    },
    {
      name: "@kamishino/kfc-web",
      command: ["run", "-w", "@kamishino/kfc-web", "build:server"],
      outputs: [path.join(base, "packages", "kfc-web", "dist", "server.js")],
      inputs: [
        path.join(base, "packages", "kfc-web", "src"),
        path.join(base, "packages", "kfc-web", "vite.config.ts"),
        path.join(base, "packages", "kfc-web", "vite.config.mjs"),
        path.join(base, "packages", "kfc-web", "vite.config.js"),
        path.join(base, "packages", "kfc-web", "tsconfig.json"),
        path.join(base, "packages", "kfc-web-runtime", "src"),
        path.join(base, "packages", "kfc-runtime", "src")
      ]
    }
  ];
}

async function ensureBuilds(repoRoot: string, forceRebuild: boolean, skipBuild: boolean) {
  if (skipBuild) {
    console.log("[kfc-web] --skip-build/--fast-start requested, skipping package rebuild.");
    return;
  }

  const targets = buildTargetsForRepo(repoRoot);
  const toBuild: BuildTarget[] = [];

  for (const target of targets) {
    if (forceRebuild || (await needsRebuild(target))) {
      toBuild.push(target);
    }
  }

  if (toBuild.length === 0) {
    console.log("[kfc-web] Existing build artifacts are up to date.");
    return;
  }

  if (forceRebuild) {
    console.log("[kfc-web] --rebuild requested, rebuilding feature/web packages.");
  } else {
    console.log(`[kfc-web] Rebuild required for: ${toBuild.map((target) => target.name).join(", ")}.`);
  }

  for (const target of toBuild) {
    const code = await runCommand(repoRoot, target.command);
    if (code !== 0) process.exit(code);
  }
}

const repoRoot = await resolveRepoRoot();
const parsed = parseArgs(process.argv.slice(2));
const rawArgs = process.argv.slice(2);
const rawFirstArg = String(rawArgs[0] || "");
const isHelpRequest = rawArgs.some(isHelpToken) || rawFirstArg === "help";
const binPath = path.join(repoRoot, "packages", "kfc-web", "bin", "kfc-web.js");
const nextArgs = joinProjectArg(parsed.nextArgs, repoRoot);

  try {
  if (isHelpRequest) {
    const helpArgs = isServeLike(parsed.command)
      ? [binPath, parsed.command, ...parsed.nextArgs]
      : [binPath, "help"];
    const exitCode = await runNode(repoRoot, helpArgs);
    process.exit(exitCode);
  }

  if (isServeLike(parsed.command)) {
    await ensureBuilds(repoRoot, parsed.forceRebuild, parsed.skipBuild);
    const exitCode = await runNode(repoRoot, [binPath, parsed.command, ...nextArgs]);
    process.exit(exitCode);
  }

  const exitCode = await runNode(repoRoot, [binPath, ...parsed.nextArgs]);
  process.exit(exitCode);
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}
