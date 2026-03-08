# Kami Flow START Request

Topic:
- <idea/problem to explore>

Context:
- Audience: <who this is for>
- Constraints: <time/tech/scope limits>
- Known risks: <optional>

Request:
- Ask 3-5 clarifying questions first (with options).
- Then generate and rank candidate approaches (top 3 is enough).
- Provide one recommended direction.
- Output `START_CONTEXT` for handoff.

Output requirements:
- Include `topic`, `target_user`, `success_30d`, `constraints`, `selected_idea`, `alternatives`, `pre_mortem_risk`, `handoff_confidence`, `recommended_route`.
- End with exact next command for plan.
- Resolve active non-done plan first; create a new plan file (`YYYY-MM-DD-<seq>-start.md`) only when no active plan exists or scope split is explicit.
- Update `WIP Log`.
