# packages

## Purpose

Mono-repo workspace packages owned by clear runtime/product boundaries.

## Package roles

- `packages/kfc-runtime/`: shared runtime helpers and runtime contracts.
- `packages/kfc-plan-web/`: KFC Plan web observer/runtime experience.
- `packages/kfc-session/`: session manager utility package.
- `packages/kfc-chat/`: Codex-binded chat utility.
- `packages/kfc-web/`: web-specific command surface integration.
- `packages/kfc-web-ui/`: shared web UI primitives.
- `packages/kfc-plan-desktop/`: desktop shell for KFC Plan.
- `packages/kfc-web-runtime/`: browser runtime and shell helpers.

## Convention

- Keep package-level source in each package’s `src/` and avoid importing package-local logic from `src/`.
- Keep build outputs generated under package-level `dist/` folders.
