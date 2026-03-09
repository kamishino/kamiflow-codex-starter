import path from "node:path";
import { fileURLToPath } from "node:url";
import { runBrowserBuild } from "../../kfc-web-runtime/src/build-client.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageDir = path.resolve(__dirname, "..");

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
