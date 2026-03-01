# Kami Flow CLI

This repository is the CLI source and the dogfooding environment.

## What Is In Scope

- Build and evolve the publishable CLI package.
- Dogfood the package in local in-repo fixtures.
- Keep `resources/` as SSOT for portable Codex skills content.

## Structure

- `bin/`: CLI executable entrypoint.
- `src/`: command and runtime source.
- `dogfood/`: in-repo consumer fixtures.
- `scripts/dogfood/`: link/unlink/smoke automation.
- `.codex/`: local Codex config templates.
- `.agents/`: generated runtime skills for repo-level dogfooding.
- `scripts/codex/`: local setup and sync utilities.
- `resources/`: SSOT reusable Codex assets.

## CLI Commands

- `kfc init`
- `kfc doctor`
- `kfc plan init|serve|validate`
- `kfc plan workspace ...`
- `kfc run`
- `kf` is an optional shorthand alias for `kfc`

Global option:

- `--cwd <path>`

Plan command notes:

- `kfc plan` delegates to `kfp` for visual plan workflow.
- It looks for `kfp` in the target project's `node_modules/.bin` first.
- If missing, install it in that project:
  - `npm i -D @kamishino/kamiflow-plan-ui`
- Workspace mode:
  - `kfc plan workspace add <name> --project <path>`
  - `kfc plan serve --workspace <name>`
  - `kfc plan workspace add <name>` auto-detects project root (Git -> package.json -> cwd)
- Automation route (KFP API):
  - `POST /api/plans/:id/automation/apply`
  - `POST /api/projects/:project_id/plans/:id/automation/apply`
- Plan bootstrap:
  - `kfc plan init --project <path> --new` always creates a fresh plan file (`YYYY-MM-DD-00x-new-plan.md`).

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

Sync `resources/skills` into `.agents/skills` runtime:

```bash
npm run codex:sync
```

KFP local loop (client-facing via `kfc`):

```bash
kfc plan init --project .
kfc plan validate --project .
kfc plan serve --project . --port 4310
```

KFP UI includes a workflow command center with Codex action buttons (`plan|build|check|fix`) and live activity updates.

Internal package scripts still exist for repo maintenance:

```bash
npm run plan-ui:init
npm run plan-ui:validate
npm run plan-ui:serve
```

Then use `kamiflow-core` routes against `.local/plans/*.md`.
These scripts target the invoking directory first (`INIT_CWD`), and you can override with `KAMIFLOW_PROJECT_DIR`.
See:

- `resources/docs/PLAN_CONTRACT_V1.md`
- `resources/docs/CODEX_KFP_RUNBOOK.md`
- `resources/docs/ROUTE_PROMPTS.md`

## `.codex` Policy

Commit templates and structure:

- `.codex/config.example.toml`

Keep local/private runtime config untracked:

- `.codex/config.toml`

Skill policy:

- Keep SSOT in `resources/skills`.
- Treat `.agents/skills` as generated runtime output.
