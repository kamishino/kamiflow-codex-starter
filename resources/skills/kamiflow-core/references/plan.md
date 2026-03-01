# Plan

Use this route for non-trivial implementation planning.

## Entry Gate

- Required mode: `Plan`.
- If current mode is not `Plan`, return `MODE_MISMATCH` and stop.

## Steps

1. Define problem and scope boundaries.
2. List constraints and assumptions.
3. Propose implementation approach and affected areas.
4. Define acceptance criteria and validation steps.
5. Split work into ordered tasks.
6. Identify risks and fallback strategy.
7. End with next command: `build`.

## Output

Use `../templates/plan-spec.md` shape.

## Exit Criteria

- Scope, tasks, and acceptance criteria are concrete and testable.
- Final footer includes selected mode and next mode.
