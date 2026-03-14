# src/commands

## Purpose

CLI command handlers and `kfc` command surface implementations, grouped by execution
surface under a dedicated `surface/` folder.

## Typical flow

- `surface/` contains one file per top-level command (`init`, `doctor`, `run`, `plan`, `flow`, `client`, `session`, `remote`, `web`).
- Each handler parses args and delegates to shared helpers in `src/lib`.
