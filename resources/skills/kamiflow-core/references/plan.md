# Plan

Use this route for non-trivial planning before implementation.
This route should leave no major ambiguity for the build phase.

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
2. If `START_CONTEXT` is present:
   - consume it directly
   - do not re-ask baseline clarification questions.
3. If `START_CONTEXT` is not present and 2+ core fields are missing, require `start` first and do not proceed to build-ready handoff.
4. Resolve target plan file using this exact order:
   1. user-provided file path
   2. active draft/ready plan
   3. `kfc flow ensure-plan --project .`, then capture `plan_path` from JSON output
5. If no target file can be resolved, return `BLOCK` using this format:
   - `Status: BLOCK`
   - `Reason: <single concrete cause>`
   - `Recovery: kfc flow ensure-plan --project .`
   - `Expected: {"ok":true,"plan_path":"<absolute-path>",...}`
6. Define problem and scope boundaries.
7. List constraints and assumptions.
8. Propose implementation approach and affected areas.
9. Define acceptance criteria and validation steps.
10. Split work into ordered file-level tasks.
11. Identify risks and fallback strategy.
12. Resolve high-impact open decisions before handoff.
13. Ensure `Start Summary` is present in plan file and non-placeholder:
   - if request is vague -> `Required: yes` with concrete values
   - if not vague -> `Required: no` with clear reason
14. Verify build-readiness checklist (binary gates):
   - scope is explicit
   - implementation tasks are concrete and file-level
   - acceptance criteria are testable
   - validation commands are runnable
   - no unresolved high-impact open decisions remain
   - Start Summary fields are non-placeholder
15. Set plan handoff metadata for build readiness:
   - `decision: GO`
   - `next_command: build`
   - `next_mode: Build`
16. Persist plan phase/handoff update via deterministic command:
   - `kfc flow apply --project . --plan <plan_id> --route plan --result go`
17. Resolve next-step narrative after persistence:
   - `kfc flow next --project . --plan <plan_id> --style narrative`
18. End with narrative next action and machine footer (`Next Command: build`, `Next Mode: Build`).

## Output

Use `../templates/plan-spec.md` shape.
When blocked, use the required BLOCK format from Step 5.
When ready, final footer must include:

- `Selected Mode: Plan`
- `Next Command: build`
- `Next Mode: Build`
- include `Next Action: <narrative>` immediately before footer

## Exit Criteria

- Scope, tasks, and acceptance criteria are concrete and testable.
- `START_CONTEXT` handoff is consumed when provided.
- A concrete target plan file is created/resolved before planning output.
- Start Summary is present and consistent with request clarity.
- No unresolved high-impact open decisions remain.
- Validation commands are concrete and runnable.
- Ready output includes `decision: GO`, `next_command: build`, and `next_mode: Build`.
- Final footer includes selected mode and next mode.
