# Check

Use this route for quality verification and release-readiness decisions.

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
6. Persist check decision by direct markdown mutation:
   - set frontmatter: `lifecycle_phase: check`, `selected_mode`, `decision`, `status`, `next_command`, `next_mode`, `updated_at`
   - update `WIP Log` lines (`Status`, `Blockers`, `Next step`)
7. Apply archive gate:
   - if result is `PASS` and all Acceptance Criteria + Go/No-Go checklist items are checked:
   - set `status: done`, `next_command: done`, `next_mode: done`, `lifecycle_phase: done`, `archived_at: <iso>`
   - move file to `.local/plans/done/<same-file>.md`
   - prune older done plans and keep only latest 20 files in `.local/plans/done/`
8. Resolve next-step narrative from mutated state (`fix` or `done`).
9. End with concise next-step guidance; do not require verbose response footer fields.

## Output

Use `../templates/check-report.md` shape.

## Exit Criteria

- Findings are actionable and prioritized.
- Decision is explicit: pass or block.
- Acceptance criteria status is explicit.
- Plan file is mutated directly before response is returned.
- PASS only archives when checklist gates are fully satisfied.
- Done-plan retention is enforced (latest 20 kept).
- Handoff metadata is persisted in plan frontmatter.
