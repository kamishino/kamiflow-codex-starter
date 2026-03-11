# Codex Flow Smooth Guide

Use this guide to keep Kami Flow deterministic and easy to operate.

## Core Sequence

1. Classify the request as implementation/workflow or low-risk operational.
   - For explicit "simple" pre-brainstorm requests, keep Start route output compact and avoid architecture-heavy framing until needed.
2. If low-risk operational fast path applies, execute the one-shot task without forcing a plan.
3. Otherwise resolve active non-done plan.
4. Choose exactly one route (`start|plan|build|check|fix|research`).
5. Assign `Route Confidence` (`1-5`) and reroute when confidence is below `4`.
6. Execute one scoped slice.
7. Mutate plan frontmatter + `WIP Log`.
8. Run check validations for completed build/fix work.
9. Review docs impact, sync generated doc artifacts, and keep private memory on the `.kfc/.local` lane.
10. review docs impact, sync generated doc artifacts before commit-safe completion when workflow or onboarding behavior changed.
11. Respond with compact user guidance.

## No-Plan Fast Path

- Use the no-plan fast path only when all conditions are true:
  - request is low-risk and operational
  - no acceptance criteria are needed
  - no phase/archive tracking value exists
  - no multi-step workflow state must be preserved
- Typical allowed categories:
  - commit/amend/reword
  - git status/diff/log or explain current state
  - sync generated docs/rules/skills
  - narrow maintenance chores with low workflow risk
- Disallowed on the fast path:
  - feature work
  - refactors
  - UI changes
  - non-trivial docs/spec changes
  - any request that becomes implementation-bearing while executing
- If scope expands beyond the fast-path boundary, stop and return to the active-plan workflow.

## Route Confidence Gate

- Score route confidence before route execution:
  - intent-to-route fit
  - required artifacts exist for that route
  - unknown/risk level is acceptable
- Threshold:
  - `4-5`: execute selected route
  - `<4`: stop and reroute to `start|plan|research`
- Reroute response shape:
  - `Status: REROUTE`
  - `Selected Route: <route>`
  - `Route Confidence: <1-5>`
  - `Fallback Route: <start|plan|research>`
  - `Reason: <single concrete cause>`

## Route-to-Profile Matrix

Use one default profile per route to keep behavior stable.

| Route | Default Profile | Primary Intent | Default Next |
| --- | --- | --- | --- |
| `start` | `plan` | clarify request and produce scored options | `plan` |
| `plan` | `plan` | produce decision-complete build spec | `build` |
| `build` | `executor` | execute scoped implementation tasks | `check` |
| `fix` | `executor` | resolve check blockers in scoped tasks | `check` |
| `check` | `review` | evaluate acceptance evidence and decide PASS/BLOCK | `fix` or `done` |
| `research` | `plan` | gather evidence/reduce unknowns, or run ideation preset for vague feature discovery | `plan` |

Notes:

- `plan` profile prioritizes clarification, constraints, and spec quality.
- `executor` profile prioritizes deterministic edits + concrete evidence.
- `review` profile prioritizes findings-first verification and decision clarity.
- For vague feature requests asking for inspiration/what-to-build-next, use `research` ideation preset before `start`.
- In `start`, for architecture-heavy or broad requests, keep the first turn to scoped questions and avoid committing design decisions too early.

## Deterministic Fallback Order

When route execution fails or context is incomplete, use this exact order:

1. Resolve active plan from `.local/plans/*.md` and continue on that file.
2. If no active plan exists, recover with `kfc flow ensure-plan --project .`.
3. Re-read `AGENTS.md`, `.kfc/CODEX_READY.md`, and `.kfc/LESSONS.md` (when present) before rerouting, and treat any onboarding inspection summary in `CODEX_READY.md` as the current repo-shape handoff.
4. If shell/profile startup crashes, rerun in no-profile/non-login shell.
5. If route remains blocked, return `Status: BLOCK` with one concrete recovery step.

## Phase Scope

- Build/Fix phase: execute and update `Implementation Tasks`.
- During each Build/Fix loop, follow `diagram_mode`:
- `required`: keep `Technical Solution Diagram` synchronized with architecture changes.
- `auto|hidden`: diagram is optional; keep Tasks/Subtasks accurate for UI fallback.
- Check phase: validate/test `Acceptance Criteria` and decide `PASS|BLOCK`.
- Check closeout also reviews documentation impact for workflow, onboarding, and durable user-facing changes.
- Generated root mirrors should be refreshed through `npm run docs:sync`; private lessons stay in `.kfc/LESSONS.md` and `.local/kfc-lessons/`.
- If check is `BLOCK`, amend tasks/criteria and loop `Build/Fix -> Check`.

## Plan Touch Cadence

