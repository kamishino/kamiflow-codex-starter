---
plan_id: PLAN-2026-03-23-001
title: small-bug-fix
status: active
decision: GO
selected_mode: Build
next_mode: Build
next_command: build
diagram_mode: auto
updated_at: 2026-03-23T10:00:00.000Z
lifecycle_phase: build
request_id: fixture-small-bug
parent_plan_id: null
archived_at: null
---

## Goal
- Outcome: Fix `math.js` so `add(2, 1)` returns `3` and `add(-2, 1)` returns `-1`.

## Constraints
- Keep evidence-backed claims only.
- Keep the repair limited to the smallest useful slice in `math.js`.
- Use the existing Node ESM setup with no package or script churn.

## Project Fit
- Relevant priority: The fixture is validating a build-ready client-repo repair flow.
- Relevant guardrail: Keep the slice limited to the reported bug and record task state in `.local/plans/*.md`.

## Assumptions
- [x] `check.js` is the authoritative validation for this fixture because it asserts both the positive and negative cases.
- [x] The intended behavior is normal signed addition rather than absolute-value addition.

## Open Decisions
- [x] Keep the repair scoped to `math.js` unless validation shows a broader contract problem.
- Remaining Count: 0

## Implementation Tasks
- [ ] Replace `Math.abs(left) + Math.abs(right)` with signed addition in `math.js`.
- [ ] Run `node check.js` and record whether the repaired slice passes.

## Acceptance Criteria
- [ ] `add(2, 1)` returns `3`.
- [ ] `add(-2, 1)` returns `-1`.
- [ ] No files outside the smallest repair slice need functional changes.

## Validation Commands
- `node check.js`

## Risks & Rollback
- Risk: The fixture might hide a broader arithmetic expectation outside `check.js`, but no other evidence exists in this repo.
- Mitigation: Keep the code change isolated and validate with the provided check file.
- Rollback: Revert only the `math.js` expression if the repair changes confirmed behavior unexpectedly.

## Go/No-Go Checklist
- [x] Goal is explicit
- [x] Scope in/out is explicit
- [x] No unresolved high-impact decisions
- [x] Tasks and validation commands are implementation-ready

## WIP Log
- 2026-03-23T10:00:00.000Z - Status: Build-ready fixture prepared for the small `math.js` repair.
- 2026-03-23T10:00:00.000Z - Blockers: None.
- 2026-03-23T10:00:00.000Z - Next step: Apply the one-line fix, run `node check.js`, then hand off to `check`.
