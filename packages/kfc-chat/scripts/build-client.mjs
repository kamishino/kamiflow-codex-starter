import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  runBrowserBuild
} from "../../kfc-web-runtime/dist/build-client.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageDir = path.resolve(__dirname, "..");
const repoRoot = path.resolve(packageDir, "..", "..");

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
