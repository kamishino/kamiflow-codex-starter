# Codex + KFP Runbook

Use this runbook to dogfood Kami Flow in this repo with predictable route behavior.

## Preconditions

- Node.js 20+
- `npm --prefix packages/kamiflow-plan-ui install` completed once
- Codex CLI available in PATH

## Canonical Local Flow

1. Sync runtime skills from SSOT:

```bash
npm run codex:sync -- --force
```

2. Initialize private plans directory and template:

```bash
npm run plan-ui:init
```

3. Validate plans:

```bash
npm run plan-ui:validate
```

4. Serve local plan UI/API:

```bash
npm run plan-ui:serve
```

5. Run Codex routes against one plan file:

- `plan` route to finalize scope and gates
- `build` route only when plan is build-ready
- `check` route after each build slice

## Minimal Route Prompts

Plan:

```text
$kamiflow-core plan check the .local/plans/<file>.md and produce a decision-complete implementation plan.
```

Build:

```text
$kamiflow-core build execute only Task <n> from .local/plans/<file>.md with file-level actions and validation results.
```

Check:

```text
$kamiflow-core check verify current changes against Acceptance Criteria in .local/plans/<file>.md and return PASS or BLOCK.
```

## Operator Rules

- One task slice per `build` cycle.
- Run targeted validation after each slice.
- Update WIP log in the plan each cycle.
- If scope/risk increases, reroute to `plan` or `research`.

## Fast Troubleshooting

- Missing `.local/`: run `npm run plan-ui:init`.
- Skill mismatch after edits: run `npm run codex:sync -- --force` and restart Codex CLI.
- Build route blocked: check `resources/docs/PLAN_CONTRACT_V1.md` build readiness gate.
