## Plan Lifecycle Contract
- Resolve one active non-done plan before implementation-bearing work.
- If no active non-done plan exists, recover it immediately with `kfc flow ensure-plan --project .` before continuing.
- Touch the active plan at route start and before final response (`updated_at` + `WIP Log`).
- Create a new plan only when no active non-done plan exists or the user explicitly splits scope.
- Only start `build`/`fix` when the active plan is build-ready.
- Archive only on `check` PASS when the plan's acceptance and go/no-go gates are complete.
- `.local/` is gitignored; do not use `git status` as proof that plan files were touched.

## Autonomous Execution
- Execute routine `kfc ...` flow commands yourself; do not ask the user to run normal workflow commands.
- Ask the user only when execution is impossible from agent context (permissions, auth, or out-of-workspace access).
- If onboarding or flow behavior drifts, run `kfc client doctor --project . --fix`.

## Evidence Gate
- Do not claim implementation, validation, or completion without command output, repository file state, or explicit user-provided evidence.
- If evidence is missing, mark the result `Unknown` and route to `research` or `plan`, or return `Status: BLOCK` until recovered.

## Smooth Flow Protocol
- Resolve the active plan first, then execute exactly one route per response (`start|plan|build|check|fix|research`).
- `build`/`fix` is for implementation tasks; do not treat unfinished acceptance criteria as build completion proof.
- `check` is where `Check: PASS|BLOCK` is decided from evidence.
- After implementation work, run checks before final response and report `Check: PASS|BLOCK`.
- Keep non-trivial responses compact with `State`, `Doing`, and `Next`.
- If completion is below 100%, continue `Build/Fix -> Check`; do not force done.

## Docs and Closeout
- Review docs impact for workflow, onboarding, and durable user-facing changes before commit-safe completion.
- When workflow-surface files changed, review `AGENTS.md` for operating-contract drift.
- Keep private project memory in `.kfc/LESSONS.md` and `.local/kfc-lessons/`; do not move it into tracked docs.

## Markdown Readability Policy
- Prefer concise, readable markdown for non-trivial responses.
- Keep command literals, machine-sensitive fields, and parse-sensitive text deterministic.
- Emoji is allowed but optional; do not use it inside commands or parse-sensitive fields.

## Blocker Contract
- If blocked, return exact:
- `Status: BLOCK`
- `Reason: <single concrete cause>`
- `Recovery: <exact command>`
