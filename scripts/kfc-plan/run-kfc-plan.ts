import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { detectProjectRoot } from "@kamishino/kfc-runtime/project-root";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "../../..");

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("[plan-ui] Missing kfc-plan subcommand (init|serve|validate).");
  process.exit(1);
}

const hasProjectArg = args.includes("--project");
const envProjectDir = String(process.env.KAMIFLOW_PROJECT_DIR || "").trim();
const initCwd = String(process.env.INIT_CWD || "").trim();
const baseCwd = path.resolve(initCwd || process.cwd());
const projectDir = envProjectDir
  ? path.resolve(initCwd || process.cwd(), envProjectDir)
  : await detectProjectRoot(baseCwd);
const forwarded = hasProjectArg ? args : [...args, "--project", projectDir];

const npmExe = process.platform === "win32" ? "npm.cmd" : "npm";
const npmArgs = ["run", "-w", "@kamishino/kfc-plan-web", "kfc-plan", "--", ...forwarded];
const child = spawn(npmExe, npmArgs, {
  cwd: rootDir,
  stdio: "inherit",
  shell: process.platform === "win32"
});

child.on("close", (code) => {
  process.exit(code ?? 1);
});

