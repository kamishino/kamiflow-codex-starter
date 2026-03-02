# Kami Flow BUILD Request

Plan file:
- `.local/plans/<plan-file>.md`

Execution scope:
- Task(s): <Task 1 only | Tasks 2-3 | remaining tasks>

Constraints:
- Implement only selected task scope.
- No destructive git commands.
- Keep guidance client-facing via `kfc`.

Request:
- List planned file-level actions first.
- Implement only scoped changes.
- Run targeted validation commands.
- Persist build result to plan state.

Output requirements:
- Planned changes
- Executed changes
- Validation outcomes
- Known limitations
- Next handoff to `check`
