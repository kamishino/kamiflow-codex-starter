# Repo Contract

This file is the generated local repo contract for a client project using `kamiflow-core`.

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
- Archive a completed PASS plan with `node .agents/skills/kamiflow-core/scripts/archive-plan.mjs --project . --plan <path>`

## Working Rules

- Keep claims evidence-backed.
- Keep long-lived product direction in `.local/project.md`, not in `AGENTS.md`.
- Keep plans tied to `.local/project.md` through a short `Project Fit` section.
- Update `.local/project.md` only when priorities, guardrails, open questions, or durable decisions changed.
- Do not reintroduce legacy bootstrap commands or repo-specific bootstrap surfaces.

## Safety

- Do not run destructive git commands unless explicitly requested.
- Do not rewrite `.local/project.md` or active plans wholesale when a small direct edit is sufficient.
- Treat this generated `AGENTS.md` as local-only unless you intentionally choose to commit your own repo contract.
