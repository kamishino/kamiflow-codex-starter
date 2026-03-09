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
- `kfc client` (default client setup + Codex-ready handoff + one smart-recovery cycle)
- `kfc client done` (cleanup)
- `kfc client update|upgrade` (source-aware client-project refresh or reinstall + rebootstrap)
- `kfc client lessons capture|pending|show|promote|list` (private raw lessons + curated client memory)
- `kfc client bootstrap|doctor [--fix]` (advanced/manual)
- `kfc session where|find|copy` (find/copy Codex session files and folders between locations)
- `kfc remote serve|stop|token` (mobile-first remote server for mirrored session + queued prompts)
- `kfc web serve|dev` (hosted KFC web root for `/plan`, `/session`, and `/chat`)
- `kfc-session` (separate web-first Codex session manager utility)
- `kfc-chat` (separate web-first bound Codex session chat utility)
- `kfc run` (guardrails + deterministic route loop with Codex execution and runlog evidence)
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

Test paths:

```bash
# fast default (no live Codex invocation)
npm run test

# explicit integration (live Codex path)
npm run test:integration

# fast + integration
npm run test:full
```

If you want the desktop shell for KFC Plan UI (single window with restore):

```bash
npm run kfc-plan:desktop
```

Canonical hosted KFC shell during development:

```bash
kfc web dev --project .
```

Production-style hosted KFC shell:

```bash
kfc web serve --project .
```

Repo maintainer wrappers still exist as compatibility shims:

```bash
npm run kfc-web:dev -- --project .
npm run kfc-web:serve -- --project .
npm run kfc-plan:serve -- --project .
npm run kfc-session:serve -- --project .
npm run kfc-chat:serve -- --project .
```

If you want the separate Codex session manager utility directly:

```bash
kfc-session serve
```

If you want the separate bound-session chat utility directly:

```bash
kfc-chat serve --project .
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
- Read `.kfc/LESSONS.md` when present for durable project-specific lessons.
- Use the project-local runtime skill at `.agents/skills/kamiflow-core/SKILL.md`.
- Run routine `kfc ...` flow commands autonomously (no user reminder loop).
- Run check validation before final response and report `Check: PASS|BLOCK`.

To store project-specific lessons:

```bash
kfc client lessons capture --project . --type incident --title "Broken setup" --lesson "Use KFC bootstrap first"
kfc client lessons pending --project .
kfc client lessons promote --project . --id LESSON-20260307-001 --summary "Bootstrap KFC before custom setup"
kfc client lessons list --project .
```

Raw lesson history stays private in `.local/kfc-lessons/`. Curated durable memory lives in `.kfc/LESSONS.md`.

After Codex finishes:

```bash
kfc client done
```

To refresh or upgrade KFC inside a client repo:

```bash
kfc client update --project .
kfc client update --project . --apply
```

`update` is preview-first. `upgrade` is an alias.

## Copy Codex Sessions

```bash
# show default local sessions root
kfc session where

# find exact session file by id
kfc session find --id 019caccc-f25d-7151-ad1d-6eab893d714d

# copy exact session file by id into transfer folder
kfc session copy --id 019caccc-f25d-7151-ad1d-6eab893d714d --to E:/transfer/codex-sessions

# copy one day from this machine into a transfer folder
kfc session copy --to E:/transfer/codex-sessions --date 2026-03-04

# on another machine, restore into local Codex sessions
kfc session copy --from E:/transfer/codex-sessions --to ~/.codex/sessions --merge
```

## KFC Session Session Manager

KFC Session is separate from KFC:

- `kfc`: workflow/bootstrap/plan discipline
- `kfc-session`: Codex session browser, import/export, and restore helper

```bash
kfc-session serve
kfc-session index
kfc-session find --id 019caccc-f25d-7151-ad1d-6eab893d714d
kfc-session export --id 019caccc-f25d-7151-ad1d-6eab893d714d --to E:/transfer/codex-sessions
kfc-session import --from E:/transfer/codex-sessions
kfc-session restore --id 019caccc-f25d-7151-ad1d-6eab893d714d
```

Runbook: `resources/docs/KFC_SESSION_RUNBOOK.md`

## KFC Chat

KFC Chat is also separate from KFC:

- `kfc`: workflow/bootstrap/plan discipline
- `kfc-chat`: one bound Codex session per project with guarded browser prompting

```bash
kfc-chat bind --project . --session-id 019caccc-f25d-7151-ad1d-6eab893d714d
kfc-chat bind show --project .
kfc-chat serve --project .
kfc-chat unbind --project .
```

Runbook: `resources/docs/KFC_CHAT_RUNBOOK.md`

## Remote Mobile Surface

```bash
kfc remote serve --project . --host 127.0.0.1 --port 4320
```

Phase 1 is a private mobile web surface for:

- mirrored session state
- transcript viewing
- serialized prompt submission through the workstation

Recommended network model: Tailscale or another private network layer.
Runbook: `resources/docs/REMOTE_RUNBOOK.md`

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
- `resources/docs/CODEX_KFC_PLAN_RUNBOOK.md`
- `resources/docs/CODEX_RULES_RUNBOOK.md`
- `resources/docs/CODEX_ANTI_PATTERNS.md`
- `resources/docs/CODEX_INCIDENT_LEDGER.md`
- `resources/docs/PLAN_CONTRACT_V1.md`
- `resources/docs/ROUTE_PROMPTS.md`
- `resources/docs/CONTRIBUTOR_BOOTSTRAP.md`
- `resources/docs/CODEX_COMMIT_FLOW.md`
- `resources/docs/VERSIONING_RUNBOOK.md`
- `resources/docs/PORTABILITY_RUNBOOK.md`
- `resources/docs/REMOTE_RUNBOOK.md`
- `resources/docs/KFC_CHAT_RUNBOOK.md`
- `resources/docs/KFC_SESSION_RUNBOOK.md`

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

