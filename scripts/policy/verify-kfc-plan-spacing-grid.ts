import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..", "..");
const defaultCssPath = path.join(repoRoot, "packages", "kfc-plan-web", "src", "server", "public", "styles.css");

const SPACING_PROPS = new Set([
  "margin",
  "margin-top",
  "margin-right",
  "margin-bottom",
  "margin-left",
  "padding",
  "padding-top",
  "padding-right",
  "padding-bottom",
  "padding-left",
  "gap",
  "row-gap",
  "column-gap",
  "top",
  "right",
  "bottom",
  "left",
  "inset",
  "inset-block",
  "inset-inline",
  "inset-block-start",
  "inset-block-end",
  "inset-inline-start",
  "inset-inline-end"
]);

function findLineNumber(text, index) {
  let line = 1;
  for (let i = 0; i < index; i += 1) {
    if (text[i] === "\n") {
      line += 1;
    }
  }
  return line;
}

export async function verifyKfpSpacingGrid(cssPath = defaultCssPath) {
  const css = await fs.readFile(cssPath, "utf8");
  const declarationRegex = /([a-z-]+)\s*:\s*([^;]+);/g;
  const violations = [];
  const ignoredValues = new Set(["1px", "2px", "999px"]);

  for (const match of css.matchAll(declarationRegex)) {
    const prop = match[1].toLowerCase();
    if (!SPACING_PROPS.has(prop)) {
      continue;
    }
    const value = match[2];
    for (const pxMatch of value.matchAll(/-?\d+(?:\.\d+)?px/g)) {
      const raw = pxMatch[0];
      if (ignoredValues.has(raw)) {
        continue;
      }
      const number = Number.parseFloat(raw.replace("px", ""));
      if (Number.isNaN(number)) {
        continue;
      }
      if (Math.abs(number) % 4 !== 0) {
        const line = findLineNumber(css, match.index ?? 0);
        violations.push(`${line}: ${prop}: ${value.trim()}`);
      }
    }
  }

  return { violations };
}

const isCliEntry = process.argv[1] ? path.resolve(process.argv[1]) === __filename : false;
if (isCliEntry) {
  const result = await verifyKfpSpacingGrid();
  if (result.violations.length) {
    console.error("[kfc-plan-spacing-grid] FAILED");
    for (const line of result.violations) {
      console.error(" - " + line);
    }
    process.exit(1);
  }
  console.log("[kfc-plan-spacing-grid] OK");
}

