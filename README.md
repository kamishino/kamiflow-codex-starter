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
It also rewrites `.agents/skills/kamiflow-core/install-meta.json` so the runtime stays explicitly marked as the dogfood source-repo sync profile.

If Codex is already open in this repo, start a new session or reload the workspace after `npm run skill:sync` so the skill inventory refreshes.

## Install Into Any Codex Project

```bash
npx --package @kamishino/kamiflow-core kamiflow-core install --project .
```

That command copies the canonical skill into `.agents/skills/kamiflow-core/` and bootstraps `.local/plans/` for project-local workflow state.
In a normal client repo it treats the repo as the default target, writes `.agents/skills/kamiflow-core/install-meta.json`, creates a local-only `AGENTS.md` only when one does not already exist, adds that generated file to `.git/info/exclude` when the target is a git repo, and creates `.local/project.md` only when that human-facing project brief does not already exist. Rerunning the same command refreshes the skill runtime and install metadata while preserving existing `AGENTS.md` and `.local/project.md`.

## What Gets Installed

- `.agents/skills/kamiflow-core/SKILL.md`
- `.agents/skills/kamiflow-core/agents/openai.yaml`
- `.agents/skills/kamiflow-core/references/*`
- `.agents/skills/kamiflow-core/scripts/*`
- `.agents/skills/kamiflow-core/assets/*`
- `.agents/skills/kamiflow-core/install-meta.json`
- `AGENTS.md` when the target is a client repo and the file is missing
- `.local/project.md`
- `.local/plans/`
- `.local/plans/done/`

The installer does not generate `.kfc/`, `.codex/rules/`, or any repo-specific scaffold. In this source repo, `npm run skill:sync` reuses the tracked root `AGENTS.md` instead of generating a new one, and `npm run skill:doctor` trusts the runtime metadata to decide whether it should verify a lean client runtime or the full dogfood source sync.

## First Commands After Install

```bash
node .agents/skills/kamiflow-core/scripts/ensure-plan.mjs --project .
node .agents/skills/kamiflow-core/scripts/ready-check.mjs --project .
node .agents/skills/kamiflow-core/scripts/plan-snapshot.mjs --project . --format text
```

Read `AGENTS.md` first for repo rules. Keep `.local/project.md` current as the human-facing project brief. The active plan stays in `.local/plans/*.md`. Direct markdown mutation is the normal workflow. The helper scripts are deterministic recovery commands for plan bootstrap, repo-contract repair, project-brief repair, readiness checks, archive closeout, and lightweight read-only status views.

## Optional Plan View

For a compact status summary in the terminal:

```bash
node .agents/skills/kamiflow-core/scripts/plan-snapshot.mjs --project . --format text
node .agents/skills/kamiflow-core/scripts/plan-snapshot.mjs --project . --format markdown
node .agents/skills/kamiflow-core/scripts/plan-snapshot.mjs --project . --format json
```

For a lightweight live browser view of the active plan:

```bash
node .agents/skills/kamiflow-core/scripts/plan-view.mjs --project . --open
node .agents/skills/kamiflow-core/scripts/plan-view.mjs --project . --stop
```

This view stays read-only, serves only on localhost, reuses a healthy existing server when possible, and keeps `.local/plans/*.md` as the source of truth. Runtime reuse is tracked only through `.local/plan-view/runtime.json`.

## Optional SemVer Workflow

Client repos can opt into SemVer closeout by adding this block to `AGENTS.md`:

```md
## Release Policy
- SemVer Workflow: enabled
- Version Files: package.json, package-lock.json
- Pre-1.0 Policy: strict
- Release History: separate-release-commit-and-tag
```

This first slice supports root single-package Node/npm repos only. In opted-in repos, active plans gain a `## Release Impact` section, PASS archive requires that section to be resolved, and `node .agents/skills/kamiflow-core/scripts/version-closeout.mjs --project .` prepares the later release-only step. Release level is computed from the full unreleased PASS-plan window since the latest reachable `vX.Y.Z` tag, with highest impact winning across that window. Repos that leave the workflow disabled keep the current behavior.

For assistant-guided closeout, the finish model is:

- `commit please`
  - functional commit only
- `release please`
  - release closeout only
- `finish please`
  - inspect `node .agents/skills/kamiflow-core/scripts/finish-status.mjs --project .` and choose the right final action from repo state

## Repo Structure

- `resources/skills/kamiflow-core/`: canonical skill source.
- `bin/`: minimal published binary for `kamiflow-core install`.
- `scripts/`: installer, validator, doctor, and forward-test utilities for the published package and repo-local self-dogfooding.

## Design Rubric

Use this rubric when deciding whether `kamiflow-core` should gain a new helper or workflow feature.

