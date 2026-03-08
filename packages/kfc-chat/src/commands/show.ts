import { resolveBoundSession } from "../lib/chat-state.js";

export function printBinding(binding: any) {
  console.log(`Plan ID: ${binding.plan_id}`);
  console.log(`Session ID: ${binding.session_id}`);
  console.log(`Session Path: ${binding.session_path}`);
  console.log(`Manual Resume: ${binding.manual_resume_command}`);
}

export async function runShow(parsed: any) {
  const binding: any = await resolveBoundSession(parsed.project, parsed.sessionsRoot);
  if (!binding.bound) {
    console.log(binding.reason);
    return 1;
  }
  printBinding(binding);
  return 0;
}
