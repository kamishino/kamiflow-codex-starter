# Project Brief

## Product Summary
- Product: A client-repo workflow helper that keeps plan state compact and evidence-backed.
- Primary user: Engineers maintaining shared Codex workflow tooling across arbitrary repos.
- Core outcome: Stable helper-guided plan recovery and release guidance across arbitrary projects.

## Current Priorities
- Priority 1: Stable client install repair across arbitrary projects without repo-specific bootstrap drift.
- Priority 2: Keep helper-backed read models small, predictable, and portable.
- Priority 3: Preserve one active plan and clear archive hygiene by default.

## Architecture Guardrails
- Guardrail 1: Keep retrieval helper snippets bounded to the most relevant sections only.
- Guardrail 2: Use helper-backed reads instead of parsing extra workflow state ad hoc.
- Guardrail 3: Keep archived plans under `.local/plans/done/**`.

## Open Questions
- Question 1: How much retrieval helper detail is enough before the output becomes noisy?
- Question 2: Which prior-plan snippets most reduce repeated planning effort?

## Recent Decisions
- Decision 1: Keep release history guidance in archived PASS plans rather than in repo-level docs.
- Decision 2: Prefer active-plan context over archived history when the query clearly matches the current slice.
