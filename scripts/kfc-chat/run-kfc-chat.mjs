import { spawn } from "node:child_process";
import path from "node:path";

function resolveRepoRoot() {
  const initCwd = String(process.env.INIT_CWD || "").trim();
  return path.resolve(initCwd || process.cwd());
}

function hasProjectArg(args) {
  return args.some((arg) => String(arg || "").trim() === "--project");
}

const forwarded = process.argv.slice(2);
const nextArgs = hasProjectArg(forwarded)
  ? forwarded
  : [...forwarded, "--project", resolveRepoRoot()];

const child = spawn("npm.cmd", ["run", "-w", "@kamishino/kfc-chat", "serve", "--", ...nextArgs], {
  cwd: resolveRepoRoot(),
  stdio: "inherit",
  windowsHide: true,
  shell: false
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
