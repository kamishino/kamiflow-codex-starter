import fs from "node:fs/promises";
import path from "node:path";
import { resolvePublicDir } from "../runtime-paths.js";
import { renderView } from "../view-render.js";

const PUBLIC_DIR = resolvePublicDir();

async function readPublicFile(fileName: string) {
  return await fs.readFile(path.join(PUBLIC_DIR, fileName), "utf8");
}

export function registerUiRoutes(fastify: any, options: { projectName: string; projectDir: string }) {
  fastify.get("/assets/kfc-chat.js", async (_request: any, reply: any) => {
    reply.type("application/javascript; charset=utf-8");
    return await readPublicFile("kfc-chat.js");
  });

  fastify.get("/assets/kfc-chat.css", async (_request: any, reply: any) => {
    reply.type("text/css; charset=utf-8");
    return await readPublicFile("kfc-chat.css");
  });

  fastify.get("/", async (_request: any, reply: any) => {
    reply.type("text/html; charset=utf-8");
    return await renderView("index", {
      title: "KFC Chat",
      projectName: options.projectName,
      projectDir: options.projectDir
    });
  });
}
