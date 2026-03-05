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
   2. active non-done plan
   3. create a new plan file directly from template only when no active plan exists or scope split is explicit
5. If no target file can be resolved, return `BLOCK` using this format:
   - `Status: BLOCK`
   - `Reason: <single concrete cause>`
   - `Recovery: create .local/plans/<date-seq>-plan.md from template`
   - `Expected: plan markdown exists and is writable`
6. Define problem and scope boundaries.
7. List constraints and assumptions.
8. Propose implementation approach and affected areas.
9. Define acceptance criteria and validation steps.
10. Split work into ordered file-level tasks.
11. Identify risks and fallback strategy.
12. Resolve high-impact open decisions before handoff.
13. Ensure `Technical Solution Diagram` section exists and is populated:
   - heading: `## Technical Solution Diagram`
   - include a ```mermaid block representing chosen solution logic
   - if section is missing, add it before build handoff
14. Ensure `Start Summary` is present in plan file and non-placeholder:
   - if request is vague -> `Required: yes` with concrete values
   - if not vague -> `Required: no` with clear reason
15. Verify build-readiness checklist (binary gates):
   - scope is explicit
   - implementation tasks are concrete and file-level
   - acceptance criteria are testable
   - validation commands are runnable
   - no unresolved high-impact open decisions remain
   - Technical Solution Diagram section exists with Mermaid content
   - Start Summary fields are non-placeholder
16. Set plan handoff metadata for build readiness:
   - `decision: GO`
   - `next_command: build`
   - `next_mode: Build`
17. Persist plan phase/handoff update by direct markdown mutation:
   - frontmatter: `lifecycle_phase: plan`, `selected_mode: Plan`, `decision`, `next_command`, `next_mode`, `updated_at`
   - sections: ensure `Technical Solution Diagram` block remains present
   - `WIP Log`: `Status`, `Blockers`, `Next step`
18. Resolve next-step narrative from mutated frontmatter and checklist state.
19. End with concise next-step guidance; do not require verbose response footer fields.
20. Final response should use compact guidance shape:
   - `State`: current phase + readiness
   - `Doing`: current planning slice
   - `Next`: one concrete next action

## Route Output Contract

- Return compact guidance shape with:
  - `State`
  - `Doing`
  - `Next`
- When blocked, use strict BLOCK format before compact guidance.

## Evidence Contract

- Planning claims (scope readiness, feasibility, completeness) must map to actual plan markdown content.
- If any required gate cannot be proven from plan content, mark it `Unknown` and block handoff.

## Output

Use `../templates/plan-spec.md` shape.
When blocked, use the required BLOCK format from Step 5.
When ready, ensure handoff fields are persisted in plan frontmatter (`decision: GO`, `next_command: build`, `next_mode: Build`).

## Exit Criteria

- Scope, tasks, and acceptance criteria are concrete and testable.
- `START_CONTEXT` handoff is consumed when provided.
- A concrete active plan file is resolved (or created only when required) before planning output.
- Start Summary is present and consistent with request clarity.
- No unresolved high-impact open decisions remain.
- Validation commands are concrete and runnable.
- Ready output includes `decision: GO`, `next_command: build`, and `next_mode: Build`.
- Plan file is mutated directly before response is returned.
- Handoff metadata is persisted in plan frontmatter.
