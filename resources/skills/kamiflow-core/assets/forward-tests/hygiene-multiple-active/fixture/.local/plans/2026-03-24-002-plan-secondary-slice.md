---
plan_id: PLAN-2026-03-24-002
title: secondary-slice
status: active
decision: PENDING
selected_mode: Plan
next_mode: Plan
next_command: plan
diagram_mode: auto
updated_at: 2026-03-24T08:00:00.000Z
lifecycle_phase: plan
request_id: fixture-secondary-slice
parent_plan_id: null
archived_at: null
---

## Goal
- Outcome: Provide a second active plan so cleanup reports an orphan active plan.

## Scope (In/Out)
- In: Trigger the multiple-active warning path.
- Out: Any build-ready handoff.

## Constraints
- Technical: Keep the plan structurally valid.
- Risk: None.

## Project Fit
- Relevant priority: Validate active-plan hygiene reporting.
- Relevant guardrail: Only one active non-done plan should exist by default.

## Open Decisions
- [ ] Resolve whether this older plan should be archived or deleted.
- Remaining Count: 1

## Implementation Tasks
- [ ] Resolve the stale secondary slice.

## Acceptance Criteria
- [ ] Only one active plan remains.

## Validation Commands
- `node .agents/skills/kamiflow-core/scripts/cleanup-plans.mjs --project .`

## Go/No-Go Checklist
- [x] Goal is explicit
- [x] Scope in/out is explicit
- [ ] No unresolved high-impact decisions
- [x] Tasks and validation commands are implementation-ready

## WIP Log
- 2026-03-24T08:00:00.000Z - Status: Secondary active slice intentionally left behind.
- 2026-03-24T08:00:00.000Z - Blockers: None.
- 2026-03-24T08:00:00.000Z - Next step: Cleanup should flag this older active plan as an orphan.
