# Fix

Use this route for focused issue resolution.

## Entry Gate

- Required mode: `Build`.
- If current mode is not `Build`, return `MODE_MISMATCH` and stop.

## Steps

1. Restate the issue and expected behavior.
2. Reproduce or identify evidence of failure.
3. Propose minimal-scope fix.
4. Validate fix with targeted checks.
5. Note regression risk.
6. End with next command: `check`.

## Output

Provide:

- issue summary
- root-cause hypothesis
- fix action
- verification result

## Exit Criteria

- Issue is addressed with minimal scope and verified.
- Final footer includes selected mode and next mode.
