---
plan_id: PLAN-2026-03-23-001
title: "impact required fixture"
status: in_progress
decision: PASS
selected_mode: Plan
next_mode: Check
next_command: check
diagram_mode: auto
updated_at: 2026-03-23T10:00:00.000Z
lifecycle_phase: check
request_id: fixture-impact-required
parent_plan_id: null
archived_at: null
---

## Goal
- Outcome: Prove archive blocks when Release Impact is missing in an opted-in repo.

## Constraints
- Technical: Leave Release Impact out on purpose.

## Project Fit
- Relevant priority: Fixture validation.
- Relevant guardrail: Opted-in repos must resolve release impact before archive.

## Assumptions
- [x] Archive should fail until Release Impact is resolved.

## Open Decisions
- [x] None.
- Remaining Count: 0

## Implementation Tasks
- [x] Fixture task completed.

## Acceptance Criteria
- [x] Fixture acceptance complete.

## Validation Commands
- `node .agents/skills/kamiflow-core/scripts/archive-plan.mjs --project .`

## Risks & Rollback
- Risk: Fixture drift.
- Mitigation: Keep it explicit.
- Rollback: Replace the fixture.

## Go/No-Go Checklist
- [x] Goal is explicit
- [x] Scope in/out is explicit
- [x] No unresolved high-impact decisions
- [x] Tasks and validation commands are implementation-ready

## WIP Log
- 2026-03-23T10:00:00.000Z - Status: Ready for archive-block smoke.
- 2026-03-23T10:00:00.000Z - Blockers: Release Impact intentionally missing.
- 2026-03-23T10:00:00.000Z - Next step: Archive should block.
