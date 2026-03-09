import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const __filename = fileURLToPath(import.meta.url);
const packageDir = path.dirname(__filename);
const rootDir = path.resolve(packageDir, "..");

export default defineConfig({
  root: packageDir,
  server: {
    host: "127.0.0.1",
    port: 5174,
    strictPort: true,
    fs: {
      allow: [rootDir]
    }
  },
  build: {
    outDir: path.resolve(packageDir, "dist", "client"),
    emptyOutDir: true,
    manifest: true,
    rollupOptions: {
      input: {
        plan: path.resolve(packageDir, "src", "entries", "plan.ts"),
        session: path.resolve(packageDir, "src", "entries", "session.ts"),
        chat: path.resolve(packageDir, "src", "entries", "chat.ts")
      }
    }
  }
});
