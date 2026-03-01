# Command Map

## Route Selection

Select exactly one route.

1. `start`
- Triggers: new idea, vague concept, "thinking about building", "what should we build".
- Output: start report.
- Next: `plan` or `build` or `research`.

2. `plan`
- Triggers: feature request, refactor proposal, multi-file change, unclear requirements.
- Output: implementation plan spec.
- Next: `build`.

3. `build`
- Triggers: approved plan exists, user asks to implement now.
- Output: implementation action plan + validation checklist.
- Next: `check`.

4. `check`
- Triggers: review request, "is this good", "verify changes".
- Output: findings-first check report with pass/block.
- Next: `fix` or done.

5. `research`
- Triggers: unknown domain, risky change, unclear constraints, missing facts.
- Output: research brief with decision recommendation.
- Next: `plan` or `start`.

6. `fix`
- Triggers: targeted bug, regression, failing test, specific issue.
- Output: fix execution plan and risk note.
- Next: `check`.

## Escalation Rules

- If risk includes auth, billing, data migration, or permissions, prefer `research` then `plan`.
- If change scope grows beyond initial assumptions, pause and reroute to `plan`.
