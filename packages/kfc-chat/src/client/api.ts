import { token } from "./state";
import type { SessionResponse, TranscriptResponse } from "./types";

async function parseResponse(response: Response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { error: text || "Invalid JSON response." };
  }
}

export async function fetchJson<T>(url: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: token.value ? `Bearer ${token.value}` : "",
      ...(options.headers || {})
    }
  });
  const payload = await parseResponse(response);
  if (!response.ok) {
    throw new Error(payload.error || `Request failed (${response.status})`);
  }
  return payload as T;
}

export function fetchSession() {
  return fetchJson<SessionResponse>("/api/chat/session");
}

export function fetchTranscript() {
  return fetchJson<TranscriptResponse>("/api/chat/transcript");
}

export function verifyToken() {
  return fetchJson<{ ok: boolean }>("/api/chat/token/verify", { method: "POST", body: JSON.stringify({ token: token.value }) });
}

export function bindSession(sessionId: string) {
  return fetchJson<{ ok: boolean; session: SessionResponse }>("/api/chat/bind", {
    method: "POST",
    body: JSON.stringify({ session_id: sessionId })
  });
}

export function revealSession(target: "file" | "folder") {
  return fetchJson<{ ok: boolean; target: string; path: string }>("/api/chat/reveal", {
    method: "POST",
    body: JSON.stringify({ target })
  });
}
