import {
  revealPath as sharedRevealPath,
  resolveRevealTargetPath
} from "@kamishino/kfc-runtime/session-actions";
import { resolveBoundSession } from "../lib/chat-state.js";

export async function runReveal(parsed: any, deps: Record<string, any> = {}) {
  const binding: any = await resolveBoundSession(parsed.project, parsed.sessionsRoot);
  if (!binding.bound) {
    console.log(binding.reason);
    return 1;
  }
  const reveal = resolveRevealTargetPath(binding, parsed.target);
  const revealPath = deps.revealPath || sharedRevealPath;
  await revealPath(reveal.path, { target: reveal.target });
  console.log(`Revealed ${reveal.target}: ${reveal.path}`);
  return 0;
}
