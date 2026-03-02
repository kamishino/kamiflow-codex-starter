# Build

Use this route to execute an approved plan in small, verifiable slices.

## Entry Gate

- Required mode: `Build`.
- If current mode is not `Build`, return `MODE_MISMATCH` and stop.
- Require an approved plan before execution:
  - `decision: GO`
  - `next_command: build`
  - `next_mode: Build`
  - Start Summary gate is satisfied
  - no unresolved high-impact open decisions
- If approval gates fail, stop and reroute to `plan` (or `start` when clarity is insufficient, or `research` when scope/risk is unclear).

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
8. Persist build phase/progress via deterministic command:
   - `kfc flow apply --project <path> --plan <plan_id> --route build --result progress [--payload <json-file>]`
9. Resolve next-step narrative after persistence:
   - `kfc flow next --project <path> --plan <plan_id> --style narrative`
10. End with narrative next action and machine footer (`Next Command: check`, `Next Mode: Plan`).

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
- Build action is blocked when Start Summary gate is not satisfied.
- Final footer includes selected mode and next mode.