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
4. Ensure a concrete target plan file exists before writing plan content:
   - If user provided file path, use it.
   - Else if an active draft/ready plan exists, select it.
   - Else run `kfc plan init --project <path> --new` and capture created file path from `[kfp] Created template:`.
   - If no target file can be resolved, return `BLOCK` with exact recovery command.
5. Define problem and scope boundaries.
6. List constraints and assumptions.
7. Propose implementation approach and affected areas.
8. Define acceptance criteria and validation steps.
9. Split work into ordered tasks.
10. Identify risks and fallback strategy.
11. Resolve high-impact open decisions before handoff.
12. Ensure `Start Summary` is present in plan file:
   - if request is vague -> `Required: yes` with concrete values
   - if not vague -> `Required: no` with clear reason
13. Set plan handoff metadata for build readiness:
   - `decision: GO`
   - `next_command: build`
   - `next_mode: Build`
14. End with next command: `build`.

## Output

Use `../templates/plan-spec.md` shape.

## Exit Criteria

- Scope, tasks, and acceptance criteria are concrete and testable.
- `START_CONTEXT` handoff is consumed when provided.
- A concrete target plan file is created/resolved before planning output.
- Start Summary is present and consistent with request clarity.
- No unresolved high-impact open decisions remain.
- Validation commands are concrete and runnable.
- Final footer includes selected mode and next mode.
