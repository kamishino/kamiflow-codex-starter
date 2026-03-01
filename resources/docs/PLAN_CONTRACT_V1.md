# Plan Contract v1

This contract defines when a plan file in `.local/plans/*.md` is ready for each route.

## Location and Privacy

- Plan files live in `.local/plans/`.
- `.local/` is private and gitignored.
- `kfp` is the source of truth for reading/validating plan files.

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
4. `Open Decisions` has zero unresolved items.
5. `Implementation Tasks` are concrete and file-level.
6. `Acceptance Criteria` are testable.
7. `Validation Commands` are runnable in the current repo.

If any gate fails, do not run `build`; reroute to `plan` or `research`.

## Check Completion Gate

A plan can move to done only when all are true:

1. In-scope acceptance criteria are completed.
2. Validation commands were executed and outcomes recorded.
3. `next_command: done`
4. `next_mode: done`

## Suggested Status Flow

Use this transition order:

1. `draft`
2. `ready`
3. `in_progress`
4. `validated`
5. `done`

## Route-to-Plan Alignment

- `plan` route updates plan to decision-complete and build-ready.
- `build` route executes only explicitly listed tasks.
- `check` route verifies findings and pass/block against acceptance criteria.
