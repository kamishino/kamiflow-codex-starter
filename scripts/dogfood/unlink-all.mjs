import { FIXTURES, ROOT_DIR, fixturePath, readPackageName, run } from "./utils.mjs";

const packageName = readPackageName();

for (const fixture of FIXTURES) {
  const cwd = fixturePath(fixture);
  console.log(`[dogfood] Unlinking ${packageName} from ${fixture}`);
  run("npm", ["unlink", packageName], cwd, true);
}

console.log(`[dogfood] Removing global link for ${packageName}`);
run("npm", ["unlink"], ROOT_DIR, true);

console.log("[dogfood] Unlink complete.");
