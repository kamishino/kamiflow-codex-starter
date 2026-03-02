# Portability Validation Runbook (One External Repo)

Use this runbook to validate that `kfc` + `kamiflow-core` work outside this dogfood repository.

## Goal

Prove one full project-scoped flow in an external repository:

- install/link CLI
- create/validate/serve plans
- run route loop (`start -> plan -> build -> check -> done`)
- confirm archive path

## Preconditions

- Node.js 20+
- npm in PATH
- Codex CLI in PATH
- Target repository is writable and uses project-local dependencies
- `@kamishino/kamiflow-plan-ui` is available in target repo (`devDependency`)

## Step 1: Link CLI into External Repo

From this repo (`kamiflow-codex-starter`):

```bash
npm link
```

From external repo:

```bash
npm link @kamishino/kamiflow-codex
```

If missing, install plan UI package in external repo:

```bash
npm i -D @kamishino/kamiflow-plan-ui
```

## Step 2: Baseline `kfc` Checks (External Repo)

```bash
npx --no-install kfc --help
npx --no-install kfc plan init --project . --new
npx --no-install kfc plan validate --project .
```

Serve KFP API/UI and verify health:

```bash
npx --no-install kfc plan serve --project . --port 4310
# in another terminal:
curl http://127.0.0.1:4310/api/health
```

Expected health response:

```json
{ "ok": true }
```

## Step 3: Run Canonical Route Loop

Use `kamiflow-core` command flow against the new plan file:

1. `start` for idea framing and `START_CONTEXT`
2. `plan` to produce decision-complete spec (`next_command: build`)
3. `build` for scoped implementation
4. `check` for PASS/BLOCK with acceptance criteria
5. `done` after PASS and archive

## Step 4: Record Smoke Evidence

Use the template:

- `resources/templates/portability-smoke-log.md`

Minimum evidence:

- command
- expected result
- actual result
- PASS/BLOCK
- blocking reason + recovery (if any)

## Optional Automation Script

This repo includes an executable smoke helper:

```bash
npm run portability:smoke -- --project <path-to-external-repo> --link
```

Outputs markdown log to:

- `artifacts/portability/<timestamp>-<project>.md`

If executed in a restricted sandbox/CI shell, child-process spawn may be blocked.
In that case, run the same command in a normal local terminal session.

## Exit Criteria

Validation is complete when all are true:

1. `kfc` works in external repo context.
2. plan file is created and validated in external repo.
3. KFP server health check passes.
4. route loop reaches `done`.
5. plan is archived in `.local/plans/done/`.
6. smoke log is captured and reviewable.

## Known Limits

- One external repo only (baseline portability proof).
- No automation orchestration beyond smoke helper script.
- Multi-repo matrix is a future phase.
