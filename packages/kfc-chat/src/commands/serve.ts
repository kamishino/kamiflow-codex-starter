import { createKfcChatServer } from "../server/create-server.js";

export async function runServe(parsed: any) {
  const server = await createKfcChatServer({
    projectDir: parsed.project,
    host: parsed.host,
    port: parsed.port,
    token: parsed.token,
    sessionsRoot: parsed.sessionsRoot
  });
  await server.ready();
  const listener = await server.listen();
  console.log(`KFC Chat listening at ${listener.url}`);
  console.log(`Project: ${parsed.project}`);
  console.log(`Token: ${listener.token}`);
  console.log(`Browser: ${listener.url}/?token=${encodeURIComponent(listener.token)}`);
  return 0;
}
