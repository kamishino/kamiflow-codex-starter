---
plan_id: PLAN-2026-03-24-001
title: start-plan-view-shaping
status: active
decision: PENDING
selected_mode: Plan
next_mode: Plan
next_command: plan
diagram_mode: auto
updated_at: 2026-03-24T10:00:00.000Z
lifecycle_phase: start
request_id: fixture-start-plan-view
parent_plan_id: null
archived_at: null
---

## Start Summary
- Required: yes
- Reason: Shape the plan-view request before promoting it into a full implementation slice.
- Selected Idea: Keep the view read-only and helper-backed.
- Alternatives Considered: Expanding the view into a dashboard would add scope.
- Pre-mortem Risk: Turning the read model into a second source of truth.
- Handoff Confidence: 4

## Goal
- Outcome: Shape the read-only plan-view slice into a concrete implementation handoff.
- Out of scope: Building extra plan-view widgets or editing controls.

## Scope (In/Out)
- In: Clarify the helper-backed read model, scope boundaries, and next planning step.
- Out: Any implementation work on the runtime UI itself.

## Constraints
- Technical: Keep `plan-snapshot.mjs` as the only read model for the live view.
- Risk: Avoid pushing an unclear slice into `build`.

## Project Fit
- Relevant priority: Keep the live plan view lightweight and grounded in helper output.
- Relevant guardrail: Do not expand the view beyond the existing read-only screen in this slice.

## Open Decisions
- [ ] Confirm the exact snapshot fields the view needs before the full `plan` handoff.
- Remaining Count: 1

## Handoff
- Next command: plan
- Next mode: Plan

## WIP Log
- 2026-03-24T10:00:00.000Z - Status: Start-lane shaping is in progress for the plan-view slice.
- 2026-03-24T10:00:00.000Z - Blockers: The final field set still needs one explicit planning pass.
- 2026-03-24T10:00:00.000Z - Next step: Promote this into a full `plan` once the open decision is resolved.
