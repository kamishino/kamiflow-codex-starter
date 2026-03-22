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
   - rank the 3 tracks in PM-style recommendation cards with `Total Score` (`/10`), `MoSCoW`, `Recommendation`, and `Why now`.
   - keep visible output natural-language and decision-friendly; do not show visible impact/feasibility/effort/confidence sub-score grids unless the user explicitly asks.
   - include one recommended track with rationale plus a short PM takeaway when a first/second/third build order would help.
   - emit `IDEATION_CONTEXT` ... `END_IDEATION_CONTEXT` block for downstream `start`/`plan`.
   - default depth is Balanced unless user explicitly asks for quick/deep.
7. Persist handoff phase by direct markdown mutation:
   - set frontmatter: `lifecycle_phase: research`, `selected_mode: Plan`, `next_command`, `next_mode`, `updated_at`, `route_confidence`, `flow_guardrail`
   - update `WIP Log` lines (`Status`, `Blockers`, `Next step`)
8. Resolve next-step narrative from mutated state.
9. End with concise next-step guidance; do not require verbose response footer fields.

## Command Recipe

- Repo context:
  - use `npm run ...` only when research needs repo-maintainer checks or runtime sync in this KFC repo
- Client context:
  - use `kfc flow ensure-plan --project .` when the active plan is missing during research
  - use `kfc flow ready --project .` when research is really about build-readiness uncertainty
  - if `kfc` is not in PATH but the package is already present, use `npx --no-install kfc ...`
  - if the repo is not yet bootstrapped, use `npx --package @kamishino/kamiflow-codex kfc client install`
- Recovery discipline:
  - when facts are still missing after command recovery, keep the route in `research`; do not jump to repo-only maintainer commands unless the work is actually in the KFC repo

## Output

Provide:

- question list
- evidence summary
- option comparison
- recommended direction

For ideation preset, include:

- Idea Categories (3-5)
- Ranked Top Shortlist (Quick Win, Balanced, Ambitious) with `Total Score`, `MoSCoW`, `Recommendation`, and `Why now`
- PM Takeaway when there is a meaningful build order recommendation
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
