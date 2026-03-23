# Project Brief

This file is the human-facing dogfood brief for the `kamiflow-core` source repo. Use the client-project template for normal client repos; this file is the source-repo exception.
Keep repo rules in the tracked root `AGENTS.md`. Keep task execution state in `.local/plans/*.md`.
Keep this file curated and durable. Do not copy plan notes, debugging scratch, or temporary observations here.

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
- Guardrail 4: put recurring do/don't lessons here only when they should constrain future work

## Open Questions
- Question 1: which route heuristics still feel too heavy for daily use?
- Question 2: which planner behaviors need stronger evidence or clearer handoff rules before they become decisions or guardrails?

## Recent Decisions
- Decision 1: `AGENTS.md` owns repo rules, `.local/project.md` owns product memory, and `.local/plans/*.md` own execution state
- Decision 2: client repos get a generated local-only `AGENTS.md`, while this source repo keeps its tracked root `AGENTS.md` as the dogfood exception
- Decision 3: durable anti-patterns should be captured as guardrails or settled decisions instead of new project-brief sections
