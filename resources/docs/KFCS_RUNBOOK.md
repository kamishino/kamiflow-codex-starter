# KFCS Runbook

KFCS is a separate utility for Codex session management.

Boundary:

- `kfc`: Kami Flow workflow, bootstrap, plan discipline, client automation
- `kfcs`: Codex session browser, import/export, restore helper

## Start

From this repo:

```bash
npm run kfcs:serve
```

Direct package binary:

```bash
kfcs serve
```

By default, KFCS uses:

```text
~/.codex/sessions
```

Override the sessions root when needed:

```bash
kfcs serve --sessions-root D:/transfer/codex-sessions
```

## Core Commands

```bash
kfcs index
kfcs where
kfcs find --id 019caccc-f25d-7151-ad1d-6eab893d714d
kfcs export --id 019caccc-f25d-7151-ad1d-6eab893d714d --to E:/transfer/codex-sessions
kfcs import --from E:/transfer/codex-sessions
kfcs restore --id 019caccc-f25d-7151-ad1d-6eab893d714d
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
