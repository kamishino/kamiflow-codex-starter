import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageDir = path.resolve(__dirname, "..");
const repoRoot = path.resolve(packageDir, "..", "..");
const webUiDir = path.join(repoRoot, "packages", "kfc-web-ui");

const clientSourceDir = path.join(packageDir, "src", "client");
const sourceStyles = path.join(packageDir, "src", "server", "public", "styles.css");
const sourceViewsDir = path.join(packageDir, "src", "server", "views");

const distPublicDir = path.join(packageDir, "dist", "server", "public");
const distViewsDir = path.join(packageDir, "dist", "server", "views");
const distClientDir = path.join(distPublicDir, "client");
const distVendorDir = path.join(distPublicDir, "vendor");
const distWebUiDir = path.join(distVendorDir, "kfc-web-ui");
const distStylesFile = path.join(distPublicDir, "kfc-chat.css");
const distEntryFile = path.join(distPublicDir, "kfc-chat.js");

function withJsExtension(specifier) {
  if (/\.[a-z0-9]+$/i.test(specifier)) {
    return specifier;
  }
  return `${specifier}.js`;
}

function rewriteImports(code) {
  return code
    .replace(/(from\s*["'])([^"']+)(["'])/g, (_match, before, specifier, after) => {
      if (!specifier.startsWith(".")) {
        return `${before}${specifier}${after}`;
      }
      return `${before}${withJsExtension(specifier)}${after}`;
    })
    .replace(/(import\s*\(\s*["'])([^"']+)(["']\s*\))/g, (_match, before, specifier, after) => {
      if (!specifier.startsWith(".")) {
        return `${before}${specifier}${after}`;
      }
      return `${before}${withJsExtension(specifier)}${after}`;
    });
}

async function walkFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkFiles(fullPath)));
    } else if (/\.(ts|tsx)$/i.test(entry.name)) {
      files.push(fullPath);
    }
  }
  return files;
}

async function transpileTree(sourceDir, destinationDir, options = {}) {
  const files = await walkFiles(sourceDir);
  for (const sourceFile of files) {
    const relativePath = path.relative(sourceDir, sourceFile);
    const outputFile = path.join(destinationDir, relativePath).replace(/\.(ts|tsx)$/i, ".js");
    const sourceText = await fs.readFile(sourceFile, "utf8");
    const transpiled = ts.transpileModule(sourceText, {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2020,
        jsx: ts.JsxEmit.ReactJSX,
        jsxImportSource: "preact",
        importsNotUsedAsValues: ts.ImportsNotUsedAsValues.Remove
      },
      fileName: sourceFile
    });
    await fs.mkdir(path.dirname(outputFile), { recursive: true });
    await fs.writeFile(outputFile, rewriteImports(transpiled.outputText), "utf8");
  }
}

async function copyVendorFile(fromRelativePath, toFileName) {
  const sourceFile = path.join(repoRoot, "node_modules", ...fromRelativePath.split("/"));
  const destinationFile = path.join(distVendorDir, toFileName);
  await fs.mkdir(path.dirname(destinationFile), { recursive: true });
  await fs.copyFile(sourceFile, destinationFile);
}

await fs.rm(distPublicDir, { recursive: true, force: true });
await fs.mkdir(distPublicDir, { recursive: true });
await fs.mkdir(distViewsDir, { recursive: true });

await transpileTree(clientSourceDir, distClientDir);
await transpileTree(path.join(webUiDir, "src"), distWebUiDir);

await copyVendorFile("preact/dist/preact.mjs", "preact.mjs");
await copyVendorFile("preact/jsx-runtime/dist/jsxRuntime.mjs", "preact-jsx-runtime.mjs");
await copyVendorFile("@preact/signals/dist/signals.mjs", "preact-signals.mjs");
await copyVendorFile("@preact/signals-core/dist/signals-core.mjs", "preact-signals-core.mjs");

await fs.writeFile(distEntryFile, 'import "./client/main.js";\n', "utf8");
await fs.copyFile(sourceStyles, distStylesFile);
await fs.cp(sourceViewsDir, distViewsDir, { recursive: true });

console.log(`[kfc-chat] Built browser modules: ${distClientDir}`);
console.log(`[kfc-chat] Wrote entry module: ${distEntryFile}`);
console.log(`[kfc-chat] Copied stylesheet: ${distStylesFile}`);
console.log(`[kfc-chat] Synced views: ${distViewsDir}`);
