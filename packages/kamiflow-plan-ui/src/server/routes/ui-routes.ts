import fs from "node:fs/promises";
import path from "node:path";
import { renderView } from "../view-render.js";
import { resolvePublicDir } from "../runtime-paths.js";

const PUBLIC_DIR = resolvePublicDir();

async function readPublicFile(fileName: string): Promise<string> {
  const filePath = path.join(PUBLIC_DIR, fileName);
  return await fs.readFile(filePath, "utf8");
}

export function registerUiRoutes(fastify: any): void {
  fastify.get("/assets/app.js", async (_request, reply) => {
    reply.type("application/javascript");
    return await readPublicFile("app.js");
  });

  fastify.get("/assets/styles.css", async (_request, reply) => {
    reply.type("text/css");
    return await readPublicFile("styles.css");
  });

  fastify.get("/", async (_request, reply) => {
    reply.type("text/html");
    return await renderView("index", {
      title: "KamiFlow Plan UI"
    });
  });
}
