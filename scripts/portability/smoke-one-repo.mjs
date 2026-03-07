import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "../..");
const PACKAGE_JSON_PATH = path.join(ROOT_DIR, "package.json");
const PACKAGE_JSON = JSON.parse(fs.readFileSync(PACKAGE_JSON_PATH, "utf8"));
const PACKAGE_NAME = PACKAGE_JSON.name;

const NODE = process.execPath;
const NPM_CLI = resolveNpmCli();

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

function printUsage() {
  console.log(
    [
      "Usage: npm run portability:smoke -- --project <path> [--link] [--port <n>] [--out <path>] [--legacy-steps]",
      "",
      "Options:",
      "  --project <path>   Target project path for portability validation (required).",
      "  --link             Run npm link from this repo and npm link <package> in target project.",
      "  --port <n>         Port for kfc plan serve health check (default: 4310).",
      "  --out <path>       Output markdown report path (default: artifacts/portability/<timestamp>-<project>.md)",
      "  --legacy-steps     Use legacy granular checks instead of baseline one-command `kfc client --force` smoke."
    ].join("\n")
  );
}

function parseArgs(argv) {
  const out = {
    project: "",
    port: 4310,
    link: false,
    out: "",
    legacySteps: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--project") {
      out.project = argv[i + 1] || "";
      i += 1;
      continue;
    }
    if (token === "--port") {
      out.port = Number(argv[i + 1] || "4310");
      i += 1;
      continue;
    }
    if (token === "--out") {
      out.out = argv[i + 1] || "";
      i += 1;
      continue;
    }
    if (token === "--link") {
      out.link = true;
      continue;
    }
    if (token === "--legacy-steps") {
      out.legacySteps = true;
      continue;
    }
    if (token === "--help" || token === "-h") {
      printUsage();
      process.exit(0);
    }
  }

  return out;
}

function timestampToken() {
  return new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
}

function shortOutput(text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .filter((line) => line.length > 0);
  const limited = lines.slice(-60);
  return limited.join("\n");
}

function shellEscape(value) {
  if (/^[a-zA-Z0-9_./:-]+$/.test(value)) {
    return value;
  }
  return `"${String(value).replaceAll("\"", "\\\"")}"`;
}

function commandText(command, args) {
  return [command, ...args].map((item) => shellEscape(item)).join(" ");
}

function runStep(title, command, args, cwd) {
  const startedAt = Date.now();
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    shell: false
  });
  const durationMs = Date.now() - startedAt;
  const statusCode = result.status ?? 1;
  const errorText = result.error
    ? `${result.error.name || "Error"}: ${result.error.message || String(result.error)}`
    : "";
  return {
    title,
    cwd,
    command: commandText(command, args),
    ok: statusCode === 0,
    statusCode,
    durationMs,
    stdout: shortOutput(result.stdout),
    stderr: shortOutput([result.stderr, errorText].filter(Boolean).join("\n"))
  };
}

function verifyPathExistsStep(title, targetPath, cwd, kind = "path") {
  const ok = fs.existsSync(targetPath);
  const stat = ok ? fs.statSync(targetPath) : null;
  const kindOk =
    kind === "directory" ? stat?.isDirectory() : kind === "file" ? stat?.isFile() : ok;
  return {
    title,
    cwd,
    command: `assert ${kind} exists ${shellEscape(targetPath)}`,
    ok: Boolean(kindOk),
    statusCode: kindOk ? 0 : 1,
    durationMs: 0,
    stdout: kindOk ? targetPath : "",
    stderr: kindOk ? "" : `Missing ${kind}: ${targetPath}`
  };
}

function verifyFileContainsStep(title, filePath, patterns, cwd) {
  if (!fs.existsSync(filePath)) {
    return {
      title,
      cwd,
      command: `assert file contains patterns ${shellEscape(filePath)}`,
      ok: false,
      statusCode: 1,
      durationMs: 0,
      stdout: "",
      stderr: `Missing file: ${filePath}`
    };
  }

  const content = fs.readFileSync(filePath, "utf8");
  const missing = patterns.filter((pattern) => !content.includes(pattern));
  return {
    title,
    cwd,
    command: `assert file contains patterns ${shellEscape(filePath)}`,
    ok: missing.length === 0,
    statusCode: missing.length === 0 ? 0 : 1,
    durationMs: 0,
    stdout: missing.length === 0 ? filePath : "",
    stderr: missing.length === 0 ? "" : `Missing patterns: ${missing.join(", ")}`
  };
}

