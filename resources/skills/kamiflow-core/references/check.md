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
4. Map each validation command to its outcome.
5. Decide pass or block.
6. Ensure KFP API is reachable before writing decision:
   - Resolve base URL from `KFP_BASE_URL`, fallback `http://127.0.0.1:4310`
   - Health check: `GET <base>/api/health` expects `{ "ok": true }`
   - If unreachable, return `BLOCK` with exact recovery command:
     - `kfc plan serve --project <path> --port <n>`
7. Apply check result via Plan UI automation API:
   - `POST /api/plans/<id>/automation/apply`
   - `action_type: check_result`
   - `check.result: PASS | BLOCK`
   - include findings in WIP evidence
   - PASS auto-archives by default
8. End with next command: `fix` or `done`.

## Output

Use `../templates/check-report.md` shape.

## Exit Criteria

- Findings are actionable and prioritized.
- Decision is explicit: pass or block.
- Acceptance criteria status is explicit.
- Final footer includes selected mode and next mode.
