import { FIXTURES, ROOT_DIR, fixturePath, readPackageName, run } from "./utils.mjs";

const packageName = readPackageName();

console.log(`[dogfood] Linking package from root: ${ROOT_DIR}`);
run("npm", ["link"], ROOT_DIR);

for (const fixture of FIXTURES) {
  const cwd = fixturePath(fixture);
  console.log(`[dogfood] Linking ${packageName} into ${fixture}`);
  run("npm", ["link", packageName], cwd);
}

console.log("[dogfood] Link complete.");
