import fs from "node:fs/promises";
import path from "node:path";
import ts from "typescript";

export async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

export async function removePathRobust(targetPath) {
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

export function rewriteRelativeImports(code) {
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

export async function walkTypeScriptFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkTypeScriptFiles(fullPath)));
    } else if (/\.(ts|tsx)$/i.test(entry.name)) {
      files.push(fullPath);
    }
  }
  return files;
}

export async function transpileTree(sourceDir, destinationDir) {
  const files = await walkTypeScriptFiles(sourceDir);
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
    await fs.writeFile(outputFile, rewriteRelativeImports(transpiled.outputText), "utf8");
  }
}

export async function copyVendorFile(repoRoot, distVendorDir, fromRelativePath, toFileName) {
  const sourceFile = path.join(repoRoot, "node_modules", ...fromRelativePath.split("/"));
  const destinationFile = path.join(distVendorDir, toFileName);
  await fs.mkdir(path.dirname(destinationFile), { recursive: true });
  await fs.copyFile(sourceFile, destinationFile);
}

export async function copyVendorTree(repoRoot, distVendorDir, fromRelativeDir, toRelativeDir) {
  const sourceDir = path.join(repoRoot, "node_modules", ...fromRelativeDir.split("/"));
  const destinationDir = path.join(distVendorDir, toRelativeDir);
  await fs.mkdir(path.dirname(destinationDir), { recursive: true });
  await removePathRobust(destinationDir);
  await fs.cp(sourceDir, destinationDir, { recursive: true });
}

export async function syncViews(sourceViewsDir, distViewsDir) {
  await ensureDir(distViewsDir);
  await fs.cp(sourceViewsDir, distViewsDir, { recursive: true });
}

export async function assertFileExists(filePath, label = "build output") {
  try {
    await fs.access(filePath);
  } catch {
    throw new Error(`[kfc-web-runtime] Missing expected ${label}: ${filePath}`);
  }
}
