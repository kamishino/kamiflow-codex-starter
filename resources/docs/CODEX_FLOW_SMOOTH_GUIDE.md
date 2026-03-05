# Codex Flow Smooth Guide

Use this guide to keep Kami Flow deterministic and easy to operate.

## Core Sequence

1. Resolve active non-done plan.
2. Choose exactly one route (`start|plan|build|check|fix|research`).
3. Execute one scoped slice.
4. Mutate plan frontmatter + `WIP Log`.
5. Run check validations for completed build/fix work.
6. Respond with compact user guidance.

## Route-to-Profile Matrix

Use one default profile per route to keep behavior stable.

| Route | Default Profile | Primary Intent | Default Next |
| --- | --- | --- | --- |
| `start` | `plan` | clarify request and produce scored options | `plan` |
| `plan` | `plan` | produce decision-complete build spec | `build` |
| `build` | `executor` | execute scoped implementation tasks | `check` |
| `fix` | `executor` | resolve check blockers in scoped tasks | `check` |
| `check` | `review` | evaluate acceptance evidence and decide PASS/BLOCK | `fix` or `done` |
| `research` | `plan` | gather evidence and reduce unknowns | `plan` |

Notes:

- `plan` profile prioritizes clarification, constraints, and spec quality.
- `executor` profile prioritizes deterministic edits + concrete evidence.
- `review` profile prioritizes findings-first verification and decision clarity.

## Deterministic Fallback Order

When route execution fails or context is incomplete, use this exact order:

1. Resolve active plan from `.local/plans/*.md` and continue on that file.
2. If no active plan exists, recover with `kfc flow ensure-plan --project .`.
3. Re-read `AGENTS.md` and `.kfc/CODEX_READY.md` (if present) before rerouting.
4. If shell/profile startup crashes, rerun in no-profile/non-login shell.
5. If route remains blocked, return `Status: BLOCK` with one concrete recovery step.

## Phase Scope

- Build/Fix phase: execute and update `Implementation Tasks`.
- Check phase: validate/test `Acceptance Criteria` and decide `PASS|BLOCK`.
- If check is `BLOCK`, amend tasks/criteria and loop `Build/Fix -> Check`.

## Plan Touch Cadence

- `📝` Touch active plan at route start (set current turn context).
- `📝` Touch active plan again before final response (persist actual outcomes).
- `📝` During `build`/`fix`, after each completed task/subtask, immediately update checklist state and append timestamped WIP evidence before continuing.
- A valid touch updates `updated_at` and appends a timestamped `WIP Log` line.
- `.local/` is git-ignored, so plan touches will not appear in `git status`.

## Chat-Only Execution

- `🧭` Chat is the control plane: Codex executes normal flow commands directly.
- `🤝` Do not push routine CLI steps back to the user when the agent can run them.
- `🧱` If execution is blocked by environment boundaries, report the blocker and request the smallest possible user action.

## Compact Response Shape

- `State`: current phase + status.
- `Doing`: what was executed in this slice.
- `Next`: one concrete action to run next.

## Auto Check Gate

- When a `build`/`fix` slice is completed in the current turn, run check validations before final response.
- Report check outcome explicitly as `Check: PASS` or `Check: BLOCK`.
- If check cannot be completed, return `Status: BLOCK` with one recovery command.

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

## Readability Style

- `✨` Emoji is allowed for human-facing markdown cues and section scanning.
- `⚙️` Keep machine-readable fields plain and deterministic (no emoji in command literals or strict contract keys).
- `🧩` Use emoji sparingly and consistently to improve comprehension, not decoration.
