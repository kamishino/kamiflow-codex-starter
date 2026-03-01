# Build

Use this route to execute an approved plan.

## Entry Gate

- Required mode: `Build`.
- If current mode is not `Build`, return `MODE_MISMATCH` and stop.
- Require an approved plan before execution:
  - `decision: GO`
  - `next_command: build`
  - `next_mode: Build`
  - no unresolved high-impact open decisions
- If approval gates fail, stop and reroute to `plan` (or `research` when scope/risk is unclear).

## Steps

1. Confirm required plan or scope exists.
2. Select one concrete task slice from the plan.
3. List exact file-level actions before implementation.
4. Implement in small logical steps.
5. Run targeted checks relevant to changed areas.
6. Summarize what changed and why.
7. Ensure KFP API is reachable before writing progress:
   - Resolve base URL from `KFP_BASE_URL`, fallback `http://127.0.0.1:4310`
   - Health check: `GET <base>/api/health` expects `{ "ok": true }`
   - If unreachable, return `BLOCK` with exact recovery command:
     - `kfc plan serve --project <path> --port <n>`
8. Apply build result via Plan UI automation API:
   - `POST /api/plans/<id>/automation/apply`
   - `action_type: build_result`
   - include task-scoped checklist updates and WIP evidence
9. End with next command: `check`.

## Output

Provide:

- planned changes
- executed changes
- validation run list
- known limitations

## Exit Criteria

- Changes align with scope.
- Validation commands are listed with outcomes.
- Work done maps to explicit task(s) in the plan.
- Final footer includes selected mode and next mode.
