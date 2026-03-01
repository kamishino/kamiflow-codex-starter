# Build

Use this route to execute an approved plan.

## Entry Gate

- Required mode: `Build`.
- If current mode is not `Build`, return `MODE_MISMATCH` and stop.

## Steps

1. Confirm required plan or scope exists.
2. List exact file-level actions before implementation.
3. Implement in small logical steps.
4. Run targeted checks relevant to changed areas.
5. Summarize what changed and why.
6. End with next command: `check`.

## Output

Provide:

- planned changes
- executed changes
- validation run list
- known limitations

## Exit Criteria

- Changes align with scope.
- Validation commands are listed with outcomes.
- Final footer includes selected mode and next mode.
