import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "../../..");
const PACKAGE_JSON_PATH = path.join(ROOT_DIR, "package.json");
const PACKAGE_NAME = JSON.parse(fs.readFileSync(PACKAGE_JSON_PATH, "utf8")).name;

function usage() {
  console.log(
    [
      "Usage: npm run client:link-bootstrap -- --project <path> [--profile <client|dogfood>] [--port <n>] [--force] [--skip-serve-check]",
      "",
      "Description:",
      "  1) npm link in this repo",
      `  2) npm link ${PACKAGE_NAME} in target project`,
      "  3) npx --no-install kfc client bootstrap --project ."
    ].join("\n")
  );
}

function resolveNpmCli() {
  const fromEnv = process.env.npm_execpath;
  if (fromEnv && fs.existsSync(fromEnv)) {
    return fromEnv;
  }
  const candidate = path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");
  if (fs.existsSync(candidate)) {
    return candidate;
  }
  throw new Error("Cannot resolve npm-cli.js. Ensure npm is installed with Node.js.");
}

function parseArgs(argv) {
  const out = {
    project: "",
    profile: "",
    port: "",
    force: false,
    skipServeCheck: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--project") {
      out.project = argv[i + 1] || "";
      i += 1;
      continue;
    }
    if (token === "--profile") {
      out.profile = argv[i + 1] || "";
      i += 1;
      continue;
    }
    if (token === "--port") {
      out.port = argv[i + 1] || "";
      i += 1;
      continue;
    }
    if (token === "--force") {
      out.force = true;
      continue;
    }
    if (token === "--skip-serve-check") {
      out.skipServeCheck = true;
      continue;
    }
    if (token === "--help" || token === "-h") {
      usage();
      process.exit(0);
    }
    throw new Error(`Unknown option: ${token}`);
  }

  if (!out.project) {
    throw new Error("Missing required --project <path>.");
  }
  return out;
}

function runNodeNpm(args, cwd) {
  const result = spawnSync(process.execPath, [resolveNpmCli(), ...args], {
    cwd,
    stdio: "inherit"
  });
  if (result.status !== 0) {
    if (result.error) {
      throw result.error;
    }
    throw new Error(`Command failed: npm ${args.join(" ")} (exit ${result.status ?? 1})`);
  }
}

function main() {
  const parsed = parseArgs(process.argv.slice(2));
  const projectDir = path.resolve(process.cwd(), parsed.project);

  if (!fs.existsSync(projectDir) || !fs.statSync(projectDir).isDirectory()) {
    throw new Error(`Project path does not exist or is not a directory: ${projectDir}`);
  }

  console.log(`[client-link] Linking package from ${ROOT_DIR}`);
  runNodeNpm(["link"], ROOT_DIR);

  console.log(`[client-link] Linking ${PACKAGE_NAME} into ${projectDir}`);
  runNodeNpm(["link", PACKAGE_NAME], projectDir);

  const bootstrapArgs = ["exec", "--no-install", "--", "kfc", "client", "bootstrap", "--project", "."];
  if (parsed.profile) {
    bootstrapArgs.push("--profile", parsed.profile);
  }
  if (parsed.port) {
    bootstrapArgs.push("--port", parsed.port);
  }
  if (parsed.force) {
    bootstrapArgs.push("--force");
  }
  if (parsed.skipServeCheck) {
    bootstrapArgs.push("--skip-serve-check");
  }

  console.log("[client-link] Running client bootstrap in target project");
  runNodeNpm(bootstrapArgs, projectDir);
  console.log("[client-link] Completed.");
}

try {
  main();
} catch (err) {
  console.error(`[client-link] ERROR: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}
