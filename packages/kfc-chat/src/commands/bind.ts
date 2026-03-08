import { bindCodexSession } from "../lib/chat-state.js";
import { runShow } from "./show.js";

export async function runBind(parsed: any) {
  if (parsed.action === "show") {
    return await runShow(parsed);
  }
  if (!parsed.sessionId) {
    throw new Error("Missing --session-id for `kfc-chat bind`.");
  }
  const result = await bindCodexSession(parsed.project, parsed.sessionId, parsed.sessionsRoot);
  console.log(`Bound Session: ${result.session_id}`);
  console.log(`Session Path: ${result.session_path}`);
  console.log(`Client Session File: ${result.client_session_path}`);
  console.log(`Manual Resume: ${result.manual_resume_command}`);
  return 0;
}
