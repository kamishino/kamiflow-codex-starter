# Research

Use this route when missing facts or high risk would make execution unsafe.

## Entry Gate

- Required mode: `Plan`.
- If current mode is not `Plan`, return `MODE_MISMATCH` and stop.
- Route confidence for `research` must be `>=4` before execution.
- If route confidence is `<4`, return `Status: REROUTE` with fallback route (`start|plan|research`) and stop.

## Steps

1. State the open questions blocking implementation.
2. Gather evidence from repo and primary documentation.
3. Compare viable options with tradeoffs.
4. Mark unknown claims as `Unknown` when evidence is insufficient; do not guess.
5. Recommend one option with rationale.
6. Optional ideation preset (for vague feature-discovery/inspiration requests):
   - group ideas into 3-5 categories.
   - provide 2-3 practical ideas per category.
   - produce top 3 shortlist tracks: Quick Win, Balanced, Ambitious.
   - include one recommended track with rationale.
   - emit `IDEATION_CONTEXT` ... `END_IDEATION_CONTEXT` block for downstream `start`/`plan`.
   - default depth is Balanced unless user explicitly asks for quick/deep.
7. Persist handoff phase by direct markdown mutation:
   - set frontmatter: `lifecycle_phase: research`, `selected_mode: Plan`, `next_command`, `next_mode`, `updated_at`
   - update `WIP Log` lines (`Status`, `Blockers`, `Next step`)
8. Resolve next-step narrative from mutated state.
9. End with concise next-step guidance; do not require verbose response footer fields.

## Output

Provide:

- question list
- evidence summary
- option comparison
- recommended direction

For ideation preset, include:

- Idea Categories (3-5)
- Top Shortlist (Quick Win, Balanced, Ambitious)
- IDEATION_CONTEXT block

Example block:

```text
IDEATION_CONTEXT
topic: <one-line topic>
target_user: <primary user>
problem_space: <problem summary>
idea_categories:
  - <category>: <idea1>; <idea2>
top_shortlist:
  - quick_win: <option>
  - balanced: <option>
  - ambitious: <option>
recommended_track: <quick_win|balanced|ambitious>
confidence: <1-5>
END_IDEATION_CONTEXT
```

## Exit Criteria

- Unknowns are reduced enough to continue with plan.
- Unknown claims are explicitly labeled `Unknown`.
- When ideation preset is used, grouped categories + shortlist are present.
- When ideation preset is used, `IDEATION_CONTEXT` block is present.
- Plan file is mutated directly before response is returned.
- Handoff metadata is persisted in plan frontmatter.
