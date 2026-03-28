# Agent Instructions

This repository has one product: the standalone `kamiflow-core` Codex skill.

## Source Of Truth

- Keep the canonical skill only in `resources/skills/kamiflow-core/`.
- Treat installed copies under `.agents/skills/kamiflow-core/` as runtime output, not source.
- Treat `.local/project.md` as generated runtime state, not source.
- This source repo keeps its tracked root `AGENTS.md`; installed client repos may get a generated local-only `AGENTS.md`.
- Keep helper scripts and references inside the skill folder so the published package can install one self-contained artifact.
- In this repo, Codex visibility depends on the generated runtime copy under `.agents/skills/kamiflow-core/`, not the SSOT source tree alone.

## Repo Shape

- `resources/skills/kamiflow-core/`: skill SSOT.
- `bin/`: minimal published CLI entrypoint.
- `scripts/`: installer, runtime doctor, validator, and forward-test runner for this package.
- `README.md`, `package.json`, `package-lock.json`: package metadata and maintainer docs.

## Command Boundary

- In this source repo, use `npm run skill:sync`, `npm run skill:doctor`, `npm run validate`, `npm run forward-test`, `npm run forward-test -- --mode full`, `node .agents/skills/kamiflow-core/scripts/finish-status.mjs --project .`, `node .agents/skills/kamiflow-core/scripts/version-closeout.mjs --project .`, and `npm pack` for maintainer work.
- In installed target projects, use `kamiflow-core install` for installation and the project-local helper scripts under `.agents/skills/kamiflow-core/scripts/` for workflow recovery.
- Keep the three-layer contract explicit: `AGENTS.md` owns repo operation, `.local/project.md` owns product memory, and `.local/plans/*.md` own task execution state.
- Do not reintroduce `kfc`, dogfood fixtures, rules profiles, web surfaces, or repo-specific bootstrap scaffolding on this branch.

## Release Policy

- SemVer Workflow: enabled
- Version Files: package.json, package-lock.json
- Pre-1.0 Policy: strict
- Release History: separate-release-commit-and-tag
- npm Publish Automation: GitHub Release `published` event via `.github/workflows/publish-npm.yml`
- Publish Auth Default: npm Trusted Publishing with GitHub-hosted Actions OIDC
- Trusted Publisher Workflow Filename: `publish-npm.yml` on npm, not the full workflow path

## Session Bootstrap

- Read `AGENTS.md` at session start.
- Resolve one active non-done plan in `.local/plans/` before non-trivial implementation.
- Low-risk operational requests may use a no-plan fast path for status, diffs, summaries, or commit chores.
- For implementation work, touch the active plan at route start and before the final response.

## Plan Contract

- Store active plans in `.local/plans/` and archived plans in `.local/plans/done/`.
- Use naming pattern `YYYY-MM-DD-<seq>-<route>-<topic-slug>.md`.
- Update frontmatter at minimum: `updated_at`, `selected_mode`, `next_command`, `next_mode`, `status`, `decision`, `lifecycle_phase`.
- In this SemVer-enabled repo, keep `## Release Impact` resolved before PASS archive.
- Keep functional commits scanner-friendly; use `version-closeout.mjs` later for the release-only commit and the `vX.Y.Z` tag.
- After pushing the release-only commit and tag, publish the matching GitHub Release instead of running manual `npm publish` for the normal release path.
- Pushing the release tag alone does not publish to npm; the GitHub Release `published` event is the release gate.
- In this SemVer-enabled repo, release level comes from the highest unresolved `Release Impact` across all PASS plans since the latest reachable `vX.Y.Z` tag, not just the latest archived or active plan.
- When the user asks to finish the slice, use `finish-status.mjs` to decide between `commit only`, `release only`, and `commit and release` instead of guessing from phrasing alone.
- Append timestamped `WIP Log` lines for `Status`, `Blockers`, and `Next step`.
- Archive only after `check` PASS and all Acceptance Criteria plus Go/No-Go items are checked.

## Documentation Contract

- Keep root documentation limited to the standalone skill package and install flow.
- Keep route instructions, helper command references, and reusable templates inside `resources/skills/kamiflow-core/`.
- When public install behavior changes, update both `README.md` and the skill references in the same slice.
- Keep forward-test prompts and fixtures under `resources/skills/kamiflow-core/assets/forward-tests/`; keep forward-test run artifacts private under `.local/forward-tests/`.
- Default `npm run forward-test` is the smoke lane. The full serial behavioral suite lives behind `npm run forward-test -- --mode full` because it launches multiple real `codex exec` sessions and is intentionally slower.
- Keep repo-local self-dogfooding explicit: `skill:sync` mutates `.agents/skills/kamiflow-core/`, preserves this tracked root `AGENTS.md`, and may create the dogfood `.local/project.md`; `skill:doctor` verifies role-aware runtime state; `validate` stays non-mutating.
- Keep helper entrypoints thin. For touched multi-surface helpers, keep canonical read-model logic separate from runtime side effects, and keep static plan-view UI files under `assets/` instead of embedding them in runtime code.
- Do not expand the plan view beyond the current single read-only screen without a separate user-approved slice. No second view, tabs, filters, widgets, edit UI, or dashboard framework on this branch.

## Safety

- Do not run destructive git commands unless explicitly requested.
- Do not revert unrelated user changes.
- Do not manually edit installed runtime copies under `.agents/skills/`.
