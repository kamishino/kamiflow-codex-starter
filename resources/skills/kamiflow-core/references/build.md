# Build

Use this route to implement one approved slice from the active plan.

## Trigger Cues

- implement
- add
- create
- build
- scaffold
- wire up

## Entry Gate

- Required mode: `Build`.
- A target plan must exist and be build-ready.
- Read `AGENTS.md`, then `.local/project.md`, before editing implementation files.
- Run `node .agents/skills/kamiflow-core/scripts/ready-check.mjs --project .` before editing implementation files.
- If readiness is unclear or the command fails, stop immediately, make zero implementation edits, reroute to `plan`, and end the current response without returning to `build`.
- If the request is actually bug remediation, reroute to `fix`.

## Steps

1. Run `ready-check.mjs` and stop on any failure before touching implementation files.
2. Resolve the target plan, `AGENTS.md`, `.local/project.md`, and one concrete task slice.
3. State the exact files or behaviors that will change.
4. Implement the smallest useful slice.
5. Run targeted validation commands.
6. Update only `Implementation Tasks` progress in the plan, then set the next handoff to `check`.
7. Update `.local/project.md` only if the work changed a durable priority, guardrail, or product decision.
8. Report a literal `Check: PASS` or `Check: BLOCK` line with evidence before the final response. Do not wrap `PASS` or `BLOCK` in backticks.

## Minimum Plan Mutation

- Keep `selected_mode: Build`.
- Keep `lifecycle_phase: build`.
- Mark only the completed `Implementation Tasks`.
- Set `next_command: check` and `next_mode: Check` after the implementation slice is validated.

## Command Recipe

- Recover missing plan state with `ensure-plan.mjs`.
- Confirm readiness with `ready-check.mjs` before edits; a failing result means reroute to `plan`, keep implementation files unchanged, and stop the current response after the plan update.
- Prefer direct markdown mutation for progress tracking.

## Output Contract

Return compact `State`, `Doing`, and `Next` sections plus a literal `Check: PASS` or `Check: BLOCK` line.
