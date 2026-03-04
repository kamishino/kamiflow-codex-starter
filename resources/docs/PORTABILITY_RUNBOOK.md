# Portability Validation Runbook (One External Repo)

Use this runbook to validate that `kfc` + `kamiflow-core` work outside this dogfood repository.

## Goal

Prove external-repo portability baseline in an external repository:

- install/link CLI
- bootstrap and verify client project readiness
- confirm plan bootstrap, validation, and health checks work outside this repo

## Preconditions

- Node.js 20+
- npm in PATH
- Codex CLI in PATH
- Target repository is writable and uses project-local dependencies
- `@kamishino/kamiflow-plan-ui` is available either in target repo (`devDependency`) or via linked KFC fallback

## Step 1: Link CLI into External Repo

### Run in KFC Repo

From this repo (`kamiflow-codex-starter`):

```bash
npm link
```

### Run in Client Project

From external repo:

```bash
npm link @kamishino/kamiflow-codex
```

If missing, install plan UI package in external repo:

```bash
npm i -D @kamishino/kamiflow-plan-ui
```

## Step 2: Baseline `kfc` Checks (External Repo)

### Run in Client Project

```bash
npx --no-install kfc --help
npx --no-install kfc client bootstrap --project . --profile client
```

What bootstrap verifies:

- valid config (creates if missing)
- plan UI dependency available
- project rules synced to `.codex/rules/kamiflow.rules`
- plan exists and validates
- KFP health endpoint responds OK

## Step 3 (Optional): Run Canonical Route Loop

Use `kamiflow-core` command flow against the active plan file (reuse-first):

1. `start` for idea framing and `START_CONTEXT`
2. `plan` to produce decision-complete spec (`next_command: build`)
3. `build` for scoped implementation
4. `check` for PASS/BLOCK with acceptance criteria
5. `done` after PASS and archive

This step is optional in the baseline portability smoke and can be run manually per project.

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

### Run in KFC Repo

This repo includes an executable smoke helper:

```bash
npm run portability:smoke -- --project <path-to-external-repo> --link
```

Legacy granular checks are still available:

```bash
npm run portability:smoke -- --project <path-to-external-repo> --link --legacy-steps
```

Outputs markdown log to:

- `artifacts/portability/<timestamp>-<project>.md`

If executed in a restricted sandbox/CI shell, child-process spawn may be blocked.
In that case, run the same command in a normal local terminal session.

## Exit Criteria

Validation is complete when all are true:

1. `kfc` works in external repo context.
2. `kfc client bootstrap` completes PASS in external repo.
3. plan file is created and validated in external repo.
4. smoke log is captured and reviewable.

Optional extended criteria:

1. route loop reaches `done`.
2. plan is archived in `.local/plans/done/`.

## Known Limits

- One external repo only (baseline portability proof).
- No automation orchestration beyond smoke helper script.
- Multi-repo matrix is a future phase.
