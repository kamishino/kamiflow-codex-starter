#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { installSkill, printUsage } from "../scripts/install-skill.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const packageJsonPath = path.resolve(here, "..", "package.json");
const packageJson = JSON.parse(await fs.readFile(packageJsonPath, "utf8"));
const [command, ...rest] = process.argv.slice(2);

if (!command || command === "help" || command === "--help" || command === "-h") {
  printUsage();
  process.exit(0);
}

if (command === "--version" || command === "-v") {
  console.log(packageJson.version);
  process.exit(0);
}

if (command === "install") {
  await installSkill(rest);
  process.exit(0);
}

console.error(`Unknown command: ${command}`);
printUsage();
process.exit(1);
