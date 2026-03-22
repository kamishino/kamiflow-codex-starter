# Portability Validation Runbook

Use this runbook to validate that `kfc` + `kamiflow-core` work outside this dogfood repository.

## Goal

Prove external-repo portability baseline first, then compare a small repo-shape matrix:

- install/link CLI
- run one-command client setup and verify readiness
- confirm plan bootstrap, validation, and health checks work outside this repo
- compare onboarding behavior across blank, existing, partial, and risky repo shapes
- confirm root `AGENTS.md` is present as the stable client contract

## Preconditions

- Node.js 20+
- npm in PATH
- Codex CLI in PATH
- Target repository is writable and uses project-local dependencies
- `@kamishino/kfc-plan-web` is available either in target repo (`devDependency`) or via linked KFC fallback

## Step 1: Link CLI into External Repo

### Run in KFC Repo

From this repo (`kamiflow-codex-starter`):

```bash
./setup.ps1 -Project <path-to-external-repo>
./setup.sh --project <path-to-external-repo>
```

This wrapper flow verifies `node`, `npm`, and `codex`, runs the global link, links KFC into the target repo, executes `kfc client --force --no-launch-codex`, reports the scaffolded artifacts, and points to the first `kfc client status` re-entry.

If you are already inside the client repo and want the first-run package-managed path instead of the repo-root wrapper, use:

```bash
npx --package @kamishino/kamiflow-codex kfc client install
```

That client-folder flow validates `node`, `npm`, and `codex`, attempts to establish bare `kfc` on the machine, ensures a project-local fallback for `npx --no-install`, runs `kfc client --project . --force --no-launch-codex`, reports the scaffolded artifacts, and then points to `kfc client status`.

Low-level fallback only when you need the manual link steps instead of the wrapper or `npx` path:

```bash
npm link
npm link @kamishino/kamiflow-codex
```

If missing, install plan UI package in external repo:

```bash
npm i -D @kamishino/kfc-plan-web
```

## Step 2: Baseline `kfc` Checks (External Repo)

### Run in Client Project

```bash
kfc client status
```

If the wrapper reported that `kfc` is not yet visible in PATH, use the exact PATH fix it printed and then rerun `kfc client status`. Until PATH is fixed, use:

```bash
npx --no-install kfc client status
```

What one-command client setup verifies:

- inline inspection summary (`Inspection Status`, `Repo Shape`, `Apply Mode`, `Planned Changes`)
- valid config (creates if missing)
- plan UI dependency available
- root `AGENTS.md` exists with the KFC managed contract block
- project rules synced to `.codex/rules/kamiflow.rules`
- project-local runtime skill synced to `.agents/skills/kamiflow-core/SKILL.md`
- curated lesson file scaffolded at `.kfc/LESSONS.md`
- raw lesson directories scaffolded under `.local/kfc-lessons/`
- client `.gitignore` contains `.kfc/`, `.local/`, and `.agents/`
- plan exists and validates
- KFC Plan health endpoint responds OK
- Codex auto-launch is intentionally skipped in the smoke so portability checks stay deterministic

When link mode is enabled, the smoke also verifies:

- `kfc client update` preview works in the external repo
- `kfc client update --apply` refreshes the linked client repo without auto-launching Codex

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

## Automation Scripts

### Run in KFC Repo

One external repo:

```bash
npm run portability:smoke -- --project <path-to-external-repo> --link
```

Matrix baseline:

```bash
npm run portability:matrix
```

Legacy granular checks are still available for the one-repo helper:

```bash
npm run portability:smoke -- --project <path-to-external-repo> --link --legacy-steps
```

Outputs markdown log to:

- `artifacts/portability/<timestamp>-<project>.md`
- matrix helper writes `artifacts/portability/matrix-<timestamp>.md`

If executed in a restricted sandbox/CI shell, child-process spawn may be blocked.
In that case, run the same command in a normal local terminal session.

## Exit Criteria

Validation is complete when all are true:

1. `kfc` works in external repo context.
2. `kfc client --force` completes PASS in external repo.
3. inspection output correctly describes the repo shape before bootstrap mutates anything.
4. root `AGENTS.md` exists with the KFC managed block.
5. project-local `kamiflow-core` exists in `.agents/skills/kamiflow-core/SKILL.md`.
6. client lesson scaffold exists in `.kfc/LESSONS.md` and `.local/kfc-lessons/`.
7. plan file is created and validated in external repo.
8. smoke log is captured and reviewable.

Matrix proof is complete when all are true:

1. blank/new repo case passes as `empty_new_repo`.
2. existing Node repo case passes as `needs_minor_fixes`.
3. partial KFC repo case passes without risky mutation behavior.
4. risky repo case blocks before mutation with direct recovery.
5. matrix evidence log is captured and reviewable.

Optional extended criteria:

1. route loop reaches `done`.
2. plan is archived in `.local/plans/done/`.

## Known Limits

- Matrix is local temp-workspace proof, not a substitute for real external client repos.
- No automation orchestration beyond smoke helpers.
- Multi-language and multi-package client matrix remains a future phase.

