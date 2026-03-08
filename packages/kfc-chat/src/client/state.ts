import { signal } from "@preact/signals";
import type { ChatSessionPayload, TranscriptBlock } from "./types";

export const token = signal("");
export const session = signal<ChatSessionPayload | null>(null);
export const transcript = signal<TranscriptBlock[]>([]);
export const statusLine = signal("Ready.");
export const connected = signal(false);
export const wsRef = signal<WebSocket | null>(null);
