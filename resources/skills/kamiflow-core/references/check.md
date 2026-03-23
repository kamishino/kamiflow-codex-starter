# Check

Use this route to verify behavior, review changes, and decide `PASS` or `BLOCK`.

## Trigger Cues

- review
- verify
- validate
- test
- QA
- done
- close out

## Entry Gate

- Default mode: `Plan`.
- Use `Build` only when running commands or making small follow-up edits during validation.
- Read `AGENTS.md` first, then `.local/project.md`, before deciding whether validation is complete.
- If the request is actually asking for new implementation, reroute to `build` or `fix`.

## Steps

1. Resolve the target plan, the expected acceptance criteria, and the relevant context from `AGENTS.md` and `.local/project.md`.
2. Run the relevant validation commands.
3. Compare results against the plan and changed files.
4. Report findings first when problems exist.
5. Mark acceptance criteria and Go/No-Go items only when evidence supports them.
6. Promote durable conclusions into `Recent Decisions` when the evidence supports a stable product or architecture decision.
7. Archive the plan only after `PASS` and complete checklists.

## Minimum Plan Mutation

- Set `lifecycle_phase: check`.
- Keep `selected_mode: Plan` unless a tiny validation edit forces `Build`.
- Update Acceptance Criteria and Go/No-Go items only from evidence.
- Set `decision: PASS|BLOCK` explicitly from the validation evidence.

## Command Recipe

- Recover missing plan state with `ensure-plan.mjs`.
- Use `archive-plan.mjs` only after all closeout gates are satisfied.

## Output Contract

Use `../assets/check-report.md` as the shape reference. Keep findings first, evidence explicit, and the final decision unambiguous. The first status line must be a literal `Check: PASS` or `Check: BLOCK` with no formatting around `PASS` or `BLOCK`.
