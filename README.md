# Kami Flow Core

This repository is the source of truth for one standalone Codex skill: `kamiflow-core`.

For Codex to discover that skill inside this repo, the repo also needs a generated runtime install under `.agents/skills/kamiflow-core/`.

## Legacy KFC Line

If you need the pre-pivot KFC repository shape, use:

- branch: `codex/legacy-kfc-main`
- tag: `legacy-kfc-main-2026-03-23`

## Use In This Repo

```bash
npm run skill:sync
npm run skill:doctor
```

`npm run skill:sync` installs the current SSOT skill into this repo's `.agents/skills/kamiflow-core/` runtime path. It keeps this tracked root `AGENTS.md` untouched and creates this repo's dogfood `.local/project.md` only when that runtime file is missing. `npm run skill:doctor` verifies the runtime copy exists, the repo-role-aware contract is present, `.local/plans/` is bootstrapped, and the installed runtime contents still match `resources/skills/kamiflow-core/`.

If Codex is already open in this repo, start a new session or reload the workspace after `npm run skill:sync` so the skill inventory refreshes.

## Install Into Any Codex Project

```bash
npx --package @kamishino/kamiflow-core kamiflow-core install --project .
```

That command copies the canonical skill into `.agents/skills/kamiflow-core/` and bootstraps `.local/plans/` for project-local workflow state.
In a normal client repo it also creates a local-only `AGENTS.md` when one does not already exist, adds that file to `.git/info/exclude` when the target is a git repo, and creates `.local/project.md` as the human-facing project brief when that file does not already exist.

## What Gets Installed

- `.agents/skills/kamiflow-core/SKILL.md`
- `.agents/skills/kamiflow-core/agents/openai.yaml`
- `.agents/skills/kamiflow-core/references/*`
- `.agents/skills/kamiflow-core/scripts/*`
- `.agents/skills/kamiflow-core/assets/*`
- `AGENTS.md` when the target is a client repo and the file is missing
- `.local/project.md`
- `.local/plans/`
- `.local/plans/done/`

The installer does not generate `.kfc/`, `.codex/rules/`, or any repo-specific scaffold. In this source repo, `npm run skill:sync` reuses the tracked root `AGENTS.md` instead of generating a new one.

## First Commands After Install

```bash
node .agents/skills/kamiflow-core/scripts/ensure-plan.mjs --project .
node .agents/skills/kamiflow-core/scripts/ready-check.mjs --project .
```

Read `AGENTS.md` first for repo rules. Keep `.local/project.md` current as the human-facing project brief. The active plan stays in `.local/plans/*.md`. Direct markdown mutation is the normal workflow. The helper scripts are deterministic recovery commands for plan bootstrap, repo-contract repair, project-brief repair, readiness checks, and archive closeout.

## Repo Structure

- `resources/skills/kamiflow-core/`: canonical skill source.
- `bin/`: minimal published binary for `kamiflow-core install`.
- `scripts/`: installer, validator, doctor, and forward-test utilities for the published package and repo-local self-dogfooding.

## Maintainer Commands

```bash
npm run validate
npm run skill:sync
npm run skill:doctor
npm run forward-test
npm run forward-test -- --mode full
npm pack
```

`npm run validate` checks the standalone skill contract without mutating the runtime copy. `npm run skill:sync` refreshes this repo's `.agents/skills/kamiflow-core/` runtime install, preserves the tracked root `AGENTS.md`, and creates the dogfood `.local/project.md` here if it is missing. `npm run skill:doctor` proves whether this repo is Codex-ready or stale and prints the exact recovery command when it is not. `npm run forward-test` is the faster smoke lane and now includes a non-Codex repo-role smoke for client vs source-repo runtime shape. `npm run forward-test -- --mode full` keeps the full serial behavioral suite and takes longer because it launches multiple real `codex exec` sessions against fresh temp projects from a packed tarball. Forward-test artifacts live under `.local/forward-tests/` and now include timing breakdowns. `npm pack` builds the publishable tarball for local smoke tests or release workflows.

## Clean `main` Cutover

Use `npm run cutover:main` as the guarded maintainer dry run for replacing `main` with the standalone skill snapshot. It does not touch `main` by default. It verifies the legacy safety refs, checks for the required full forward-test run id, prints the current local and remote `main` refs, and emits the exact execute command for the later cutover window.

The live cutover remains blocked until `npm run forward-test -- --mode full` passes on the source commit you want to publish. After that, run the exact execute command printed by `npm run cutover:main` with:

- `--full-run-id <run-id>` from the passing full run
- `--expected-local-main <sha>` matching the current local `main`
- `--expected-remote-main <sha>` matching the current `origin/main`

In execute mode, the script reruns `validate`, `skill:sync`, `skill:doctor`, `forward-test`, and a tarball install smoke, then creates the clean root commit on `codex/main-skill-clean`. It only updates local `main` or remote `main` when you pass `--update-local-main` and `--push-main` explicitly.
