# src

## Purpose

Primary CLI runtime implementation for the repository.

## Structure

- `commands/`: command entrypoints and CLI behavior.
- `lib/`: shared runtime helpers used by command modules.
- `cli.ts`: CLI bootstrap and wiring.

## Convention

- Keep CLI and runtime logic here, not long-lived build tooling.
- Share cross-cutting helpers via `packages/kfc-runtime` when appropriate.
