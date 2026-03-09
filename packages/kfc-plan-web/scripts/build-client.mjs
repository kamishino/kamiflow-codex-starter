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
  packageLabel: "kfc-plan",
  repoRoot,
  cleanPublicDir: false,
  removePaths: ["client", "lib", "vendor/kfc-web-ui", "vendor/lucide-preact"],
  transpileDirs: [
    { from: "src/client", to: "client" },
    { from: "src/lib", to: "lib" },
    { from: "../../packages/kfc-web-ui/src", to: "vendor/kfc-web-ui" }
  ],
  vendorFiles: [
    { from: "preact/dist/preact.mjs", toFileName: "preact.mjs" },
    { from: "preact/hooks/dist/hooks.mjs", toFileName: "preact-hooks.mjs" },
    { from: "preact/jsx-runtime/dist/jsxRuntime.mjs", toFileName: "preact-jsx-runtime.mjs" },
    { from: "@preact/signals/dist/signals.mjs", toFileName: "preact-signals.mjs" },
    { from: "@preact/signals-core/dist/signals-core.mjs", toFileName: "preact-signals-core.mjs" }
  ],
  vendorTrees: [{ from: "lucide-preact/dist/esm", toRelativeDir: "lucide-preact" }],
  writeEntries: [{ to: "app.js", contents: 'import "./client/main.js";\n' }],
  copyFiles: [{ from: "src/server/public/styles.css", to: "styles.css" }],
  syncViewsFrom: "src/server/views",
  assertions: [
    { path: "client/main.js", label: "build output" },
    { path: "lib/plan-diagram.js", label: "build output" },
    { path: "vendor/kfc-web-ui/index.js", label: "build output" },
    { path: "vendor/lucide-preact/lucide-preact.js", label: "build output" }
  ],
  logs: [
    { label: "Built browser modules", path: "client" },
    { label: "Built shared browser lib modules", path: "lib" },
    { label: "Wrote entry module", path: "app.js" },
    { label: "Copied stylesheet", path: "styles.css" }
  ]
});
