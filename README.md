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
- `resources/`: future reusable Codex assets (still placeholders).

## CLI Commands

- `kamiflow init`
- `kamiflow doctor`
- `kamiflow run`

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