function parseSimpleFrontmatter(markdown) {
  const source = String(markdown || "");
  if (!source.startsWith("---")) {
    return {};
  }
  const lines = source.split(/\r?\n/);
  let endIdx = -1;
  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i].trim() === "---") {
      endIdx = i;
      break;
    }
  }
  if (endIdx === -1) {
    return {};
  }
  const frontmatter = {};
  for (const line of lines.slice(1, endIdx)) {
    const sep = line.indexOf(":");
    if (sep <= 0) {
      continue;
    }
    const key = line.slice(0, sep).trim();
    const value = line.slice(sep + 1).trim().replace(/^['"]|['"]$/g, "");
    frontmatter[key] = value;
  }
  return frontmatter;
}

function findLatestRawLesson(projectDir) {
  const baseDir = path.join(projectDir, ".local", "kfc-lessons");
  const candidates = [];
  for (const type of ["incidents", "decisions"]) {
    const dirPath = path.join(baseDir, type);
    if (!fs.existsSync(dirPath)) {
      continue;
    }
    for (const name of fs.readdirSync(dirPath)) {
      const filePath = path.join(dirPath, name);
      if (!name.toLowerCase().endsWith(".md") || !fs.statSync(filePath).isFile()) {
        continue;
      }
      candidates.push(filePath);
    }
  }
  candidates.sort((left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs);
  return candidates[0] || "";
}

function ensureProjectSeed(projectDir) {
  if (fs.existsSync(projectDir)) {
    if (!fs.statSync(projectDir).isDirectory()) {
      throw new Error(`Project path exists but is not a directory: ${projectDir}`);
    }
    const packageJsonPath = path.join(projectDir, "package.json");
    if (!fs.existsSync(packageJsonPath)) {
      fs.writeFileSync(
        packageJsonPath,
        JSON.stringify(
          {
            name: path.basename(projectDir),
            version: "0.0.0",
            private: true
          },
          null,
          2
        ) + "\n",
        "utf8"
      );
    }
    return;
  }

  fs.mkdirSync(projectDir, { recursive: true });
  fs.writeFileSync(
    path.join(projectDir, "package.json"),
    JSON.stringify(
      {
        name: path.basename(projectDir),
        version: "0.0.0",
        private: true
      },
      null,
      2
    ) + "\n",
    "utf8"
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runServeHealthStep(projectDir, port) {
  const title = "kfc plan serve + health check";
  const npmArgs = ["exec", "--no-install", "--", "kfc", "plan", "serve", "--project", ".", "--port", String(port)];
  const cmd = commandText(NODE, [NPM_CLI, ...npmArgs]);
  const startedAt = Date.now();
  const proc = spawn(NODE, [NPM_CLI, ...npmArgs], {
    cwd: projectDir,
    shell: false,
    stdio: ["ignore", "pipe", "pipe"]
  });

  let stdout = "";
  let stderr = "";
  proc.stdout?.on("data", (chunk) => {
    stdout += String(chunk);
  });
  proc.stderr?.on("data", (chunk) => {
    stderr += String(chunk);
  });

  let healthy = false;
  let healthPayload = "";
  const healthUrl = `http://127.0.0.1:${port}/api/health`;
  const deadline = Date.now() + 15000;

  try {
    while (Date.now() < deadline) {
      if (proc.exitCode !== null) {
        break;
      }
      try {
        const response = await fetch(healthUrl);
        const body = await response.text();
        healthPayload = body;
        if (response.ok && body.includes("\"ok\":true")) {
          healthy = true;
          break;
        }
      } catch {
        // Keep polling until timeout or process exits.
      }
      await sleep(500);
    }
  } finally {
    if (proc.exitCode === null) {
      proc.kill();
      await sleep(250);
      if (proc.exitCode === null) {
        proc.kill("SIGKILL");
      }
    }
  }

  const durationMs = Date.now() - startedAt;
  const output = [shortOutput(stdout), shortOutput(stderr)].filter(Boolean).join("\n");
  const detail = [output, `health_url=${healthUrl}`, `health_payload=${healthPayload || "<none>"}`]
    .filter(Boolean)
    .join("\n");

  return {
    title,
    cwd: projectDir,
    command: cmd,
    ok: healthy,
    statusCode: healthy ? 0 : 1,
    durationMs,
    stdout: shortOutput(detail),
    stderr: ""
  };
}

function toMarkdownReport(meta, steps, createdPlanPath) {
  const rows = steps
    .map((step, idx) => {
      const result = step.ok ? "PASS" : "BLOCK";
      return `| ${idx + 1} | ${step.title} | \`${step.command}\` | ${result} | ${step.durationMs} |`;
    })
    .join("\n");

  const details = steps
    .map((step, idx) => {
      return [
        `### ${idx + 1}. ${step.title}`,
        `- Result: ${step.ok ? "PASS" : "BLOCK"}`,
        `- Exit Code: ${step.statusCode}`,
        `- CWD: \`${step.cwd}\``,
        `- Command: \`${step.command}\``,
        "",
        "```text",
        (step.stdout || "<no stdout>").trim(),
        (step.stderr ? `\n[stderr]\n${step.stderr.trim()}` : "").trim(),
        "```",
        ""
      ].join("\n");
    })
    .join("\n");

  return [
    "# Portability Smoke Log",
    "",
    "## Metadata",
    `- Date (UTC): ${meta.timestampUtc}`,
    `- Tool Repo: \`${meta.toolRepo}\``,
    `- Target Project: \`${meta.projectDir}\``,
    `- Link Mode: ${meta.linkMode ? "on" : "off"}`,
    `- Result: ${meta.result}`,
    createdPlanPath ? `- Created Plan: \`${createdPlanPath}\`` : "- Created Plan: <not detected>",
    "",
    "## Step Results",
    "| # | Step | Command | Result | Duration (ms) |",
    "|---|------|---------|--------|---------------|",
    rows,
    "",
    "## Detailed Output",
    details,
    "## Notes",
    "- Use this log as evidence for portability validation in one external project.",
    "- If result is BLOCK, rerun after fixing the first failing step."
  ].join("\n");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.project) {
    printUsage();
    process.exit(1);
  }

  if (!Number.isInteger(args.port) || args.port <= 0 || args.port > 65535) {
    throw new Error("Invalid --port value. Provide an integer between 1 and 65535.");
  }

  const projectDir = path.resolve(process.cwd(), args.project);
  ensureProjectSeed(projectDir);

  const token = timestampToken();
  const defaultOut = path.join(
    ROOT_DIR,
    "artifacts",
    "portability",
    `${token}-${path.basename(projectDir)}.md`
  );
  const outPath = args.out ? path.resolve(process.cwd(), args.out) : defaultOut;
  const steps = [];

  console.log(`[portability] Target project: ${projectDir}`);
  console.log(`[portability] Link mode: ${args.link ? "on" : "off"}`);
  console.log(`[portability] Step mode: ${args.legacySteps ? "legacy" : "baseline-client-force"}`);

  if (args.link) {
    steps.push(runStep("npm link (tool repo)", NODE, [NPM_CLI, "link"], ROOT_DIR));
    if (!steps.at(-1).ok) {
      return finalize(steps, outPath, projectDir, args.link);
    }
    steps.push(
      runStep(`npm link ${PACKAGE_NAME} (target)`, NODE, [NPM_CLI, "link", PACKAGE_NAME], projectDir)
    );
    if (!steps.at(-1).ok) {
      return finalize(steps, outPath, projectDir, args.link);
    }
  }

  steps.push(
    runStep("kfc help", NODE, [NPM_CLI, "exec", "--no-install", "--", "kfc", "--help"], projectDir)
  );
  if (!steps.at(-1).ok) {
    return finalize(steps, outPath, projectDir, args.link);
  }

  if (!args.legacySteps) {
    steps.push(
      runStep(
        "kfc client --force --no-launch-codex",
        NODE,
        [
          NPM_CLI,
          "exec",
          "--no-install",
          "--",
          "kfc",
          "client",
          "--force",
          "--no-launch-codex",
          "--project",
          ".",
          "--port",
          String(args.port)
        ],
        projectDir
      )
    );
    if (steps.at(-1).ok) {
      if (args.link) {
        steps.push(
          runStep(
            "kfc client update preview",
            NODE,
            [NPM_CLI, "exec", "--no-install", "--", "kfc", "client", "update", "--project", "."],
            projectDir
          )
        );
        if (steps.at(-1).ok) {
          steps.push(
            runStep(
              "kfc client update --apply",
              NODE,
              [
                NPM_CLI,
                "exec",
                "--no-install",
                "--",
                "kfc",
                "client",
                "update",
                "--project",
                ".",
                "--apply",
                "--skip-serve-check"
              ],
              projectDir
            )
          );
        }
      }
      steps.push(
        verifyPathExistsStep(
          "verify project-local kamiflow-core skill",
          path.join(projectDir, ".agents", "skills", "kamiflow-core", "SKILL.md"),
          projectDir,
          "file"
        )
      );
      steps.push(
        verifyPathExistsStep(
          "verify client lessons file",
          path.join(projectDir, ".kfc", "LESSONS.md"),
          projectDir,
          "file"
        )
      );
      steps.push(
        verifyPathExistsStep(
          "verify raw lesson incidents directory",
          path.join(projectDir, ".local", "kfc-lessons", "incidents"),
          projectDir,
          "directory"
        )
      );
      steps.push(
        verifyPathExistsStep(
          "verify raw lesson decisions directory",
          path.join(projectDir, ".local", "kfc-lessons", "decisions"),
          projectDir,
          "directory"
        )
      );
      steps.push(
        verifyFileContainsStep(
          "verify private gitignore entries",
          path.join(projectDir, ".gitignore"),
          [".kfc/", ".local/", ".agents/"],
          projectDir
        )
      );
      steps.push(
        runStep(
          "kfc client lessons capture",
          NODE,
          [
            NPM_CLI,
            "exec",
            "--no-install",
            "--",
            "kfc",
            "client",
            "lessons",
            "capture",
            "--project",
            ".",
            "--type",
            "incident",
            "--title",
            "Bootstrap lesson",
            "--lesson",
            "Use client bootstrap before custom setup.",
            "--context",
            "Portability smoke"
          ],
          projectDir
        )
      );
      if (steps.at(-1).ok) {
        const rawLessonPath = findLatestRawLesson(projectDir);
        steps.push(
          verifyPathExistsStep("verify captured raw lesson file", rawLessonPath, projectDir, "file")
        );
        if (steps.at(-1).ok) {
          const lessonFrontmatter = parseSimpleFrontmatter(fs.readFileSync(rawLessonPath, "utf8"));
          const lessonId = String(lessonFrontmatter.lesson_id || "").trim();
          if (!lessonId) {
            steps.push({
              title: "resolve captured lesson id",
              cwd: projectDir,
              command: `read lesson_id ${shellEscape(rawLessonPath)}`,
              ok: false,
              statusCode: 1,
              durationMs: 0,
              stdout: "",
              stderr: `Missing lesson_id in ${rawLessonPath}`
            });
          } else {
            steps.push(
              runStep(
                "kfc client lessons pending",
                NODE,
                [
                  NPM_CLI,
                  "exec",
                  "--no-install",
                  "--",
                  "kfc",
                  "client",
                  "lessons",
                  "pending",
                  "--project",
                  "."
                ],
                projectDir
              )
            );
            steps.push(
              runStep(
                "kfc client lessons show",
                NODE,
                [
                  NPM_CLI,
                  "exec",
                  "--no-install",
                  "--",
                  "kfc",
                  "client",
                  "lessons",
                  "show",
                  "--project",
                  ".",
                  "--id",
                  lessonId
                ],
                projectDir
              )
            );
            steps.push(
              runStep(
                "kfc client lessons promote",
                NODE,
                [
                  NPM_CLI,
                  "exec",
                  "--no-install",
                  "--",
                  "kfc",
                  "client",
                  "lessons",
                  "promote",
                  "--project",
                  ".",
                  "--id",
                  lessonId,
                  "--summary",
                  "Run KFC client bootstrap before adding manual project setup."
                ],
                projectDir
              )
            );
            steps.push(
              runStep(
                "kfc client lessons list",
                NODE,
                [
                  NPM_CLI,
                  "exec",
                  "--no-install",
                  "--",
                  "kfc",
                  "client",
                  "lessons",
                  "list",
                  "--project",
                  "."
                ],
                projectDir
              )
            );
            steps.push(
              verifyFileContainsStep(
                "verify curated lessons content",
                path.join(projectDir, ".kfc", "LESSONS.md"),
                [lessonId, "Run KFC client bootstrap before adding manual project setup."],
                projectDir
              )
            );
          }
        }
      }
    }
    return finalize(steps, outPath, projectDir, args.link);
  }

  steps.push(
    runStep(
      "kfc plan init --new",
      NODE,
      [NPM_CLI, "exec", "--no-install", "--", "kfc", "plan", "init", "--project", ".", "--new"],
      projectDir
    )
  );
  if (!steps.at(-1).ok) {
    return finalize(steps, outPath, projectDir, args.link);
  }

  steps.push(
    runStep(
      "kfc plan validate",
      NODE,
      [NPM_CLI, "exec", "--no-install", "--", "kfc", "plan", "validate", "--project", "."],
      projectDir
    )
  );
  if (!steps.at(-1).ok) {
    return finalize(steps, outPath, projectDir, args.link);
  }

  steps.push(await runServeHealthStep(projectDir, args.port));
  return finalize(steps, outPath, projectDir, args.link);
}

function finalize(steps, outPath, projectDir, linkMode) {
  const outputBlob = steps.map((step) => `${step.stdout || ""}\n${step.stderr || ""}`).join("\n");
  const jsonPlanPathMatch = outputBlob.match(/"plan_path"\s*:\s*"([^"]+)"/);
  const createdTemplateMatch = outputBlob.match(/\[kfp\] Created template:\s*(.+)/);
  const createdPlanPath = (jsonPlanPathMatch?.[1] || createdTemplateMatch?.[1] || "").trim();
  const result = steps.every((step) => step.ok) ? "PASS" : "BLOCK";
  const report = toMarkdownReport(
    {
      timestampUtc: new Date().toISOString(),
      toolRepo: ROOT_DIR,
      projectDir,
      linkMode,
      result
    },
    steps,
    createdPlanPath
  );

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, report, "utf8");
  console.log(`[portability] Result: ${result}`);
  console.log(`[portability] Report: ${outPath}`);

  if (result !== "PASS") {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(`[portability] Error: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
