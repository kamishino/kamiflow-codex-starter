import { resolveProjectDir } from "../lib/paths.js";
import { loadWorkspaceProjects } from "../lib/workspace-registry.js";

function resolvePort(args) {
  const idx = args.indexOf("--port");
  if (idx === -1) {
    return 4310;
  }
  const value = Number.parseInt(args[idx + 1], 10);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error("Invalid value for --port.");
  }
  return value;
}

function resolveWorkspace(args) {
  const idx = args.indexOf("--workspace");
  if (idx === -1) {
    return null;
  }
  const value = args[idx + 1];
  if (!value) {
    throw new Error("Missing value for --workspace.");
  }
  return value;
}

export async function runServe(args) {
  const workspaceName = resolveWorkspace(args);
  const projectDir = workspaceName ? null : resolveProjectDir(args);
  const port = resolvePort(args);
  const host = "127.0.0.1";

  let createServer;
  try {
    ({ createServer } = await import("../server/create-server.js"));
  } catch (err) {
    if (
      err &&
      typeof err === "object" &&
      (err.code === "ERR_MODULE_NOT_FOUND" || err.code === "MODULE_NOT_FOUND")
    ) {
      console.error("[kfp] ERROR: Missing server dependencies.");
      console.error(
        "[kfp] Run `npm --prefix packages/kamiflow-plan-ui install` and retry `kfp serve`."
      );
      return 1;
    }
    throw err;
  }

  const projects = workspaceName ? await loadWorkspaceProjects(workspaceName) : undefined;
  const server = await createServer({
    projectDir: projectDir ?? undefined,
    projects,
    withWatcher: true,
    workspaceName: workspaceName ?? undefined
  });
  await server.listen({ host, port });

  console.log(`[kfp] Server running at http://${host}:${port}`);
  if (workspaceName) {
    console.log(`[kfp] Workspace: ${workspaceName}`);
    console.log(`[kfp] Projects: ${projects?.length ?? 0}`);
  } else {
    console.log(`[kfp] Project: ${projectDir}`);
  }

  const shutdown = async () => {
    await server.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  return 0;
}
