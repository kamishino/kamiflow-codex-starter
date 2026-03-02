# Route Prompts

Copy/paste prompts for `kamiflow-core`.

## Plan Route

```text
$kamiflow-core plan check the .local/plans/<file>.md and produce a decision-complete implementation plan.
```

Expected:

- concrete scope
- if `START_CONTEXT` is provided, consume it directly and do not re-ask baseline clarification
- if `START_CONTEXT` is absent and request is vague (missing 2+ core fields), reroute to `start` first
- resolve target plan file in this order:
  1. user-provided path
  2. active draft/ready plan
  3. `kfc plan init --project <path> --new`
- if plan file resolution fails, return BLOCK with:
  - `Status: BLOCK`
  - `Reason: <single concrete cause>`
  - `Recovery: kfc plan init --project <path> --new`
  - `Expected: [kfp] Created template: <absolute-path>`
- zero unresolved high-impact decisions
- Start Summary is present and non-placeholder
- build-ready checklist is explicitly satisfied:
  - explicit scope
  - file-level tasks
  - testable acceptance criteria
  - runnable validation commands
- explicit `Next Command: build`
- explicit `Next Mode: Build`

Plan output example (ready):

```text
Selected Mode: Plan
Mode Reason: Planning is decision-complete and build-ready.
Next Command: build
Next Mode: Build
```

Plan output example (blocked):

```text
Status: BLOCK
Reason: No target plan file was resolved.
Recovery: kfc plan init --project <path> --new
Expected: [kfp] Created template: <absolute-path>
```

## Start Route

```text
$kamiflow-core start <topic>
```

Expected:

- first turn asks 3-5 questions only
- each question has 3 options + `Other`
- second turn (after answers) returns numbered idea cards
- includes `START_CONTEXT` block
- ends with exact `Run next:` command for `plan` including plan-file bootstrap

## Build Route

```text
$kamiflow-core build execute only Task <n> from .local/plans/<file>.md, list planned file-level actions first, then implementation and validation outcomes.
```

Expected:

- no execution outside selected task scope
- validation command outcomes
- explicit limitations
- explicit next command `check`
- if API is unreachable, return BLOCK with:
  - `kfc plan serve --project <path> --port <n>`
  - health check `GET <base>/api/health`
- update plan via `POST /api/plans/<id>/automation/apply` with `action_type: build_result`

## Check Route

```text
$kamiflow-core check verify current changes against Acceptance Criteria in .local/plans/<file>.md, list findings by severity, and return PASS or BLOCK.
```

Expected:

- findings-first output
- acceptance criteria status
- PASS/BLOCK decision
- explicit next command (`fix` or `done`)
- if API is unreachable, return BLOCK with:
  - `kfc plan serve --project <path> --port <n>`
  - health check `GET <base>/api/health`
- apply decision via `POST /api/plans/<id>/automation/apply` with `action_type: check_result`

When check result is `PASS`, automation apply auto-archives by default (`auto_archive_on_pass: true`).
