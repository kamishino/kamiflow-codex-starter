# Check

Use this route for quality verification and review gates.

## Entry Gate

- Required mode: `Plan` by default.
- Use `Build` only when running commands/tests or proposing file edits.
- If current mode is incompatible with intended check actions, return `MODE_MISMATCH` and stop.

## Steps

1. Inspect changes against acceptance criteria.
2. Identify findings ordered by severity.
3. Flag behavioral regressions or missing tests.
4. Decide pass or block.
5. End with next command: `fix` or done.

## Output

Use `../templates/check-report.md` shape.

## Exit Criteria

- Findings are actionable and prioritized.
- Decision is explicit: pass or block.
- Final footer includes selected mode and next mode.
