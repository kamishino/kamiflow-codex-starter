# Plan Contract v1

This contract defines when a plan file in `.local/plans/*.md` is ready for each route.

## Location and Privacy

- Plan files live in `.local/plans/`.
- `.local/` is private and gitignored.
- `kfc plan ...` is the client-facing entrypoint; it delegates to `kfp` for plan read/validate/serve.

## Required Frontmatter

All fields must be present and non-placeholder:

- `plan_id`
- `title`
- `status`
- `decision`
- `selected_mode`
- `next_mode`
- `next_command`
- `updated_at`

## Build Readiness Gate

A plan is build-ready only when all are true:

1. `decision: GO`
2. `next_command: build`
3. `next_mode: Build`
4. `Start Summary` gate is satisfied:
   - includes `Required: yes|no`
   - includes non-placeholder `Reason`
   - if `Required: yes`, `Selected Idea` and `Handoff Confidence` are non-placeholder
5. `Open Decisions` has zero unresolved items.
6. `Implementation Tasks` are concrete and file-level.
7. `Acceptance Criteria` are testable.
8. `Validation Commands` are runnable in the current repo.

If any gate fails, do not run `build`; reroute to `plan` or `research`.

## Check Completion Gate

A plan can move to done only when all are true:

1. Completion is 100% (`Implementation Tasks` + `Acceptance Criteria` checklist items are all checked).
2. Validation commands were executed and outcomes recorded.
3. `next_command: done`
4. `next_mode: done`

## Archive Rule for Completed Plans

- After check PASS and done handoff, archive plan file to `.local/plans/done/`.
- Active list should exclude archived plans by default.
- Archived plans remain queryable for history/review.

## Suggested Status Flow

Use this transition order:

1. `draft`
2. `ready`
3. `in_progress`
4. `validated`
5. `done`

## Route-to-Plan Alignment

- `start` route resolves vague requests and produces Start Summary.
- `plan` route updates plan to decision-complete and build-ready.
- `build` route executes only explicitly listed tasks.
- `check` route verifies findings and pass/block against acceptance criteria.