- `📝` For implementation/workflow routes, touch active plan at route start (set current turn context).
- `📝` For implementation/workflow routes, touch active plan again before final response (persist actual outcomes).
- `📝` During `build`/`fix`, after each completed task/subtask, immediately update checklist state and append timestamped WIP evidence before continuing.
- `📝` Include route confidence/reroute reason in WIP notes when confidence causes fallback.
- A valid touch updates `updated_at` and appends a timestamped `WIP Log` line.
- `.local/` is git-ignored, so plan touches will not appear in `git status`.

## Chat-Only Execution

- `🧭` Chat is the control plane: Codex executes normal flow commands directly.
- `🤝` Do not push routine CLI steps back to the user when the agent can run them.
- `🧱` If execution is blocked by environment boundaries, report the blocker and request the smallest possible user action.
- `🧾` In client projects, trust the inspection-aware handoff in `.kfc/CODEX_READY.md`; do not rerun bootstrap or re-ask environment basics unless evidence shows drift or breakage.
- `👀` KFC Plan stays observer-first: direct UI/API Codex execution is disabled; Activity Stream relies on plan + run-log (`.local/runs/*.jsonl`) events.
- `🧠` Diagram policy: Mermaid/flow visuals are derived from canonical plan markdown; never treat diagrams as writable execution state.
- `🗺️` Place solution-logic Mermaid in a dedicated `Technical Solution Diagram` section; keep PlanSnapshot focused on progress/checklist status.

## Compact Response Shape

- `State`: current phase + status.
- `Doing`: what was executed in this slice.
- `Next`: one concrete action to run next.

## Auto Check Gate

- When a `build`/`fix` slice is completed in the current turn, run check validations before final response.
- Report check outcome explicitly as `Check: PASS` or `Check: BLOCK`.
- If the slice changed workflow/onboarding/user-facing behavior, review tracked docs before treating the work as commit-safe.
- If check cannot be completed, return `Status: BLOCK` with one recovery command.

## Docs Freshness Gate

- Tracked docs lane:
- `AGENTS.md` for operating contract changes
- `resources/docs/ROADMAP.md` for repo direction/context changes
- `resources/docs/CHANGELOG.md` for durable decisions
- `scripts/policy/verify-kamiflow-route-health.ts` updates require note of route-health observability in this guide.
- focused runbooks (`KFC_CHAT_RUNBOOK`, `KFC_SESSION_RUNBOOK`, `PORTABILITY_RUNBOOK`) when client or hosted entrypoint behavior changes
- root generated mirrors via `npm run docs:sync`
- Private memory lane:
- `.kfc/LESSONS.md` and `.local/kfc-lessons/`
- Never store private client lessons in tracked repo docs.
- Preferred validation path: `npm run verify:governance`.

## Evidence Rule

- Never claim implementation or validation success without evidence.
- Evidence comes from command output, repository files, or explicit user input.
- If evidence is missing, label the claim as `Unknown` and reroute to `research` or `plan`.

## Completion Safety

- `check` is complete only when archive succeeds.
- If completion is below 100% (remaining checklist items), do not archive; amend plan and continue cycle.
- Do not treat plan as done if archive fails.
- On archive failure, keep active recovery path (`fix` or `plan`) and report the blocker explicitly.

## Recovery Shortcuts

- Missing/inconsistent plan: `kfc flow ensure-plan --project .`
- Build-readiness uncertainty: `kfc flow ready --project .`
- Shell/profile crash: rerun with no-profile/non-login shell.
- Runtime skill/rules drift: `npm run codex:sync -- --scope repo --force`
- Stale generated docs or missing tracked closeout updates: `npm run docs:sync`

## Readability Style

- `✨` Emoji is allowed for human-facing markdown cues and section scanning.
- `⚙️` Keep machine-readable fields plain and deterministic (no emoji in command literals or strict contract keys).
- `🧩` Use emoji sparingly and consistently to improve comprehension, not decoration.

## Multi-Agent Orchestration

- Use multi-agent mode only when slices are independent and ownership is explicit.
- Recommended role loop: `Lead -> Explorer(s) -> Worker(s) -> Reviewer -> Lead`.
- Keep one route per response even when sub-agents run in parallel.
- For detailed patterns and tool mapping, use `resources/docs/CODEX_MULTI_AGENT_ORCHESTRATION.md`.

If conflict appears during merge:

- Run a reviewer-only conflict gate before merge commit.
- Record a conflict entry in plan notes with: `files`, `severity`, `decision`, `recovery`.
- For `High` conflicts, continue in single-agent mode for affected files only.

Recommended multi-agent phase sequence:

1. **Assess**
   - Decide if orchestration is required vs single-agent execution.
2. **Split**
   - Record `orchestrator_mode`, `agent_slices`, and merge policy in plan notes before spawn.
3. **Execute**
   - Run workers in bounded concurrency and track evidence by slice.
4. **Merge**
   - Resolve conflicts before any close/check transition.
5. **Close**
   - Run acceptance checks, update WIP, and set `next_command`/`next_mode`.

Allowed fast path:

- For small, narrow tasks, use `fast` path with only Assess → Execute → Close.
- Record the chosen path explicitly in WIP before continuing.

