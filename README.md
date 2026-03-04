# Kami Flow CLI

This repository is the KFC CLI source plus dogfooding workspace.

## Start Here

- [QUICKSTART.md](./QUICKSTART.md)
- [CLIENT_KICKOFF_PROMPT.md](./CLIENT_KICKOFF_PROMPT.md)
- [resources/docs/QUICKSTART.md](./resources/docs/QUICKSTART.md) (SSOT)
- [resources/docs/CLIENT_KICKOFF_PROMPT.md](./resources/docs/CLIENT_KICKOFF_PROMPT.md) (SSOT)

## What Is In Scope

- Build and evolve the publishable CLI package.
- Dogfood the package in local fixtures.
- Keep `resources/` as SSOT for portable Codex assets.

## Structure

- `bin/`: CLI executable entrypoint.
- `src/`: command and runtime source.
- `dogfood/`: in-repo consumer fixtures.
- `scripts/`: maintainer automation.
- `resources/`: SSOT docs/rules/skills.

## CLI Commands

- `kfc init`
- `kfc doctor`
- `kfc plan init|serve|validate`
- `kfc flow ensure-plan|ready|apply|next`
- `kfc client` (default client setup + Codex-ready handoff)
- `kfc client done` (cleanup)
- `kfc client bootstrap|doctor [--fix]` (advanced/manual)
- `kfc run` (auto-runs `flow ensure-plan`, then `flow ready`)
- `kf` is an alias for `kfc`

Global option: `--cwd <path>`

## Command Boundary

### Run in KFC Repo

Use `npm run ...` for maintainer and dogfooding workflows.

### Run in Client Project

Use `kfc ...` (or `npx --no-install kfc ...`).
Do not run this repo's `npm run ...` scripts in client projects.

## Setup

### Run in KFC Repo

```bash
npm install
npm run bootstrap
```

If you need fixture dogfooding:

```bash
npm run dogfood:link
npm run dogfood:smoke
```

If you need client linking, prepare the package from this repo:

```bash
npm run link:self
```

Maintainer convenience:

```bash
npm run client:link-bootstrap -- --project <path-to-client-project>
```

### Run in Client Project

```bash
npm link @kamishino/kamiflow-codex
kfc client
```

Then tell Codex:

- Read `.kfc/CODEX_READY.md` and execute the mission.
- Run routine `kfc ...` flow commands autonomously (no user reminder loop).

After Codex finishes:

```bash
kfc client done
```

## Versioning (No Publish)

### Run in KFC Repo

- SemVer release bump workflow: `resources/docs/VERSIONING_RUNBOOK.md`
- Useful commands:

```bash
npm run version:next
npm run release:plan
npm run release:cut -- --bump <major|minor|patch>
npm run pack:commit
```

## Clean Commits

### Run in KFC Repo

- Commit flow: `resources/docs/CODEX_COMMIT_FLOW.md`
- Hooks:

```bash
npm run hooks:enable
npm run hooks:check
```

- Codex-safe commit helper:

```bash
npm run commit:codex -- --message "type(scope): summary"
```

## Portability Smoke

### Run in KFC Repo

```bash
npm run portability:smoke -- --project <path-to-external-repo> --link
```

See `resources/docs/PORTABILITY_RUNBOOK.md`.

## Docs Index

- `resources/docs/QUICKSTART.md`
- `resources/docs/CLIENT_KICKOFF_PROMPT.md`
- `resources/docs/CLIENT_A2Z_PLAYBOOK.md`
- `resources/docs/COMMAND_BOUNDARY_POLICY.md`
- `resources/docs/CODEX_KFP_RUNBOOK.md`
- `resources/docs/CODEX_RULES_RUNBOOK.md`
- `resources/docs/CODEX_ANTI_PATTERNS.md`
- `resources/docs/CODEX_INCIDENT_LEDGER.md`
- `resources/docs/PLAN_CONTRACT_V1.md`
- `resources/docs/ROUTE_PROMPTS.md`
- `resources/docs/CONTRIBUTOR_BOOTSTRAP.md`
- `resources/docs/CODEX_COMMIT_FLOW.md`
- `resources/docs/VERSIONING_RUNBOOK.md`
- `resources/docs/PORTABILITY_RUNBOOK.md`

## `.codex` Policy

Commit templates and structure:

- `.codex/config.example.toml`

Keep local/private runtime config untracked:

- `.codex/config.toml`

Skills policy:

- Keep SSOT in `resources/skills`.
- Treat `.agents/skills` as generated runtime output.

Rules policy:

- Keep SSOT in `resources/rules/base.rules` and `resources/rules/profiles/*.rules`.
- Treat `.codex/rules/kamiflow.rules` as generated runtime output.
- Keep `.codex/rules/default.rules` for Codex-managed approvals; do not overwrite it from SSOT.
