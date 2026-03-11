import { spawn } from "node:child_process";
import path from "node:path";
import { detectProjectRoot } from "../lib/project-root.js";

async function resolveRepoRoot() {
  const initCwd = String(process.env.INIT_CWD || "").trim();
  const baseCwd = path.resolve(initCwd || process.cwd());
  return await detectProjectRoot(baseCwd);
}

function hasProjectArg(args) {
  return args.some((arg) => String(arg || "").trim() === "--project");
}

function isHelpToken(value: unknown): boolean {
  return value === "--help" || value === "-h";
}

function isServeLike(value: unknown): value is "serve" | "dev" {
  return value === "serve" || value === "dev";
}

const rawArgs = process.argv.slice(2);
const forwarded = rawArgs[0] === "serve" || rawArgs[0] === "dev" ? rawArgs.slice(1) : rawArgs;
const repoRoot = await resolveRepoRoot();
const nextArgs = hasProjectArg(forwarded)
  ? forwarded
  : [...forwarded, "--project", repoRoot];
const npmExe = process.platform === "win32" ? "npm.cmd" : "npm";
const firstArg = typeof rawArgs[0] === "string" ? rawArgs[0] : "";
const isHelpRequest = rawArgs.some(isHelpToken) || firstArg === "help";

function runCommand(args: string[]): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const child = spawn(npmExe, args, {
      cwd: repoRoot,
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

function runNode(args: string[]): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: repoRoot,
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

const command = isServeLike(firstArg) ? firstArg : firstArg || "serve";

try {
  if (isHelpRequest) {
    const binPath = path.join(repoRoot, "packages", "kfc-web", "bin", "kfc-web.js");
    const exitCode = await runNode([binPath, ...rawArgs]);
    process.exit(exitCode);
  }

  if (isServeLike(command)) {
    const planBuild = await runCommand(["run", "-w", "@kamishino/kfc-plan-web", "build:server"]);
    if (planBuild !== 0) process.exit(planBuild);
    const chatBuild = await runCommand(["run", "-w", "@kamishino/kfc-chat", "build:server"]);
    if (chatBuild !== 0) process.exit(chatBuild);
    const exitCode = await runCommand(["run", "-w", "@kamishino/kfc-web", command, "--", ...nextArgs]);
    process.exit(exitCode);
  }
  const binPath = path.join(repoRoot, "packages", "kfc-web", "bin", "kfc-web.js");
  const exitCode = await runNode([binPath, ...rawArgs]);
  process.exit(exitCode);
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}
