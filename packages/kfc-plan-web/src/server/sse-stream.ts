type ClientReply = { raw: { write: (chunk: string) => void } };

interface StreamEvent {
  id: number;
  event: string;
  scope: string;
  data: unknown;
}

function toInt(value: string | undefined): number | null {
  if (!value) {
    return null;
  }
  const n = Number.parseInt(value, 10);
  return Number.isInteger(n) ? n : null;
}

function formatEvent(event: string, data: unknown, id?: number): string {
  const idLine = typeof id === "number" ? `id: ${id}\n` : "";
  return `${idLine}event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export class SSEStream {
  private nextId = 1;
  private readonly buffer: StreamEvent[] = [];
  private readonly clients = new Map<string, Set<ClientReply>>();

  constructor(private readonly bufferSize = 500) {}

  getSubscriberCount(): number {
    let total = 0;
    for (const set of this.clients.values()) {
      total += set.size;
    }
    return total;
  }

  subscribe(scope: string, reply: ClientReply, lastEventIdRaw?: string): void {
    if (!this.clients.has(scope)) {
      this.clients.set(scope, new Set());
    }
    this.clients.get(scope)?.add(reply);

    const lastEventId = toInt(lastEventIdRaw);
    if (lastEventId !== null) {
      const earliest = this.buffer.length > 0 ? this.buffer[0].id : null;
      if (earliest !== null && lastEventId < earliest) {
        this.sendTransient(reply, "resync_required", {
          reason: "replay_buffer_exhausted",
          earliest_event_id: earliest
        });
      } else {
        for (const evt of this.buffer) {
          if (evt.id <= lastEventId) {
            continue;
          }
          if (scope !== "*" && evt.scope !== "*" && evt.scope !== scope) {
            continue;
          }
          reply.raw.write(formatEvent(evt.event, evt.data, evt.id));
        }
      }
    }

    this.sendTransient(reply, "connected", {
      scope,
      connected_at: Date.now()
    });
  }

  unsubscribe(scope: string, reply: ClientReply): void {
    const set = this.clients.get(scope);
    if (!set) {
      return;
    }
    set.delete(reply);
    if (set.size === 0) {
      this.clients.delete(scope);
    }
  }

  publish(event: string, data: unknown, scope = "*"): number {
    const id = this.nextId;
    this.nextId += 1;

    const item: StreamEvent = { id, event, data, scope };
    this.buffer.push(item);
    if (this.buffer.length > this.bufferSize) {
      this.buffer.splice(0, this.buffer.length - this.bufferSize);
    }

    const payload = formatEvent(event, data, id);
    this.broadcast(scope, payload);
    return id;
  }

  sendHeartbeat(): void {
    const payload = formatEvent("heartbeat", { ts: Date.now() });
    this.broadcast("*", payload);
  }

  private sendTransient(reply: ClientReply, event: string, data: unknown): void {
    reply.raw.write(formatEvent(event, data));
  }

  private broadcast(scope: string, payload: string): void {
    const targets = new Set<ClientReply>();

    const globalClients = this.clients.get("*");
    if (globalClients) {
      for (const c of globalClients) {
        targets.add(c);
      }
    }

    if (scope !== "*") {
      const scoped = this.clients.get(scope);
      if (scoped) {
        for (const c of scoped) {
          targets.add(c);
        }
      }
    } else {
      for (const [key, set] of this.clients.entries()) {
        if (key === "*") {
          continue;
        }
        for (const c of set) {
          targets.add(c);
        }
      }
    }

    for (const client of targets) {
      client.raw.write(payload);
    }
  }
}
