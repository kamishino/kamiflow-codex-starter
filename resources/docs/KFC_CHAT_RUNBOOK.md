# KFC Chat Runbook

KFC Chat is a separate utility for one bound Codex session per project.

Boundary:

- `kfc`: Kami Flow workflow, bootstrap, plan discipline, client automation
- `kfc web`: hosted shell that exposes the chat surface at `/chat`
- `kfc-chat`: guarded browser prompting into one existing Codex session

## Start

Canonical hosted KFC path:

```bash
kfc web dev --project .
```

Production-style hosted KFC validation:

```bash
kfc web serve --project .
```

Repo wrapper equivalents:

```bash
npm run kfc-web:dev -- --project .
npm run kfc-web:serve -- --project .
npm run kfc-chat:serve -- --project .
```

Direct package binary:

```bash
kfc-chat serve --project .
```

Use `kfc web` when you want the full hosted KFC shell with navigation across plan/session/chat surfaces.
Use `kfc-chat` directly when the chat utility is the only surface you need.

Bind a Codex session first:

```bash
kfc-chat bind --project . --session-id <SESSION_ID>
```

Show or clear the binding:

```bash
kfc-chat bind show --project .
kfc-chat unbind --project .
```

## Runtime State

- Canonical binding: `.kfc/session.json`
- Auxiliary chat runtime: `.kfc/chat-session.json`
- Mirrored local transcript: `.local/chat/transcript.jsonl`
- Transcript truth: `~/.codex/sessions`

## V1 Scope

V1 supports:

- one active bound Codex session per project
- token-protected browser UI
- WebSocket live updates
- `codex exec resume <SESSION_ID> <prompt>` prompt execution
- mirrored local transcript cache plus Codex session tail hydration
- manual `codex resume <SESSION_ID>` handoff for interactive terminal continuation

V1 does not support:

- creating a new Codex session
- browser terminal proxying
- SQLite
- direct writes into `~/.codex/sessions`
