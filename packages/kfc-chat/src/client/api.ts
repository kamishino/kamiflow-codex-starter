import { token } from "./state";
import type { SessionResponse, TranscriptResponse } from "./types";

function rootEl(): HTMLElement | null {
  return document.querySelector<HTMLElement>("#app-root");
}

function apiBase(): string {
  const raw = rootEl()?.dataset.apiBase || "/api/chat";
  return raw.endsWith("/") ? raw.slice(0, -1) : raw;
}

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
  return fetchJson<SessionResponse>(apiBase() + "/session");
}

export function fetchTranscript() {
  return fetchJson<TranscriptResponse>(apiBase() + "/transcript");
}

export function verifyToken() {
  return fetchJson<{ ok: boolean }>(apiBase() + "/token/verify", { method: "POST", body: JSON.stringify({ token: token.value }) });
}

export function bindSession(sessionId: string) {
  return fetchJson<{ ok: boolean; session: SessionResponse }>(apiBase() + "/bind", {
    method: "POST",
    body: JSON.stringify({ session_id: sessionId })
  });
}

export function revealSession(target: "file" | "folder") {
  return fetchJson<{ ok: boolean; target: string; path: string }>(apiBase() + "/reveal", {
    method: "POST",
    body: JSON.stringify({ target })
  });
}
