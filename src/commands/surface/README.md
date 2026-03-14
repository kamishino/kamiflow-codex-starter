# src/commands/surface

## Purpose

Concrete command entrypoints for the `kfc` CLI top-level command surface.

## Members

- `init.ts`: initialize local CLI config.
- `doctor.ts`: environment/config validation.
- `run.ts`: execute one-step/looped run orchestration.
- `plan.ts`: plan lifecycle CLI flow.
- `flow.ts`: flow management CLI commands.
- `client.ts`: project bootstrap/update/diagnostics.
- `session.ts`: local session transfer commands.
- `remote.ts`: remote mirror server workflow.
- `web.ts`: web focus launcher.

## Conventions

- Keep command-level argument parsing and dispatch in this folder.
- Delegate reusable behavior to `src/lib`.
