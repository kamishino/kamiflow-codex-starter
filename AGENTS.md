# Agent Instructions

This repository has two active scopes:

1. CLI product development in `src/` and `bin/`.
2. Dogfooding in `dogfood/` using linked or packed installs.
3. In-repo Codex dogfooding in `.codex/`.

`resources/` remains a portable template area.

## Boundaries

- Do not implement real Codex skills/prompts in `resources/` yet.
- Keep active local Codex behavior under `.codex/`.
- Treat `resources/` as SSOT for human-facing docs and templates.
- Never commit private/secrets-bearing `.codex` runtime config.
- Do not import `src/*` directly from dogfood fixtures.
- Dogfood fixtures must consume the CLI as users do (`npm link` or tarball install).

## Safety

- Do not run destructive git commands unless explicitly requested.
- Do not revert unrelated user changes.
