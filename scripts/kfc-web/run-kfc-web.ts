import { spawn } from "node:child_process";
import path from "node:path";

function resolveRepoRoot() {
  const initCwd = String(process.env.INIT_CWD || "").trim();
  return path.resolve(initCwd || process.cwd());
}

function hasProjectArg(args) {
  return args.some((arg) => String(arg || "").trim() === "--project");
}

const rawArgs = process.argv.slice(2);
const forwarded = rawArgs[0] === "serve" || rawArgs[0] === "dev" ? rawArgs.slice(1) : rawArgs;
const nextArgs = hasProjectArg(forwarded) ? forwarded : [...forwarded, "--project", resolveRepoRoot()];
const npmExe = process.platform === "win32" ? "npm.cmd" : "npm";
const isHelpRequest = rawArgs.includes("--help") || rawArgs.includes("-h") || rawArgs[0] === "help";

function runCommand(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(npmExe, args, {
      cwd: resolveRepoRoot(),
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

function runNode(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: resolveRepoRoot(),
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

const command = rawArgs[0] || "serve";

try {
  if (isHelpRequest) {
    const binPath = path.join(resolveRepoRoot(), "packages", "kfc-web", "bin", "kfc-web.js");
    const exitCode = await runNode([binPath, ...rawArgs]);
    process.exit(exitCode);
  }

  if (command === "serve" || command === "dev") {
    const planBuild = await runCommand(["run", "-w", "@kamishino/kfc-plan-web", "build:server"]);
    if (planBuild !== 0) process.exit(planBuild);
    const chatBuild = await runCommand(["run", "-w", "@kamishino/kfc-chat", "build:server"]);
    if (chatBuild !== 0) process.exit(chatBuild);
    const exitCode = await runCommand(["run", "-w", "@kamishino/kfc-web", command, "--", ...nextArgs]);
    process.exit(exitCode);
  }
  const binPath = path.join(resolveRepoRoot(), "packages", "kfc-web", "bin", "kfc-web.js");
  const exitCode = await runNode([binPath, ...rawArgs]);
  process.exit(exitCode);
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}
