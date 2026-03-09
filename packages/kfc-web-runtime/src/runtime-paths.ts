import fs from "node:fs";
import path from "node:path";

function firstExisting(paths) {
  for (const entry of paths) {
    if (fs.existsSync(entry)) {
      return entry;
    }
  }
  return paths[0];
}

export function createPackageRuntimePathResolver(packageDir) {
  const normalizedPackageDir = path.resolve(packageDir);
  const distServerDir = path.join(normalizedPackageDir, "dist", "server");
  const sourceServerDir = path.join(normalizedPackageDir, "src", "server");

  return {
    resolvePublicDir() {
      return firstExisting([path.join(distServerDir, "public"), path.join(sourceServerDir, "public")]);
    },
    resolveViewsDir() {
      return firstExisting([path.join(distServerDir, "views"), path.join(sourceServerDir, "views")]);
    }
  };
}
