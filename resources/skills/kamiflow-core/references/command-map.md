# Command Map

Use this map to choose one route, one mode, and one next step.

## Confidence Gate (Mandatory)

Before final route lock, assign `Route Confidence` (`1-5`) for the candidate route.

- `4-5`: continue with the selected route.
- `<4`: do not execute the selected route. Reroute:
  - intent unclear -> `start`
  - unknown facts/risk high -> `research`
  - plan/readiness missing -> `plan`

When rerouting, return:

- `Status: REROUTE`
- `Selected Route: <route>`
- `Route Confidence: <1-5>`
- `Fallback Route: <start|plan|research>`
- `Reason: <single concrete cause>`

## Context Lock

Pick the command lane before selecting a route:

- KFC repo context:
  - use `npm run ...` maintainer commands
  - valid when working inside `kamiflow-codex-starter` on `src/`, `bin/`, `packages/`, `resources/`, or `scripts/`
  - do not present these commands as the normal answer for a client repo
- Client project context:
  - use `kfc ...`
  - if `kfc` is not visible in PATH but KFC is already present in the client repo, use `npx --no-install kfc ...`
  - if KFC is not installed yet in the client repo, use `npx --package @kamishino/kamiflow-codex kfc client install`
- Wrong-context recovery:
  - if you catch yourself giving repo-only `npm run ...` commands to a client repo, replace them with the nearest `kfc ...` recovery or lifecycle command before final output

## First Run / Bootstrap

- Maintainer path from the KFC repo:
  - Windows: `./setup.ps1`
  - Unix-like: `./setup.sh`
  - explicit target: `npm run client:link-bootstrap -- --project <path>`
- Client-folder first run:
  - `npx --package @kamishino/kamiflow-codex kfc client install`
- Re-entry after install:
  - preferred: `kfc client status`
  - no-PATH fallback: `npx --no-install kfc client status`

## Common Client Commands

- `kfc client`
  - refresh client bootstrap state and repo-shape handoff
- `kfc client status`
  - verify install/readiness without mutating project state
- `kfc client doctor --fix`
  - recover broken client bootstrap or repo-shape drift
- `kfc client done`
  - clean up end-of-mission client bootstrap state
- `kfc flow ensure-plan --project .`
  - recover a missing or inconsistent active plan
- `kfc flow ready --project .`
  - verify build-readiness before implementation when plan state is uncertain

## Common Repo Commands

- `npm run build:scripts`
  - rebuild policy and maintainer scripts after TypeScript edits in `scripts/`
- `npm run build:server`
  - rebuild the CLI/runtime surfaces after `src/` or package-runtime changes
- `npm run verify:governance`
  - run the repo governance and policy verification stack
- `npm run codex:sync:skills -- --force`
  - refresh generated runtime skill output from `resources/skills/`
- `npm run client:link-bootstrap -- --project <path>`
  - bootstrap a client repo from this KFC repo when you are on the maintainer lane

## Route Selection

### Continuity Metadata

- `route_confidence` is the route certainty score written before execution (`1` to `5`).
- `flow_guardrail` is the guardrail reason used when rerouting or blocking (for example: `route_alignment`, `mode_guard`, `readiness_gate`, `readiness_pass`, `transition_guard`, `execution`, `loop_guard`).
- The policy calculation is centralized in `src/lib/flow-policy.ts` and surfaced by `evaluateRoutePreflight`.
- If a reroute is triggered due low confidence, persist `check` or `plan` metadata in the plan file before changing route.

Select exactly one route:

1. `start`
- Triggers: new idea, vague concept, "thinking about building", "what should we build".
- If request is feature-discovery/inspiration and still broad, run `research` with ideation preset first.
- Required mode: `Plan`
- Output: start report.
- Next: `plan (Plan)` or `build (Build)` or `research (Plan)`.

2. `plan`
- Triggers: feature request, refactor proposal, multi-file change, unclear requirements.
- Required mode: `Plan`
- Output: implementation plan spec.
- Next: `build (Build)`.

3. `build`
- Triggers: approved plan exists, user asks to implement now.
- Required mode: `Build`
- Output: implementation action plan + validation checklist.
- Next: `check (Plan)`.

4. `check`
- Triggers: review request, "is this good", "verify changes".
- Required mode: `Plan` by default; `Build` when running commands/tests or proposing file edits.
- Output: findings-first check report with pass/block.
- Next: `fix (Build)` or `done`.

5. `research`
- Triggers: unknown domain, risky change, unclear constraints, missing facts, feature ideation/inspiration discovery.
- Required mode: `Plan`
- Output: research brief with decision recommendation (or ideation brief when preset is selected).
- Next: `plan (Plan)` or `start (Plan)`.

6. `fix`
- Triggers: targeted bug, regression, failing test, specific issue.
- Required mode: `Build`
- Output: fix execution plan and risk note.
- Next: `check (Plan)`.

## Escalation Rules

- If risk includes auth, billing, data migration, or permissions, prefer `research` then `plan`.
- If scope grows beyond original assumptions, pause and reroute to `plan`.
- If current mode mismatches route requirements, return `MODE_MISMATCH` and stop.
- Every selected route must mutate the active plan markdown before final output.

## Recovery Shortcuts

- Missing `kfc` in PATH:
  - already installed in client repo: `npx --no-install kfc client status`
  - not installed yet in client repo: `npx --package @kamishino/kamiflow-codex kfc client install`
- Missing active plan:
  - `kfc flow ensure-plan --project .`
- Build-readiness uncertainty:
  - `kfc flow ready --project .`
- Stale runtime skill/rules in the KFC repo:
  - `npm run codex:sync:skills -- --force`
- Wrong-context command usage:
  - repo -> stay on `npm run ...`
  - client -> switch to `kfc ...` or `npx --no-install kfc ...`
