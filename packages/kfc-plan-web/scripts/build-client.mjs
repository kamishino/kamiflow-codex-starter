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
const libSourceDir = path.join(packageDir, "src", "lib");
const sourceStyles = path.join(packageDir, "src", "server", "public", "styles.css");
const sourceViewsDir = path.join(packageDir, "src", "server", "views");

const distPublicDir = path.join(packageDir, "dist", "server", "public");
const distViewsDir = path.join(packageDir, "dist", "server", "views");
const distClientDir = path.join(distPublicDir, "client");
const distLibDir = path.join(distPublicDir, "lib");
const distVendorDir = path.join(distPublicDir, "vendor");
const distWebUiDir = path.join(distVendorDir, "kfc-web-ui");
const distLucideDir = path.join(distVendorDir, "lucide-preact");
const distClientFile = path.join(distPublicDir, "app.js");
const distStylesFile = path.join(distPublicDir, "styles.css");

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function removePathRobust(targetPath) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      await fs.rm(targetPath, { recursive: true, force: true });
      return;
    } catch (err) {
      if (attempt === 7) {
        throw err;
      }
      await new Promise((resolve) => setTimeout(resolve, 25 * (attempt + 1)));
    }
  }
}

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

async function transpileTree(sourceDir, destinationDir) {
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

async function copyVendorTree(fromRelativeDir, toRelativeDir) {
  const sourceDir = path.join(repoRoot, "node_modules", ...fromRelativeDir.split("/"));
  const destinationDir = path.join(distVendorDir, toRelativeDir);
  await fs.mkdir(path.dirname(destinationDir), { recursive: true });
  await fs.cp(sourceDir, destinationDir, { recursive: true });
}

async function assertFileExists(filePath) {
  try {
    await fs.access(filePath);
  } catch {
    throw new Error(`[kfc-plan] Missing expected build output: ${filePath}`);
  }
}

await ensureDir(distPublicDir);
await ensureDir(distViewsDir);
await ensureDir(distVendorDir);

await removePathRobust(distClientDir);
await removePathRobust(distLibDir);
await removePathRobust(distWebUiDir);

await transpileTree(clientSourceDir, distClientDir);
await transpileTree(libSourceDir, distLibDir);
await transpileTree(path.join(webUiDir, "src"), distWebUiDir);

await copyVendorFile("preact/dist/preact.mjs", "preact.mjs");
await copyVendorFile("preact/hooks/dist/hooks.mjs", "preact-hooks.mjs");
await copyVendorFile("preact/jsx-runtime/dist/jsxRuntime.mjs", "preact-jsx-runtime.mjs");
await copyVendorFile("@preact/signals/dist/signals.mjs", "preact-signals.mjs");
await copyVendorFile("@preact/signals-core/dist/signals-core.mjs", "preact-signals-core.mjs");
await copyVendorTree("lucide-preact/dist/esm", "lucide-preact");

await fs.writeFile(distClientFile, 'import "./client/main.js";\n', "utf8");
await fs.copyFile(sourceStyles, distStylesFile);
await fs.cp(sourceViewsDir, distViewsDir, { recursive: true });

await assertFileExists(path.join(distClientDir, "main.js"));
await assertFileExists(path.join(distLibDir, "plan-diagram.js"));
await assertFileExists(path.join(distWebUiDir, "index.js"));
await assertFileExists(path.join(distLucideDir, "lucide-preact.js"));

console.log(`[kfc-plan] Built browser modules: ${distClientDir}`);
console.log(`[kfc-plan] Built shared browser lib modules: ${distLibDir}`);
console.log(`[kfc-plan] Wrote entry module: ${distClientFile}`);
console.log(`[kfc-plan] Copied stylesheet: ${distStylesFile}`);
console.log(`[kfc-plan] Synced views: ${distViewsDir}`);