- `single-job clarity`
  - every helper should do one obvious job
- `inspect before mutate`
  - prefer read-only helpers first and keep mutation explicit
- `client-repo-first`
  - default UX should optimize for normal client repos, not this source repo
- `small local state`
  - keep the contract centered on `AGENTS.md`, `.local/project.md`, `.local/plans/*.md`, and `.local/plans/done/**/*.md`
- `evidence-backed output`
  - prefer compact, stable summaries with counts, blockers, readiness, recommendations, and paths
- `no orchestration theater`
  - avoid role simulation, framework growth, or extra workflow layers
- `portable by default`
  - avoid unnecessary runtime stacks, OS coupling, or dashboard dependence

Before adding a helper, write down:

1. the problem it solves
2. why an existing helper is insufficient
3. the exact input/output shape
4. why it stays lightweight

Keep the current helper surface grouped into three buckets:

- `bootstrap/recovery`
  - `ensure-plan`, `ready-check`
- `hygiene/closeout`
  - `archive-plan`, `cleanup-plans`, `finish-status`, `version-closeout`
- `read models`
  - `plan-history`, `plan-snapshot`, `plan-view`

Do not add helpers that blur these buckets unless the overlap is clearly worth the complexity.

## Maintainer Commands

```bash
npm run validate
npm run skill:sync
npm run skill:doctor
npm run forward-test
npm run forward-test -- --mode full
node .agents/skills/kamiflow-core/scripts/finish-status.mjs --project .
npm pack
```

`npm run validate` checks the standalone skill contract without mutating the runtime copy. `npm run skill:sync` refreshes this repo's `.agents/skills/kamiflow-core/` runtime install, preserves the tracked root `AGENTS.md`, and creates the dogfood `.local/project.md` here if it is missing. `npm run skill:doctor` proves whether this repo is Codex-ready or stale and prints the exact recovery command when it is not. `npm run forward-test` is the faster smoke lane and now includes a non-Codex repo-role smoke for client vs source-repo runtime shape. `npm run forward-test -- --mode full` keeps the full serial behavioral suite and takes longer because it launches multiple real `codex exec` sessions against fresh temp projects from a packed tarball. `node .agents/skills/kamiflow-core/scripts/finish-status.mjs --project .` reports whether the current end-of-slice action should be commit-only, release-only, or commit-and-release. Forward-test artifacts live under `.local/forward-tests/` and now include timing breakdowns. `npm pack` builds the publishable tarball for local smoke tests or release workflows.

This source repo also opts into the SemVer workflow. After one or more PASS plans with unreleased `patch`, `minor`, or `major` impact since the latest release tag, use this sequence:

1. check the helper-backed finish recommendation:

```bash
node .agents/skills/kamiflow-core/scripts/finish-status.mjs --project .
```

2. if the helper says `commit-only` or `commit-and-release`, commit the functional changes with a normal scanner-friendly subject
3. if the helper says release is still pending, run:

```bash
node .agents/skills/kamiflow-core/scripts/version-closeout.mjs --project .
```

That helper blocks on a dirty worktree, aggregates the unreleased PASS-plan window since the latest release tag, updates `package.json`, updates `package-lock.json` when present, and prints:

- the exact release-only commit command for `release: vX.Y.Z`
- the exact tag command for `vX.Y.Z`

It does not auto-commit, auto-tag, or publish.

## Next Improvements

Use the rubric above to prioritize the next changes in this order:

1. sharpen helper output contracts so they return more stable machine-readable summaries
2. tighten read-model consistency across `plan-snapshot`, `finish-status`, `cleanup-plans`, and `plan-history`
3. add short usage examples for each helper so the intended loop is obvious
4. reduce route ambiguity only where real prompts still misroute
5. keep `plan-view` constrained as a read-only helper, not a dashboard product

## Clean `main` Cutover

Use `npm run cutover:main` as the guarded maintainer dry run for replacing `main` with the standalone skill snapshot. It does not touch `main` by default. It verifies the legacy safety refs, checks for the required full forward-test run id, prints the current local and remote `main` refs, and emits the exact execute command for the later cutover window.

The live cutover remains blocked until `npm run forward-test -- --mode full` passes on the source commit you want to publish. After that, run the exact execute command printed by `npm run cutover:main` with:

- `--full-run-id <run-id>` from the passing full run
- `--expected-local-main <sha>` matching the current local `main`
- `--expected-remote-main <sha>` matching the current `origin/main`

In execute mode, the script reruns `validate`, `skill:sync`, `skill:doctor`, `forward-test`, and a tarball install smoke, then creates the clean root commit on `codex/main-skill-clean`. It only updates local `main` or remote `main` when you pass `--update-local-main` and `--push-main` explicitly.
