# Route Prompts

Copy/paste prompts for `kamiflow-core`.

## Plan Route

```text
$kamiflow-core plan check the .local/plans/<file>.md and produce a decision-complete implementation plan.
```

Expected:

- concrete scope
- if request is vague (missing 2+ core fields), reroute to `start` first
- zero unresolved high-impact decisions
- Start Summary is present and non-placeholder
- explicit `Next Command: build`
- explicit `Next Mode: Build`

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
