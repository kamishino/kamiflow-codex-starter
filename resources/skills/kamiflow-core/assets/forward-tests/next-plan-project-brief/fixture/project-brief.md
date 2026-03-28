# Project Brief

## Product Summary
- Product: A shared workflow package that helps client repos recover plan state safely.
- Primary user: Maintainers who need stable repo-memory and plan recovery.
- Core outcome: Suggest the next slice without inventing work that the repo has not signaled.

## Current Priorities
- Priority 1: Add safer recovery signals for preserved client repo memory.
- Priority 2: Keep next-step helpers read-only and evidence-backed.
- Priority 3: Reduce friction when no active plan exists.

## Architecture Guardrails
- Guardrail 1: Preserve existing repo memory files unless the user explicitly rewrites them.
- Guardrail 2: Keep helpers deterministic and small.
- Guardrail 3: Prefer read models before mutation.

## Open Questions
- Question 1: How should next-plan guidance distinguish between setup drift and real product follow-up work?
- Question 2: Which read-only helper output is easiest for maintainers to trust at a glance?

## Recent Decisions
- Decision 1: Conservative automation is preferred over silent smart rewriting.
- Decision 2: Missing runtime state may be created, but existing memory files stay authoritative.
