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
const child = spawn(npmExe, ["run", "-w", "@kamishino/kfc-web", rawArgs[0] || "serve", "--", ...nextArgs], {
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
  process.exit(code ?? 1);
});
child.on("error", (err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
