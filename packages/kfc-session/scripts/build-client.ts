import path from "node:path";
import { pathToFileURL } from "node:url";

const packageDir = process.cwd();
const { runBrowserBuild } = await import(
  pathToFileURL(path.resolve(packageDir, "../kfc-web-runtime/dist/build-client.js")).href
);

await runBrowserBuild({
  packageDir,
  packageLabel: "kfc-session",
  transpileDirs: [{ from: "src/client", to: "client" }],
  writeEntries: [{ to: "kfc-session.js", contents: 'import "./client/main.js";\n' }],
  copyFiles: [{ from: "src/server/public/styles.css", to: "kfc-session.css" }],
  syncViewsFrom: "src/server/views",
  logs: [
    { label: "Built browser modules", path: "client" },
    { label: "Wrote entry module", path: "kfc-session.js" },
    { label: "Copied stylesheet", path: "kfc-session.css" }
  ]
});
