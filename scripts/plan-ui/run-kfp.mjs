import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "../..");

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("[plan-ui] Missing kfp subcommand (init|serve|validate).");
  process.exit(1);
}

const hasProjectArg = args.includes("--project");
const projectDir = process.env.KAMIFLOW_PROJECT_DIR || process.env.INIT_CWD || process.cwd();
const forwarded = hasProjectArg ? args : [...args, "--project", projectDir];

const npmExe = process.platform === "win32" ? "npm.cmd" : "npm";
const npmArgs = ["--prefix", "packages/kamiflow-plan-ui", "run", "kfp", "--", ...forwarded];
const child = spawn(npmExe, npmArgs, {
  cwd: rootDir,
  stdio: "inherit",
  shell: process.platform === "win32"
});

child.on("close", (code) => {
  process.exit(code ?? 1);
});
