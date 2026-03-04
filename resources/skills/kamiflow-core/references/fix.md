# Fix

Use this route for focused issue resolution with minimal scope.

## Entry Gate

- Required mode: `Build`.
- If current mode is not `Build`, return `MODE_MISMATCH` and stop.
- Fix execution must not proceed until a concrete target plan file is resolved.

## Steps

1. Resolve target plan file before any fix action using this order:
   1. user-provided file path or plan id
   2. current request-scoped fix plan (`YYYY-MM-DD-<seq>-fix.md`)
   3. active non-done plan
   4. create a new request-scoped plan file directly from template
2. If no target file can be resolved, return:
   - `Status: BLOCK`
   - `Reason: <single concrete cause>`
   - `Recovery: create .local/plans/<date-seq>-fix.md from template`
   - `Expected: plan markdown exists and is writable`
3. Run readiness gate before fix implementation:
   - evaluate build-ready criteria directly from plan markdown (`decision`, handoff, open decisions, tasks, acceptance criteria, validation commands).
4. If readiness gate fails, return:
   - `Status: BLOCK`
   - `Reason: plan is not build-ready`
   - `Recovery: update plan via `$kamiflow-core plan` and rerun fix`
   - `Expected: readiness gates pass in plan markdown`
5. Restate the issue and expected behavior.
6. Reproduce or identify concrete evidence of failure.
7. Propose the smallest safe fix.
8. Validate fix with targeted checks.
9. Note regression risk.
10. Persist fix/build progress via direct markdown mutation:
   - frontmatter: `lifecycle_phase: fix`, `selected_mode: Build`, `next_command: check`, `next_mode: Plan`, `updated_at`
   - `WIP Log`: `Status`, `Blockers`, `Next step`
11. Resolve next-step narrative from mutated frontmatter and remaining checklist state.
12. End with concise next-step guidance; do not require verbose response footer fields.

## Output

Provide:

- issue summary
- root-cause hypothesis
- fix action
- verification result

## Exit Criteria

- Issue is addressed with minimal scope and verified.
- A concrete target plan file is resolved before execution begins.
- Readiness gate in markdown passes before fix starts.
- Plan file is mutated directly before response is returned.
- Handoff metadata is persisted in plan frontmatter.
