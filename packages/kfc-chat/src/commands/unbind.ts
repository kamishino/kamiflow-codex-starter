import { unbindCodexSession } from "../lib/chat-state.js";

export async function runUnbind(parsed: any) {
  const removed = await unbindCodexSession(parsed.project);
  console.log(removed ? "Codex session binding removed." : "No client session file found.");
  return 0;
}
