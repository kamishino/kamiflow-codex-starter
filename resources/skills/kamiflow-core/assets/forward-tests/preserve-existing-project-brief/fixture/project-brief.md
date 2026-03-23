# Project Brief

This file is pre-existing client project memory and should be preserved as-is.

## Product Summary
- Product: existing brief fixture
- Primary user: a client team
- Core outcome: confirm kamiflow-core install does not overwrite human project memory

## Current Priorities
- Priority 1: preserve this brief during install
- Priority 2: keep local workflow state bootstrapped
- Priority 3: allow follow-up planning work

## Architecture Guardrails
- Guardrail 1: user-authored project memory wins over templates
- Guardrail 2: runtime metadata belongs under `.agents/skills/kamiflow-core/`
- Guardrail 3: install should be safe to rerun

## Open Questions
- Question 1: none for this fixture
- Question 2: none for this fixture

## Recent Decisions
- Decision 1: this fixture should survive install unchanged
- Decision 2: the generated template must not replace existing project memory
