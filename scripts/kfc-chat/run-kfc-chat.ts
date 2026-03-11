import { spawn } from "node:child_process";
import path from "node:path";
import { detectProjectRoot } from "../lib/project-root.js";

function resolveRepoRoot() {
  const initCwd = String(process.env.INIT_CWD || "").trim();
  const baseCwd = path.resolve(initCwd || process.cwd());
  return detectProjectRoot(baseCwd);
}

function hasProjectArg(args) {
  return args.some((arg) => String(arg || "").trim() === "--project");
}

const rawArgs = process.argv.slice(2);
const forwarded = rawArgs[0] === "serve" ? rawArgs.slice(1) : rawArgs;
const repoRoot = await resolveRepoRoot();
const nextArgs = hasProjectArg(forwarded)
  ? forwarded
  : [...forwarded, "--project", repoRoot];

const npmExe = process.platform === "win32" ? "npm.cmd" : "npm";
const child = spawn(npmExe, ["run", "-w", "@kamishino/kfc-chat", "serve", "--", ...nextArgs], {
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
  process.exit(code ?? 1);
});

child.on("error", (err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});

