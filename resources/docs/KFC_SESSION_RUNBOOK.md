# KFC Session Runbook

KFC Session is a separate utility for Codex session management.

Boundary:

- `kfc`: Kami Flow workflow, bootstrap, plan discipline, client automation
- `kfc web`: hosted shell that exposes the session surface at `/session`
- `kfc-session`: Codex session browser, import/export, restore helper

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
npm run kfc-session:serve -- --project .
```

Direct package binary:

```bash
kfc-session serve
```

Use `kfc web` when you want the full hosted KFC shell with navigation across plan/session/chat surfaces.
Use `kfc-session` directly when session management is the only surface you need.

By default, KFC Session uses:

```text
~/.codex/sessions
```

Override the sessions root when needed:

```bash
kfc-session serve --sessions-root <TRANSFER_DIR>/codex-sessions
```

## Core Commands

```bash
kfc-session index
kfc-session where
kfc-session find --id <SESSION_ID>
kfc-session export --id <SESSION_ID> --to <TRANSFER_DIR>/codex-sessions
kfc-session import --from <TRANSFER_DIR>/codex-sessions
kfc-session restore --id <SESSION_ID>
```

## Web UI Scope

V1 supports:

- latest-first session browsing
- search and date filtering
- session detail with transcript tail preview
- export/import helpers
- restore helper that confirms the session is present in the Codex sessions root

V1 does not support:

- destructive delete
- rename or metadata editing
- non-Codex provider formats
- desktop shell packaging

## Safety Notes

- `restore` does not invent a Codex CLI resume command. It confirms the session is present locally and returns the session id/path for manual resume.
- import/export operations are copy-based and non-destructive by default.
