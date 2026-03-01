import { resolveProjectDir } from "../lib/paths.js";

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

export async function runServe(args) {
  const projectDir = resolveProjectDir(args);
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

  const server = await createServer({ projectDir, withWatcher: true });
  await server.listen({ host, port });

  console.log(`[kfp] Server running at http://${host}:${port}`);
  console.log(`[kfp] Project: ${projectDir}`);

  const shutdown = async () => {
    await server.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  return 0;
}
