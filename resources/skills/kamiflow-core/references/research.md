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
5. End with next command: `plan` or `start`.

## Output

Provide:

- question list
- evidence summary
- option comparison
- recommended direction

## Exit Criteria

- Unknowns are reduced enough to continue with plan.
- Final footer includes selected mode and next mode.
