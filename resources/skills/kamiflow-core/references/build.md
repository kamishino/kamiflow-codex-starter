# Build

Use this route to implement one approved slice from the active plan. Client repos are the default target; the kamiflow-core source repo is the source-repo exception and should be treated as maintainer work.

## Trigger Cues

- implement
- add
- create
- build
- scaffold
- wire up

## Entry Gate

- Required mode: `Build`.
- A target plan must exist and be build-ready. If it is still draft or placeholder, upgrade it to a decision-complete slice before running `ready-check.mjs`.
- Read `AGENTS.md`, then `.local/project.md`, before editing implementation files.
- Run `node .agents/skills/kamiflow-core/scripts/ready-check.mjs --project .` before editing implementation files.
- If readiness is unclear or the command fails, stop immediately, make zero implementation edits, reroute to `plan`, and end the current response without returning to `build`.
- If the request is actually bug remediation, reroute to `fix`.

## Steps

1. Resolve the target plan, `AGENTS.md`, `.local/project.md`, and one concrete task slice.
2. If the plan is still draft or placeholder, upgrade it to a decision-complete slice before running `ready-check.mjs`.
3. Run `ready-check.mjs` and stop on any failure before touching implementation files.
4. State the exact files or behaviors that will change.
5. Implement the smallest useful slice.
6. Run targeted validation commands.
7. Update only `Implementation Tasks` progress in the plan, then set the next handoff to `check`.
8. Update `.local/project.md` only if the work changed a durable priority, guardrail, or product decision. If the lesson is only a candidate, leave it in the plan or hand it off to `check` instead of promoting it immediately.
9. If `AGENTS.md` enables `SemVer Workflow`, keep `## Release Impact` current, but leave final release-impact resolution to `check` when the evidence is complete. Do not use the functionality commit as the release commit.
10. Report a literal `Check: PASS` or `Check: BLOCK` line with evidence before the final response. Do not wrap `PASS` or `BLOCK` in backticks.

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
