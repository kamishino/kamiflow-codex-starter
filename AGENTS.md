# Agent Instructions

This repository has two active scopes:

1. CLI product development in `src/` and `bin/`.
2. Dogfooding in `dogfood/` using linked or packed installs.

`resources/` remains a portable placeholder area until Kami Flow documentation is provided.

## Boundaries

- Do not implement real Codex skills/prompts in `resources/` yet.
- Do not import `src/*` directly from dogfood fixtures.
- Dogfood fixtures must consume the CLI as users do (`npm link` or tarball install).

## Safety

- Do not run destructive git commands unless explicitly requested.
- Do not revert unrelated user changes.
