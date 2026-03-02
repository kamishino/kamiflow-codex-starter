# Kami Flow CLI

This repository is the CLI source and the dogfooding environment.

## What Is In Scope

- Build and evolve the publishable CLI package.
- Dogfood the package in local in-repo fixtures.
- Keep `resources/` as SSOT for portable Codex skills and rules content.

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
- `kfc flow ensure-plan|apply|next`
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

Flow command notes:

- `kfc flow ensure-plan` resolves or auto-creates a plan file.
- `kfc flow apply` persists route phase updates (plan/build/check) into the plan record.
- `kfc flow next --style narrative` prints the human next action plus machine next command/mode.

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

## Portability Smoke (One External Repo)

Run a baseline portability validation against another project:

```bash
npm run portability:smoke -- --project <path-to-external-repo> --link
```

This writes a markdown report to `artifacts/portability/`.
See `resources/docs/PORTABILITY_RUNBOOK.md` for the full flow and criteria.

## In-Repo Codex Dogfooding

Create local `.codex/config.toml` from the committed example:

```bash
npm run codex:setup
```

Sync SSOT assets:

```bash
npm run codex:sync
```

By default, `codex:sync` syncs skills plus rules for `repo`, `project` (cwd fallback), and `home` scopes.
If home scope requires elevated access in your environment, use scoped rules sync commands.

Scope examples:

```bash
# Rules only, repo scope
npm run codex:sync:rules -- --scope repo --force

# Rules only, project scope (explicit path)
npm run codex:sync:rules -- --scope project --project <path-to-project> --force

# Rules only, project scope (current working directory fallback)
npm run codex:sync:rules -- --scope project --force

# Rules only, home scope ($CODEX_HOME or ~/.codex)
npm run codex:sync:rules -- --scope home --force

# Rules profile override
npm run codex:sync:rules -- --scope project --project <path-to-project> --profile dogfood --force
npm run codex:sync:rules -- --scope project --project <path-to-project> --profile client --force
```

KFP local loop (client-facing via `kfc`):

```bash
kfc plan init --project .
kfc plan validate --project .
kfc plan serve --project . --port 4310
```

Deterministic CLI loop (simplified):

```bash
kfc flow ensure-plan --project .
kfc flow apply --project . --plan <plan-id> --route plan --result go
kfc flow next --project . --plan <plan-id> --style narrative
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

Rules policy:

- Keep SSOT in `resources/rules/base.rules` and `resources/rules/profiles/*.rules`.
- Treat `.codex/rules/kamiflow.rules` as generated runtime output.
- Keep `.codex/rules/default.rules` for Codex-managed approvals; do not overwrite it from SSOT.
- Rules profile precedence:
  - `--profile`
  - `kamiflow.config.json` -> `codex.rulesProfile`
  - default `client`
