# Kami Flow CHECK Request

Plan file:
- `.local/plans/<plan-file>.md`

Request:
- Verify current changes against Acceptance Criteria.
- Report findings by severity (highest first).
- Return explicit decision: `PASS` or `BLOCK`.
- Persist check result to plan state.

Output requirements:
- Findings (highest severity first)
- Acceptance Criteria status
- Validation command outcomes
- Decision and next command:
  - `PASS` -> `done`
  - `BLOCK` -> `fix`
