# Fix

Use this route for focused issue resolution with minimal scope.

## Entry Gate

- Required mode: `Build`.
- If current mode is not `Build`, return `MODE_MISMATCH` and stop.

## Steps

1. Restate the issue and expected behavior.
2. Reproduce or identify concrete evidence of failure.
3. Propose the smallest safe fix.
4. Validate fix with targeted checks.
5. Note regression risk.
6. Persist fix/build progress via deterministic command:
   - `kfc flow apply --project <path> --plan <plan_id> --route fix --result progress [--payload <json-file>]`
7. Resolve next-step narrative after persistence:
   - `kfc flow next --project <path> --plan <plan_id> --style narrative`
8. End with narrative next action and machine footer (`Next Command: check`, `Next Mode: Plan`).

## Output

Provide:

- issue summary
- root-cause hypothesis
- fix action
- verification result

## Exit Criteria

- Issue is addressed with minimal scope and verified.
- Final footer includes selected mode and next mode.