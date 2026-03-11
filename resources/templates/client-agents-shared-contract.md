## Workflow Contract
- Resolve one active non-done plan before implementation-bearing work.
- Touch the active plan at route start and before final response (`updated_at` + `WIP Log`).
- Only start `build`/`fix` when the active plan is build-ready.
- Execute exactly one route per response and keep user guidance compact with `State`, `Doing`, and `Next`.
- After implementation work, run checks and report `Check: PASS|BLOCK` with evidence.
- If completion is below 100%, continue `Build/Fix -> Check`; do not force done.

## Autonomous Execution
- Execute routine `kfc ...` flow commands yourself; do not ask the user to run normal workflow commands.
- Ask the user only when execution is impossible from agent context (permissions, auth, or out-of-workspace access).
- If onboarding or flow behavior drifts, run `kfc client doctor --project . --fix`.

## Evidence Gate
- Do not claim implementation, validation, or completion without command output, repository file state, or explicit user-provided evidence.
- If evidence is missing, mark the result `Unknown` or return `Status: BLOCK` until recovered.

## Docs and Closeout
- Review docs impact for workflow, onboarding, and durable user-facing changes before commit-safe completion.
- When workflow-surface files changed, review `AGENTS.md` for operating-contract drift.
- Keep private project memory in `.kfc/LESSONS.md` and `.local/kfc-lessons/`; do not move it into tracked docs.

## Blocker Contract
- If blocked, return exact:
- `Status: BLOCK`
- `Reason: <single concrete cause>`
- `Recovery: <exact command>`
