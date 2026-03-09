import path from "node:path";
import { pathToFileURL } from "node:url";

export async function loadBuiltInFeatureImplementations(repoRoot) {
  const [planModule, sessionModule, chatModule] = await Promise.all([
    import(pathToFileURL(path.join(repoRoot, "packages", "kfc-plan-web", "dist", "server", "create-server.js")).href),
    import(pathToFileURL(path.join(repoRoot, "packages", "kfc-session", "dist", "server", "create-server.js")).href),
    import(pathToFileURL(path.join(repoRoot, "packages", "kfc-chat", "dist", "server", "create-server.js")).href)
  ]);

  return {
    plan: planModule.registerKfcPlanFeature,
    session: sessionModule.registerKfcSessionFeature,
    chat: chatModule.registerKfcChatFeature
  };
}
