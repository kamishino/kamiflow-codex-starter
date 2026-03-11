import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { detectProjectRoot } from "@kamishino/kfc-runtime/project-root";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");
const runnerPath = path.join(repoRoot, "scripts", "kfc-web", "run-kfc-web.js");

function hasProjectArg(args) {
  return args.some((token) => String(token || "").trim() === "--project");
}

export async function runWeb({ cwd, args }) {
  const forwarded = Array.isArray(args) ? [...args] : [];
  const hasProject = hasProjectArg(forwarded);
  const normalizedArgs = hasProject
    ? forwarded
    : [...forwarded, "--project", await detectProjectRoot(String(cwd || process.cwd()))];

  return await new Promise((resolve) => {
    const child = spawn(process.execPath, [runnerPath, ...normalizedArgs], {
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

    child.on("error", (err) => {
      console.error(err instanceof Error ? err.message : String(err));
      resolve(1);
    });
  });
}
