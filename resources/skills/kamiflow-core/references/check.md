# Check

Use this route for quality verification and release-readiness decisions.

## Entry Gate

- Required mode: `Plan` by default.
- Use `Build` only when running commands/tests or proposing file edits.
- If current mode is incompatible with intended check actions, return `MODE_MISMATCH` and stop.
- Route confidence for `check` must be `>=4` before execution.
- If route confidence is `<4`, return `Status: REROUTE` with fallback route (`plan|research|start`) and stop.

## Steps

1. Inspect changes against acceptance criteria.
   - Check scope is Acceptance Criteria validation/testing from current build output.
2. Identify findings ordered by severity.
3. Flag behavioral regressions or missing tests.
4. Map each validation command to its outcome.
5. Review docs impact for workflow, onboarding, and durable user-facing changes.
   - refresh tracked docs when required
   - when workflow-surface files changed, review `AGENTS.md` for operating-contract drift even if governance only emits a warning
   - keep private project memory on the `.kfc/LESSONS.md` and `.local/kfc-lessons/` lane
   - generated root mirrors should be refreshed through the docs sync path before commit-safe completion
6. Decide pass or block.
7. Persist check decision by direct markdown mutation:
   - set frontmatter: `lifecycle_phase: check`, `selected_mode`, `decision`, `status`, `next_command`, `next_mode`, `updated_at`, `route_confidence`, `flow_guardrail`
   - update `WIP Log` lines (`Status`, `Blockers`, `Next step`)
8. Apply archive gate:
   - if result is `PASS` and completion is 100% (Implementation Tasks + Acceptance Criteria fully checked):
   - archive first: move file to `.local/plans/done/<same-file>.md`
   - then treat completion as final (`status: done`, `next_command: done`, `next_mode: done`, `lifecycle_phase: done`, `archived_at: <iso>`)
   - prune older done plans and keep only latest 20 files in `.local/plans/done/`
   - if result is `BLOCK` or completion is below 100%, amend Implementation Tasks/Acceptance Criteria and continue `Build/Fix -> Check`
   - if archive fails, do not report done; keep active recovery path (`fix` or `plan`)
9. Resolve next-step narrative from mutated state (`fix` or `done`).
10. End with concise next-step guidance; do not require verbose response footer fields.
11. Final response should use compact guidance shape:
   - `State`: PASS/BLOCK + archive status
   - `Doing`: findings and gate decisions
   - `Next`: one concrete action (`fix` or `done`)

## Route Output Contract

- Findings-first output remains required, then compact guidance:
  - `State`
  - `Doing`
  - `Next`
- Decision must be explicit: `PASS` or `BLOCK`.

## Evidence Contract

- Each acceptance criterion decision must map to concrete validation evidence.
- If evidence is missing for any criterion, mark that criterion `Unknown` and return `BLOCK`.

## Output

Use `../templates/check-report.md` shape.

## Exit Criteria

- Findings are actionable and prioritized.
- Decision is explicit: pass or block.
- Acceptance criteria status is explicit.
- Docs impact is reviewed before commit-safe completion.
- Plan file is mutated directly before response is returned.
- PASS only archives when checklist gates are fully satisfied.
- Done-plan retention is enforced (latest 20 kept).
- Handoff metadata is persisted in plan frontmatter.
