# Project Brief

This file is the human-facing dogfood brief for the `kamiflow-core` source repo.
Keep repo rules in the tracked root `AGENTS.md`. Keep task execution state in `.local/plans/*.md`.

## Product Summary
- Product: `kamiflow-core`
- Primary user: maintainers developing and validating the standalone Codex skill
- Core outcome: a client-repo-first skill that plans well, scales cleanly, and works smoothly with Codex

## Current Priorities
- Priority 1: improve daily route intelligence for real client-repo work
- Priority 2: keep runtime install and repair behavior stable across arbitrary projects
- Priority 3: prove changes with validation plus forward-test coverage before closeout

## Architecture Guardrails
- Guardrail 1: keep `resources/skills/kamiflow-core/` as the only tracked source of truth
- Guardrail 2: treat `.agents/skills/kamiflow-core/` and `.local/*` as generated runtime state
- Guardrail 3: keep client-repo behavior primary and source-repo dogfood behavior maintainer-only

## Open Questions
- Question 1: which route heuristics still feel too heavy for daily use?
- Question 2: which planner behaviors need stronger evidence or clearer handoff rules?

## Recent Decisions
- Decision 1: `AGENTS.md` owns repo rules, `.local/project.md` owns product memory, and `.local/plans/*.md` own execution state
- Decision 2: client repos get a generated local-only `AGENTS.md`, while this source repo keeps its tracked root `AGENTS.md`
