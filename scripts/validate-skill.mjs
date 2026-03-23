import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import {
  clientRuntimeRequiredFiles,
  collectRelativeFilePaths,
  installMetaRelativePath,
  publishedPackageFiles,
  skillPackagePrefix,
  skillSourceDir as skillRoot,
  sourceOnlyRequiredFiles
} from "./skill-runtime.mjs";

const forbiddenPatterns = [
  { pattern: /\bkfc\b/i, reason: "legacy KFC command reference" },
  { pattern: /\.kfc\b/i, reason: "legacy .kfc runtime dependency" },
  { pattern: /dogfood/i, reason: "dogfood-only language", allowPaths: ["assets/project-brief-dogfood.md", "scripts/lib-plan.mjs"] },
  { pattern: /client\.rules|dogfood\.rules|base\.rules/i, reason: "rules-profile dependency" },
  { pattern: /resources\/docs\//i, reason: "legacy repo-doc reference" },
  { pattern: /setup\.ps1|setup\.sh/i, reason: "legacy bootstrap wrapper reference" }
];

function fail(message) {
  console.error(`VALIDATION FAILED: ${message}`);
  process.exit(1);
}

function parseFrontmatter(markdown) {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) {
    return null;
  }
  const values = {};
  for (const line of match[1].split(/\r?\n/)) {
    const parts = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!parts) {
      continue;
    }
    values[parts[1]] = parts[2].trim();
  }
  return values;
}

const skillMarkdown = await fsp.readFile(path.join(skillRoot, "SKILL.md"), "utf8");
const frontmatter = parseFrontmatter(skillMarkdown);
if (!frontmatter) {
  fail("SKILL.md is missing YAML frontmatter.");
}
if (frontmatter.name !== "kamiflow-core") {
  fail(`SKILL.md name must be kamiflow-core. Received: ${frontmatter.name || "<missing>"}`);
}
if (!frontmatter.description) {
  fail("SKILL.md description is missing.");
}

const openaiYaml = await fsp.readFile(path.join(skillRoot, "agents", "openai.yaml"), "utf8");
for (const requiredSnippet of ["display_name:", "short_description:", "default_prompt:"]) {
  if (!openaiYaml.includes(requiredSnippet)) {
    fail(`agents/openai.yaml is missing ${requiredSnippet}`);
  }
}

if (fs.existsSync(path.join(skillRoot, "templates"))) {
  fail("templates/ should not exist. Use assets/ instead.");
}

const hasSourceOnlyAssets = fs.existsSync(path.join(skillRoot, "assets", "project-brief-dogfood.md"))
  || fs.existsSync(path.join(skillRoot, "assets", "forward-tests", "scenarios.json"));
if (clientRuntimeRequiredFiles.length === 0) {
  fail("package.json files must publish at least one skill runtime file.");
}

const packagedInstallMetaPath = `${skillPackagePrefix}${installMetaRelativePath}`;
if (publishedPackageFiles.includes(packagedInstallMetaPath)) {
  fail("package.json must not publish install-meta.json because it is generated during install.");
}

for (const relativePath of clientRuntimeRequiredFiles) {
  if (!fs.existsSync(path.join(skillRoot, relativePath))) {
    fail(`package.json files references a missing skill runtime file: ${relativePath}`);
  }
}

for (const relativePath of sourceOnlyRequiredFiles) {
  const packagedPath = `${skillPackagePrefix}${relativePath}`;
  if (publishedPackageFiles.includes(packagedPath)) {
    fail(`package.json files must not publish source-only asset: ${relativePath}`);
  }
}

const clientAgents = await fsp.readFile(path.join(skillRoot, "assets", "client-agents.md"), "utf8");
for (const requiredSnippet of ["AGENTS.md", ".local/project.md", ".local/plans/", "## Release Policy", "SemVer Workflow:", "Version Files:", "Pre-1.0 Policy:", "Release History:"]) {
  if (!clientAgents.includes(requiredSnippet)) {
    fail(`assets/client-agents.md must mention ${requiredSnippet}`);
  }
}

