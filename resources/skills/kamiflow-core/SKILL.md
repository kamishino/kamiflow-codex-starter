---
name: kamiflow-core
description: Core Kami Flow workflow router for start, plan, build, check, research, and fix execution. Use when users ask to start an idea, plan work, build changes, check quality, research unknowns, or fix targeted issues in a consistent project workflow.
---

# Kami Flow Core

Use this as the default workflow router for non-trivial work.
It helps you choose the right route, enforce mode discipline, and finish with a clear next step.

## Mode Selector

Pick mode before executing route logic:

- `start` -> `Plan`
- `plan` -> `Plan`
- `research` -> `Plan`
- `build` -> `Build`
- `fix` -> `Build`
- `check` -> `Plan` by default; use `Build` only when running commands/tests or proposing file edits.

## Routing Workflow

1. Read `references/command-map.md`.
2. Classify the request into exactly one route.
3. Resolve the required mode from that route.
4. If mode is incompatible, return `MODE_MISMATCH` and stop.
5. Load only the matched route reference file.
6. Produce output in that route's required shape.
7. End with one explicit next command and next mode.

## Command Routes

- `start` -> `references/start.md`
- `plan` -> `references/plan.md`
- `build` -> `references/build.md`
- `check` -> `references/check.md`
- `research` -> `references/research.md`
- `fix` -> `references/fix.md`

## Global Rules

- Keep output concise, structured, and human-readable.
- No emoji in default output.
- Do not skip required gates in the selected route reference.
- If scope or risk increases, route back to `research` or `plan`.
- If mode does not satisfy route requirements, do not continue.
- Every top-level user request creates one new plan file in `.local/plans` before route output.
- Every route invocation persists plan-state changes directly in markdown before final output.
- Prefer direct plan-file mutation as primary lifecycle path; use `kfc flow ...` only as recovery fallback.
- Client-facing command guidance must use `kfc` (not direct `kfp`), except package-internal docs.

## Plan Lifecycle Protocol

- Naming: `YYYY-MM-DD-<seq>-<route>.md`.
- Required frontmatter fields (core):
- `plan_id`
- `status`
- `decision`
- `selected_mode`
- `next_command`
- `next_mode`
- `updated_at`
- Optional tracking metadata:
- `request_id`
- `parent_plan_id`
- `lifecycle_phase`
- `archived_at`
- Minimum mutation on every route:
- update `updated_at`
- update `lifecycle_phase`
- update `WIP Log` (`Status`, `Blockers`, `Next step`)
- Archive condition:
- on `check` PASS, archive only when Acceptance Criteria and Go/No-Go checklist items are fully checked.

## Failure Recovery

- Command boundary mismatch:
  - Symptom: repo-only `npm run ...` shown or used in client project.
  - Recovery: switch to `kfc client` (or `kfc client bootstrap --project . --profile client`) and continue with `kfc ...`.
- Codex invocation/quoting failure:
  - Symptom: `spawn codex ENOENT` or `unexpected argument` from `codex exec`.
  - Recovery: persist plan state directly in markdown first; if manual fallback is required use a single quoted prompt: `codex exec "<prompt>"`.
- Plan bootstrap failure:
  - Symptom: plan file missing or `kfc plan init ... --new` fails in flow.
  - Recovery: create plan markdown directly from template; fallback: `kfc flow ensure-plan --project .` or `kfc plan init --project . --new`.
- Readiness gate failure:
  - Symptom: plan lacks build-ready gates (`decision`, handoff mode/command, unresolved checklist items).
  - Recovery: do not run `build`/`fix`; switch to planning and run `$kamiflow-core plan` after addressing blockers.
- Git hook signal-pipe failure:
  - Symptom: `env.exe ... couldn't create signal pipe, Win32 error 5`.
  - Recovery: use `git commit --no-verify -m "<message>"` and record fallback reason in task summary.

## Mode Mismatch Policy

When current mode is incompatible, output:

- `Status: MODE_MISMATCH`
- `Required Mode: Plan|Build`
- `Current Mode: Plan|Build`
- `Reason: <one line>`
- `Instruction: Switch mode and rerun the same command.`

## Output Footer Contract

Every route output must end with:

- `Selected Mode: Plan|Build`
- `Mode Reason: <one line>`
- `Next Action: <one narrative line>`
- `Next Command: <start|plan|build|check|research|fix|done>`
- `Next Mode: Plan|Build|done`
