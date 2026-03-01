# Kami Flow CLI

This repository is the CLI source and the dogfooding environment.

## What Is In Scope

- Build and evolve the publishable CLI package.
- Dogfood the package in local in-repo fixtures.
- Keep `resources/` as a portable placeholder layer for future Codex skills/prompts.

## Structure

- `bin/`: CLI executable entrypoint.
- `src/`: command and runtime source.
- `dogfood/`: in-repo consumer fixtures.
- `scripts/dogfood/`: link/unlink/smoke automation.
- `.codex/`: in-repo Codex dogfood setup (prompts/skills/config templates).
- `scripts/codex/`: local setup and sync utilities for `.codex/`.
- `resources/`: future reusable Codex assets (still placeholders).

## CLI Commands

- `kfc init`
- `kfc doctor`
- `kfc run`
- `kf` is an optional shorthand alias for `kfc`

Global option:

- `--cwd <path>`

## Local Workflow

1. Link package:
```bash
npm run dogfood:link
```
2. Run fixture smoke:
```bash
npm run dogfood:smoke
```
3. Validate publish-like install:
```bash
npm run dogfood:pack-smoke
```

To clean link state:

```bash
npm run dogfood:unlink
```

## In-Repo Codex Dogfooding

Create local `.codex/config.toml` from the committed example:

```bash
npm run codex:setup
```

Sync `resources/prompts` and `resources/skills` into `.codex/`:

```bash
npm run codex:sync
```

## `.codex` Policy

- Commit templates and structure:
  - `.codex/config.example.toml`
  - `.codex/prompts/`
  - `.codex/skills/`
- Keep local/private runtime config untracked:
  - `.codex/config.toml`
- Keep human-facing documentation in `resources/` (SSOT), not in `.codex/`.