const clientProjectBrief = await fsp.readFile(path.join(skillRoot, "assets", "project-brief-client.md"), "utf8");
const projectBriefs = [["client", clientProjectBrief]];
let dogfoodProjectBrief = "";
if (hasSourceOnlyAssets) {
  dogfoodProjectBrief = await fsp.readFile(path.join(skillRoot, "assets", "project-brief-dogfood.md"), "utf8");
  projectBriefs.push(["dogfood", dogfoodProjectBrief]);
}
for (const [label, text] of projectBriefs) {
  for (const heading of ["# Project Brief", "## Product Summary", "## Current Priorities", "## Architecture Guardrails", "## Open Questions", "## Recent Decisions"]) {
    if (!text.includes(heading)) {
      fail(`assets/project-brief-${label}.md is missing heading: ${heading}`);
    }
  }
}
if (!/client repo/i.test(clientProjectBrief)) {
  fail("assets/project-brief-client.md must clearly describe client-repo project memory.");
}
if (hasSourceOnlyAssets) {
  if (!/kamiflow-core/i.test(dogfoodProjectBrief) || !/dogfood/i.test(dogfoodProjectBrief)) {
    fail("assets/project-brief-dogfood.md must clearly describe the kamiflow-core source repo memory.");
  }
}

for (const relativePath of clientRuntimeRequiredFiles) {
  if (!fs.existsSync(path.join(skillRoot, relativePath))) {
    fail(`Missing client runtime file: ${relativePath}`);
  }
}

if (hasSourceOnlyAssets) {
  for (const relativePath of sourceOnlyRequiredFiles) {
    if (!fs.existsSync(path.join(skillRoot, relativePath))) {
      fail(`Missing source-only file: ${relativePath}`);
    }
  }
}

if (hasSourceOnlyAssets) {
  const forwardTestManifest = JSON.parse(await fsp.readFile(path.join(skillRoot, "assets", "forward-tests", "scenarios.json"), "utf8"));
  if (!Array.isArray(forwardTestManifest) || forwardTestManifest.length === 0) {
    fail("assets/forward-tests/scenarios.json must contain at least one scenario.");
  }

  for (const scenario of forwardTestManifest) {
    if (!scenario.name || !scenario.grader) {
      fail("Each forward-test scenario must include name and grader.");
    }
    if (!Array.isArray(scenario.modes) || scenario.modes.length === 0) {
      fail(`Forward-test scenario ${scenario.name} must declare at least one mode.`);
    }
    if (!scenario.modes.every((mode) => mode === "smoke" || mode === "full")) {
      fail(`Forward-test scenario ${scenario.name} has an unsupported mode.`);
    }
    if (!scenario.skipCodex) {
      if (!scenario.promptFile) {
        fail(`Forward-test scenario ${scenario.name} must include promptFile unless skipCodex is true.`);
      }
      const promptPath = path.join(skillRoot, "assets", "forward-tests", scenario.promptFile);
      if (!fs.existsSync(promptPath)) {
        fail(`Forward-test prompt is missing: ${scenario.promptFile}`);
      }
    }
    if (scenario.fixtureDir) {
      const fixturePath = path.join(skillRoot, "assets", "forward-tests", scenario.fixtureDir);
      if (!fs.existsSync(fixturePath)) {
        fail(`Forward-test fixture directory is missing: ${scenario.fixtureDir}`);
      }
    }
    if (scenario.projectBriefFile) {
      const projectBriefPath = path.join(skillRoot, "assets", "forward-tests", scenario.fixtureDir || "", scenario.projectBriefFile);
      if (!fs.existsSync(projectBriefPath)) {
        fail(`Forward-test project brief fixture is missing: ${scenario.projectBriefFile}`);
      }
    }
  }
}

const skillFiles = await collectRelativeFilePaths(skillRoot);
for (const relativePath of skillFiles) {
  const filePath = path.join(skillRoot, relativePath);
  const text = await fsp.readFile(filePath, "utf8");
  for (const check of forbiddenPatterns) {
    const allowed = Array.isArray(check.allowPaths) && check.allowPaths.includes(relativePath);
    if (!allowed && check.pattern.test(text)) {
      fail(`${check.reason} found in ${relativePath}`);
    }
  }
}

console.log("Validation passed: standalone kamiflow-core skill structure is consistent.");
