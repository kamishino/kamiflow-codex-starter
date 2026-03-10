import {
  copyTextToClipboard as sharedCopyTextToClipboard,
  resolveSessionField
} from "@kamishino/kfc-runtime/session-actions";
import { resolveBoundSession } from "../lib/chat-state.js";

export async function runCopy(parsed: any, deps: Record<string, any> = {}) {
  const binding: any = await resolveBoundSession(parsed.project, parsed.sessionsRoot);
  if (!binding.bound) {
    console.log(binding.reason);
    return 1;
  }
  const value = resolveSessionField(binding, parsed.field);
  const copyTextToClipboard = deps.copyTextToClipboard || sharedCopyTextToClipboard;
  await copyTextToClipboard(value);
  console.log(`Copied ${parsed.field}: ${value}`);
  return 0;
}
