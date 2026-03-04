# Build

Use this route to execute an approved plan in small, verifiable slices.

## Entry Gate

- Required mode: `Build`.
- If current mode is not `Build`, return `MODE_MISMATCH` and stop.
- Implementation must not proceed until a concrete target plan file is resolved.
- Require an approved plan before execution:
  - `decision: GO`
  - `next_command: build`
  - `next_mode: Build`
  - Start Summary gate is satisfied
  - no unresolved high-impact open decisions
- If approval gates fail, stop and reroute to `plan` (or `start` when clarity is insufficient, or `research` when scope/risk is unclear).

## Steps

1. Resolve target plan file before any implementation using this order:
   1. user-provided file path or plan id
   2. active draft/ready plan
   3. `kfc flow ensure-plan --project <path>`, then capture `plan_path` from JSON output
2. If no target file can be resolved, return:
   - `Status: BLOCK`
   - `Reason: <single concrete cause>`
   - `Recovery: kfc flow ensure-plan --project <path>`
   - `Expected: {"ok":true,"plan_path":"<absolute-path>",...}`
3. Run readiness gate before implementation:
   - `kfc flow ready --project <path>`
4. If readiness gate fails, return:
   - `Status: BLOCK`
   - `Reason: plan is not build-ready`
   - `Recovery: kfc flow ready --project <path>`
   - `Expected: {"ok":true,"ready":true,...}`
5. Confirm required plan or scope exists and map to the resolved plan file.
6. Select one concrete task slice from the plan.
7. List exact file-level actions before implementation.
8. Implement in small logical steps.
9. Run targeted checks relevant to changed areas.
10. Summarize what changed and why.
11. Ensure KFP API is reachable before writing progress:
   - Resolve base URL from `KFP_BASE_URL`, fallback `http://127.0.0.1:4310`
   - Health check: `GET <base>/api/health` expects `{ "ok": true }`
   - If unreachable, return `BLOCK` with exact recovery command:
     - `kfc plan serve --project <path> --port <n>`
12. Persist build phase/progress via deterministic command:
   - `kfc flow apply --project <path> --plan <plan_id> --route build --result progress [--payload <json-file>]`
13. Resolve next-step narrative after persistence:
   - `kfc flow next --project <path> --plan <plan_id> --style narrative`
14. End with narrative next action and machine footer (`Next Command: check`, `Next Mode: Plan`).

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
- A concrete target plan file is resolved before execution begins.
- Readiness gate (`kfc flow ready --project <path>`) passes before implementation starts.
- Build action is blocked when Start Summary gate is not satisfied.
- Final footer includes selected mode and next mode.
