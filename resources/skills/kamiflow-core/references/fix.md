# Fix

Use this route for focused issue resolution with minimal scope.

## Entry Gate

- Required mode: `Build`.
- If current mode is not `Build`, return `MODE_MISMATCH` and stop.
- Fix execution must not proceed until a concrete target plan file is resolved.

## Steps

1. Resolve target plan file before any fix action using this order:
   1. user-provided file path or plan id
   2. active draft/ready plan
   3. `kfc flow ensure-plan --project <path>`, then capture `plan_path` from JSON output
2. If no target file can be resolved, return:
   - `Status: BLOCK`
   - `Reason: <single concrete cause>`
   - `Recovery: kfc flow ensure-plan --project <path>`
   - `Expected: {"ok":true,"plan_path":"<absolute-path>",...}`
3. Restate the issue and expected behavior.
4. Reproduce or identify concrete evidence of failure.
5. Propose the smallest safe fix.
6. Validate fix with targeted checks.
7. Note regression risk.
8. Persist fix/build progress via deterministic command:
   - `kfc flow apply --project <path> --plan <plan_id> --route fix --result progress [--payload <json-file>]`
9. Resolve next-step narrative after persistence:
   - `kfc flow next --project <path> --plan <plan_id> --style narrative`
10. End with narrative next action and machine footer (`Next Command: check`, `Next Mode: Plan`).

## Output

Provide:

- issue summary
- root-cause hypothesis
- fix action
- verification result

## Exit Criteria

- Issue is addressed with minimal scope and verified.
- A concrete target plan file is resolved before execution begins.
- Final footer includes selected mode and next mode.
