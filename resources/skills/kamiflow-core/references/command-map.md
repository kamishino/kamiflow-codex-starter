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

## Route Selection

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
