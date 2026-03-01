# Agent Instructions

This repository has two active scopes:

1. CLI product development in `src/` and `bin/`.
2. Dogfooding in `dogfood/` using linked or packed installs.
3. In-repo Codex skill dogfooding in `.agents/skills` generated from SSOT.

`resources/` is the SSOT area.

## Boundaries

- Keep canonical skill content in `resources/skills`.
- Treat `.agents/skills` as generated runtime output, not manual-edit files.
- Never commit private/secrets-bearing `.codex` runtime config.
- Do not import `src/*` directly from dogfood fixtures.
- Dogfood fixtures must consume the CLI as users do (`npm link` or tarball install).

## Safety

- Do not run destructive git commands unless explicitly requested.
- Do not revert unrelated user changes.
