# Fix

Use this route for targeted remediation of a concrete bug, regression, or failed validation.

## Trigger Cues

- fix
- bug
- broken
- failing
- regression
- error
- repair

## Entry Gate

- Required mode: `Build`.
- Read `AGENTS.md`, then `.local/project.md`, before editing implementation files.
- Run `node .agents/skills/kamiflow-core/scripts/ready-check.mjs --project .` before editing implementation files.
- If readiness fails, stop immediately, make zero implementation edits, reroute to `plan`, and end the current response without returning to `fix`.
- If the problem is not concrete enough, reroute to `research` or `plan`.

## Steps

1. Run `ready-check.mjs` and stop on any failure before touching implementation files.
2. Resolve the active plan, `AGENTS.md`, `.local/project.md`, and the specific failing behavior.
3. State the suspected cause and the smallest repair slice.
4. Implement the fix.
5. Run validation for the repaired behavior.
6. Update the plan and hand off to `check`.
7. Update `.local/project.md` only if the fix changes a durable decision or architecture guardrail.

## Minimum Plan Mutation

- Keep `selected_mode: Build`.
- Set `lifecycle_phase: fix`.
- Update the relevant `Implementation Tasks`.
- Set `next_command: check` and `next_mode: Check` after the fix is validated.

## Command Recipe

- Recover missing plan state with `ensure-plan.mjs`.
- If build readiness is uncertain or `ready-check.mjs` fails, reroute to `plan`, keep implementation files unchanged, and stop the current response after the plan update.

## Output Contract

Return compact `State`, `Doing`, and `Next` sections plus a literal `Check: PASS` or `Check: BLOCK` line.
