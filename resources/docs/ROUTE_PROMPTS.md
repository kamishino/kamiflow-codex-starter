# Route Prompts

Copy/paste prompts for `kamiflow-core`.

## Plan Route

```text
$kamiflow-core plan check the .local/plans/<file>.md and produce a decision-complete implementation plan.
```

Expected:

- concrete scope
- zero unresolved high-impact decisions
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

## Check Route

```text
$kamiflow-core check verify current changes against Acceptance Criteria in .local/plans/<file>.md, list findings by severity, and return PASS or BLOCK.
```

Expected:

- findings-first output
- acceptance criteria status
- PASS/BLOCK decision
- explicit next command (`fix` or `done`)
