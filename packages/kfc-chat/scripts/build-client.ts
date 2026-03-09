import path from "node:path";
import { pathToFileURL } from "node:url";

const packageDir = process.cwd();
const repoRoot = path.resolve(packageDir, "..", "..");
const { runBrowserBuild } = await import(
  pathToFileURL(path.resolve(packageDir, "../kfc-web-runtime/dist/build-client.js")).href
);

await runBrowserBuild({
  packageDir,
  packageLabel: "kfc-chat",
  repoRoot,
  transpileDirs: [
    { from: "src/client", to: "client" },
    { from: "../../packages/kfc-web-ui/src", to: "vendor/kfc-web-ui" }
  ],
  vendorFiles: [
    { from: "preact/dist/preact.mjs", toFileName: "preact.mjs" },
    { from: "preact/jsx-runtime/dist/jsxRuntime.mjs", toFileName: "preact-jsx-runtime.mjs" },
    { from: "@preact/signals/dist/signals.mjs", toFileName: "preact-signals.mjs" },
    { from: "@preact/signals-core/dist/signals-core.mjs", toFileName: "preact-signals-core.mjs" }
  ],
  writeEntries: [{ to: "kfc-chat.js", contents: 'import "./client/main.js";\n' }],
  copyFiles: [{ from: "src/server/public/styles.css", to: "kfc-chat.css" }],
  syncViewsFrom: "src/server/views",
  logs: [
    { label: "Built browser modules", path: "client" },
    { label: "Wrote entry module", path: "kfc-chat.js" },
    { label: "Copied stylesheet", path: "kfc-chat.css" }
  ]
});
