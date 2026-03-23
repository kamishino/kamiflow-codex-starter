# Check

Use this route to verify behavior, review changes, and decide `PASS` or `BLOCK`. Client repos are the default target; the kamiflow-core source repo is the source-repo exception and should be reviewed in maintainer context.

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
4. If the active plan still contains placeholder `Goal`, `Project Fit`, `Implementation Tasks`, `Acceptance Criteria`, or `Validation Commands` text, block closeout and send the slice back through planning instead of pretending it was build-ready.
4. Report findings first when problems exist.
5. Mark acceptance criteria and Go/No-Go items only when evidence supports them.
6. Promote durable conclusions into existing `.local/project.md` sections only: use `Architecture Guardrails` for repeatable future constraints, `Recent Decisions` for settled evidence-backed conclusions, and `Open Questions` for unresolved recurring concerns.
7. Keep temporary debugging notes, one-off findings, and plan-local execution detail out of `.local/project.md`.
8. If `AGENTS.md` enables `SemVer Workflow`, finalize `## Release Impact` before `PASS` archive.
9. After closeout evidence is complete, use `node .agents/skills/kamiflow-core/scripts/finish-status.mjs --project .` to decide whether the next action is `commit-only`, `release-only`, or `commit-and-release`.
10. Use `commit please` for functional commit only, `release please` for release closeout only, and `finish please` when the user wants Codex to choose the right final action from helper-backed repo state.
11. Run `node .agents/skills/kamiflow-core/scripts/version-closeout.mjs --project .` only when finish guidance says release is still pending and the final impact is `patch`, `minor`, or `major`.
12. Archive the plan only after `PASS`, complete checklists, and any required SemVer release-impact resolution.

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
