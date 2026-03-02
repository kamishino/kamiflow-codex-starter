# Research

Use this route when key facts are missing or risk is high.

## Entry Gate

- Required mode: `Plan`.
- If current mode is not `Plan`, return `MODE_MISMATCH` and stop.

## Steps

1. State open questions that block implementation.
2. Gather evidence from repo and primary docs.
3. Compare viable options with tradeoffs.
4. Recommend one option with rationale.
5. Persist handoff phase via deterministic command:
   - `kfc flow apply --project <path> --plan <plan_id> --route research --result progress [--payload <json-file>]`
6. Resolve next-step narrative after persistence:
   - `kfc flow next --project <path> --plan <plan_id> --style narrative`
7. End with narrative next action and machine footer (`Next Command: plan|start`, `Next Mode: Plan`).

## Output

Provide:

- question list
- evidence summary
- option comparison
- recommended direction

## Exit Criteria

- Unknowns are reduced enough to continue with plan.
- Final footer includes selected mode and next mode.
