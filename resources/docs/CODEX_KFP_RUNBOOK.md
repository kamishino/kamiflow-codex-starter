# Codex + KFP Runbook

Use this runbook to dogfood Kami Flow in this repo with predictable route behavior.

## Preconditions

- Node.js 20+
- `npm --prefix packages/kamiflow-plan-ui install` completed once
- Codex CLI available in PATH

## Command Policy

- Client-facing workflow commands use `kfc`.
- `kfp` is package-internal (`kamiflow-plan-ui`) and delegated by `kfc plan`.

## Canonical Local Flow

1. Sync runtime skills from SSOT:

```bash
npm run codex:sync -- --force
```

2. Initialize private plans directory and template:

```bash
kfc plan init --project .
```

3. Validate plans:

```bash
kfc plan validate --project .
```

4. Serve local plan UI/API:

```bash
kfc plan serve --project . --port 4310
```

5. Run Codex routes against one plan file:

- `start` route first when request is vague (missing 2+ core planning fields)
- `start` final output must include `START_CONTEXT` + exact `Run next:` command
- `plan` route to finalize scope and gates
- `build` route only when plan is build-ready
- `check` route after each build slice
- after PASS + done handoff, use complete/archive flow

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

Automation apply (build/check persistence):

```text
POST /api/plans/<id>/automation/apply with:
- build_result: task/ac updates + wip, then handoff to check
- check_result BLOCK: decision NO_GO, handoff fix/Build
- check_result PASS: decision GO, done + auto archive by default
```

Server resolution:

- Use `KFP_BASE_URL` when set.
- Default base URL: `http://127.0.0.1:4310`
- Preflight before mutation: `GET <base>/api/health` must return `{ "ok": true }`.

## Operator Rules

- One task slice per `build` cycle.
- Run targeted validation after each slice.
- Update WIP log in the plan each cycle.
- If scope/risk increases, reroute to `plan` or `research`.

## Fast Troubleshooting

- Missing `.local/`: run `kfc plan init --project .`.
- Skill mismatch after edits: run `npm run codex:sync -- --force` and restart Codex CLI.
- Build route blocked: check `resources/docs/PLAN_CONTRACT_V1.md` build readiness gate.
