# Repo Contract

This file is the generated local repo contract for a client repo using `kamiflow-core`. Client repos are the default case; the kamiflow-core source repo keeps its tracked root `AGENTS.md` and treats itself as the source-repo exception.

## Ownership

- `AGENTS.md`
  - repo rules and operating behavior
- `.local/project.md`
  - human-facing product memory
- `.local/plans/*.md`
  - task execution state

Read `AGENTS.md` first, then `.local/project.md`, then the active plan.

## Command Boundary

- Install or refresh the skill with `npx --package @kamishino/kamiflow-core kamiflow-core install --project .`
- Recover a missing plan or project brief with `node .agents/skills/kamiflow-core/scripts/ensure-plan.mjs --project .`
- Check build readiness with `node .agents/skills/kamiflow-core/scripts/ready-check.mjs --project .`
- Check PASS closeout and optionally archive with `node .agents/skills/kamiflow-core/scripts/check-closeout.mjs --project .` or `node .agents/skills/kamiflow-core/scripts/check-closeout.mjs --project . --archive-if-pass`
- Archive a completed PASS plan manually with `node .agents/skills/kamiflow-core/scripts/archive-plan.mjs --project . --plan <path>` only when direct archive recovery is explicitly needed
- Inspect the active plan state with `node .agents/skills/kamiflow-core/scripts/plan-snapshot.mjs --project . --format text|markdown|json`
- Open the lightweight live plan view with `node .agents/skills/kamiflow-core/scripts/plan-view.mjs --project . --open`
- Stop the lightweight live plan view with `node .agents/skills/kamiflow-core/scripts/plan-view.mjs --project . --stop`
- Inspect finish guidance with `node .agents/skills/kamiflow-core/scripts/finish-status.mjs --project .`
- For opted-in Node/npm repos, run version closeout with `node .agents/skills/kamiflow-core/scripts/version-closeout.mjs --project .`

## Release Policy

- SemVer Workflow: disabled
- Version Files: package.json, package-lock.json
- Pre-1.0 Policy: strict
- Release History: separate-release-commit-and-tag

Leave this disabled unless the repo wants opt-in SemVer closeout for a root single-package Node/npm workflow.

## Working Rules

- Keep claims evidence-backed.
- Keep long-lived product direction in `.local/project.md`, not in `AGENTS.md`.
- Keep plans tied to `.local/project.md` through a short `Project Fit` section.
- Treat `.local/project.md` as curated project memory, not task history or an automatic log.
- Route from one quick screen first:
  - fast path: status, diff, summary, `commit please`, `release please`, `finish please`, `open plan view`
  - `start`: bounded but unclear direction, scope, or success shape
  - `research`: missing facts, evidence, or comparisons
  - `plan`: implementation-ready breakdown with tasks and validation
  - `build` / `fix` / `check`: execute, repair, or validate an approved slice
- Unknown-type matrix:
  - unclear direction or scope boundary -> `start`
  - missing facts or comparison -> `research`
  - implementation details already concrete enough for tasks and validation -> `plan`
- Use the lightest safe lane for the request:
  - fast path for narrow operational asks
  - `start` for bounded but unclear idea shaping
  - `plan` for full implementation planning
- Update `.local/project.md` only when priorities, guardrails, open questions, or durable decisions changed.
- Express recurring anti-patterns as `Architecture Guardrails`, settled conclusions as `Recent Decisions`, and unresolved recurring concerns as `Open Questions`.
- If `SemVer Workflow` is enabled, keep `## Release Impact` current in the active plan and resolve it before PASS archive.
- In SemVer-enabled repos, commit functionality first with a repo-owned subject, then use `version-closeout.mjs` for the release-only commit and `vX.Y.Z` tag.
- In SemVer-enabled repos, release level comes from the unreleased PASS-plan window since the latest reachable `vX.Y.Z` tag; highest impact wins across that window.
- In SemVer-enabled repos, treat `commit please` as functional commit only, `release please` as release closeout only, and `finish please` as a request to choose the right final action from `finish-status.mjs`.
- Treat explicit narrow operational asks like status, diff, summary, commit, release, and finish as fast-path work even if an active plan exists. Do not let stale plan momentum force those asks back into heavier planning lanes.
- Treat `open plan view` as the same kind of fast-path operational ask. It should stay read-only and use the helper-backed plan snapshot instead of becoming a second workflow.
- Do not reintroduce legacy bootstrap commands or repo-specific bootstrap surfaces.
- Treat this generated contract as the client-repo default, not the source-repo contract.

## Safety

- Do not run destructive git commands unless explicitly requested.
- Do not rewrite `.local/project.md` or active plans wholesale when a small direct edit is sufficient.
- Treat this generated `AGENTS.md` as local-only unless you intentionally choose to commit your own repo contract.
