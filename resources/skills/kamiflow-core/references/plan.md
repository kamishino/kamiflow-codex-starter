# Plan

Use this route for non-trivial implementation planning.

## Entry Gate

- Required mode: `Plan`.
- If current mode is not `Plan`, return `MODE_MISMATCH` and stop.

## Steps

1. Evaluate request clarity using core fields:
   - Goal
   - Scope (In/Out)
   - Implementation Tasks
   - Acceptance Criteria
   - Validation Commands
2. If 2+ core fields are missing, require `start` first and do not proceed to build-ready handoff.
3. If `START_CONTEXT` is present, consume it directly and do not re-ask baseline clarification questions.
4. Define problem and scope boundaries.
5. List constraints and assumptions.
6. Propose implementation approach and affected areas.
7. Define acceptance criteria and validation steps.
8. Split work into ordered tasks.
9. Identify risks and fallback strategy.
10. Resolve high-impact open decisions before handoff.
11. Ensure `Start Summary` is present in plan file:
   - if request is vague -> `Required: yes` with concrete values
   - if not vague -> `Required: no` with clear reason
12. Set plan handoff metadata for build readiness:
   - `decision: GO`
   - `next_command: build`
   - `next_mode: Build`
13. End with next command: `build`.

## Output

Use `../templates/plan-spec.md` shape.

## Exit Criteria

- Scope, tasks, and acceptance criteria are concrete and testable.
- `START_CONTEXT` handoff is consumed when provided.
- Start Summary is present and consistent with request clarity.
- No unresolved high-impact open decisions remain.
- Validation commands are concrete and runnable.
- Final footer includes selected mode and next mode.
